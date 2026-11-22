// EcoDispensa per Alexa.
//
//  POST /functions/v1/alexa         → richieste della skill (firmate da Amazon)
//  POST /functions/v1/alexa/token   → collegamento account (OAuth: codice → token, rinnovo token)
//
// Segreti (Supabase → Edge Functions → Secrets):
//  ALEXA_CLIENT_SECRET  la stessa "Your Secret" scritta nella console Alexa (Account Linking)
//  ALEXA_SKILL_ID       facoltativo: se manca vale quello qui sotto
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import * as x509 from "npm:@peculiar/x509@1.12.3";

const SKILL_ID = Deno.env.get("ALEXA_SKILL_ID") || "amzn1.ask.skill.8734eb10-5bc7-4194-9a3d-767fa4dddeaa";
const CLIENT_ID = "ecodispensa-alexa";
const ACCESS_TTL = 3600; // secondi: poi Alexa lo rinnova da sola

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
x509.cryptoProvider.set(crypto);

// ---------------------------------------------------------------- utilità

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)).buffer);

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

/** Confronto a tempo costante */
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

// ---------------------------------------------------------------- collegamento account (token)

async function tokenEndpoint(req: Request) {
  const form = new URLSearchParams(await req.text());
  let clientId = form.get("client_id") ?? "";
  let clientSecret = form.get("client_secret") ?? "";
  const basic = req.headers.get("authorization");
  if (basic?.toLowerCase().startsWith("basic ")) {
    try {
      const [id, ...rest] = atob(basic.slice(6).trim()).split(":");
      clientId = decodeURIComponent(id);
      clientSecret = decodeURIComponent(rest.join(":"));
    } catch {
      /* intestazione non valida */
    }
  }
  const secret = Deno.env.get("ALEXA_CLIENT_SECRET") ?? "";
  if (!secret || clientId !== CLIENT_ID || !safeEqual(clientSecret, secret)) {
    return json({ error: "invalid_client" }, 401);
  }

  const grant = form.get("grant_type");
  let userId: string | null = null;
  let refresh: string | null = null;

  if (grant === "authorization_code") {
    const code = form.get("code") ?? "";
    const { data } = await db
      .from("alexa_auth_codes")
      .delete()
      .eq("code_hash", await sha256(code))
      .select("user_id, redirect_uri, expires_at")
      .maybeSingle();
    if (!data || new Date(data.expires_at).getTime() < Date.now()) return json({ error: "invalid_grant" }, 400);
    const redirect = form.get("redirect_uri");
    if (redirect && redirect !== data.redirect_uri) return json({ error: "invalid_grant" }, 400);
    userId = data.user_id;
    refresh = randomToken();
    const access = randomToken();
    const { error } = await db.from("alexa_tokens").insert({
      user_id: userId,
      access_hash: await sha256(access),
      refresh_hash: await sha256(refresh),
      access_expires_at: new Date(Date.now() + ACCESS_TTL * 1000).toISOString(),
    });
    if (error) return json({ error: "server_error" }, 500);
    return json({ access_token: access, token_type: "bearer", expires_in: ACCESS_TTL, refresh_token: refresh });
  }

  if (grant === "refresh_token") {
    refresh = form.get("refresh_token") ?? "";
    const access = randomToken();
    // il token di rinnovo resta lo stesso: se Alexa riprova con quello vecchio funziona ancora
    const { data } = await db
      .from("alexa_tokens")
      .update({ access_hash: await sha256(access), access_expires_at: new Date(Date.now() + ACCESS_TTL * 1000).toISOString() })
      .eq("refresh_hash", await sha256(refresh))
      .select("id")
      .maybeSingle();
    if (!data) return json({ error: "invalid_grant" }, 400);
    return json({ access_token: access, token_type: "bearer", expires_in: ACCESS_TTL, refresh_token: refresh });
  }

  return json({ error: "unsupported_grant_type" }, 400);
}

// ---------------------------------------------------------------- firma delle richieste di Amazon

const certCache = new Map<string, { leaf: x509.X509Certificate; key: CryptoKey; until: number }>();

function certUrlOk(raw: string) {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+/g, "/");
    // normalizzo i "../": il percorso deve restare dentro /echo.api/
    const norm = new URL(path, "https://x").pathname;
    return (
      u.protocol === "https:" &&
      u.hostname.toLowerCase() === "s3.amazonaws.com" &&
      (u.port === "" || u.port === "443") &&
      norm.startsWith("/echo.api/")
    );
  } catch {
    return false;
  }
}

async function verifyAmazon(req: Request, body: string): Promise<string | null> {
  const certUrl = req.headers.get("signaturecertchainurl") ?? "";
  const signature = req.headers.get("signature-256") ?? "";
  if (!certUrl || !signature) return "firma mancante";
  if (!certUrlOk(certUrl)) return "url del certificato non valido";

  let entry = certCache.get(certUrl);
  if (!entry || entry.until < Date.now()) {
    const r = await fetch(certUrl);
    if (!r.ok) return "certificato non scaricabile";
    const pem = await r.text();
    const certs = pem
      .split("-----END CERTIFICATE-----")
      .filter((p) => p.includes("-----BEGIN CERTIFICATE-----"))
      .map((p) => new x509.X509Certificate(p.trim() + "\n-----END CERTIFICATE-----"));
    if (!certs.length) return "certificato vuoto";
    const leaf = certs[0];
    // la catena: ogni certificato firmato dal successivo
    for (let i = 0; i < certs.length - 1; i++) {
      const ok = await certs[i].verify({ publicKey: certs[i + 1].publicKey, signatureOnly: true });
      if (!ok) return "catena non valida";
    }
    const san = leaf.getExtension(x509.SubjectAlternativeNameExtension);
    const sanText = JSON.stringify(san?.names?.toJSON?.() ?? []);
    if (!sanText.includes("echo-api.amazon.com")) return "certificato non di Alexa";
    const key = await leaf.publicKey.export({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, ["verify"]);
    entry = { leaf, key, until: Date.now() + 3600_000 };
    certCache.set(certUrl, entry);
  }
  const now = new Date();
  if (now < entry.leaf.notBefore || now > entry.leaf.notAfter) return "certificato scaduto";

  const sig = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", entry.key, sig, new TextEncoder().encode(body));
  return ok ? null : "firma non valida";
}

// ---------------------------------------------------------------- risposte di Alexa

type Out = { text: string; reprompt?: string; end?: boolean; linkAccount?: boolean; card?: { title: string; content: string } };

const alexaResponse = (o: Out) =>
  json({
    version: "1.0",
    response: {
      outputSpeech: { type: "PlainText", text: o.text },
      ...(o.reprompt ? { reprompt: { outputSpeech: { type: "PlainText", text: o.reprompt } } } : {}),
      ...(o.linkAccount ? { card: { type: "LinkAccount" } } : o.card ? { card: { type: "Simple", ...o.card } } : {}),
      shouldEndSession: o.end ?? true,
    },
  });

const ask = (text: string, reprompt = "Cosa vuoi fare?"): Out => ({ text: `${text} ${reprompt}`, reprompt, end: false });

// ---------------------------------------------------------------- testi

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9,.' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "a, b e c" */
const listIt = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);

const lower = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

const romeToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
const daysLeft = (iso: string | null) => {
  if (!iso) return null;
  return Math.round((Date.parse(iso) - Date.parse(romeToday())) / 86_400_000);
};

const UNIT_WORD: Record<string, [string, string]> = {
  g: ["grammo", "grammi"],
  kg: ["chilo", "chili"],
  l: ["litro", "litri"],
  ml: ["millilitro", "millilitri"],
  cl: ["centilitro", "centilitri"],
  pz: ["pezzo", "pezzi"],
};
const numIt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("it-IT", { maximumFractionDigits: 2 });
const qtyIt = (n: number, unit: string) => {
  const w = UNIT_WORD[unit] ?? [unit, unit];
  return `${numIt(n)} ${n === 1 ? w[0] : w[1]}`;
};

// ---------------------------------------------------------------- quantità dette a voce

const WORD_NUM: Record<string, number> = {
  un: 1, uno: 1, una: 1, "un'": 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
  undici: 11, dodici: 12, quindici: 15, venti: 20, trenta: 30, quaranta: 40, cinquanta: 50, cento: 100, centocinquanta: 150,
  duecento: 200, duecentocinquanta: 250, trecento: 300, quattrocento: 400, cinquecento: 500, seicento: 600, settecento: 700,
  ottocento: 800, novecento: 900, mille: 1000, mezzo: 0.5, mezza: 0.5,
};
const UNIT_OF: Record<string, [string, number]> = {
  g: ["g", 1], gr: ["g", 1], grammo: ["g", 1], grammi: ["g", 1], etto: ["g", 100], etti: ["g", 100],
  kg: ["kg", 1], chilo: ["kg", 1], chili: ["kg", 1], chilogrammi: ["kg", 1], chilogrammo: ["kg", 1],
  l: ["l", 1], litro: ["l", 1], litri: ["l", 1], ml: ["ml", 1], millilitri: ["ml", 1], cl: ["cl", 1], centilitri: ["cl", 1],
  bicchiere: ["ml", 200], bicchieri: ["ml", 200], tazza: ["ml", 250], tazze: ["ml", 250],
  pezzo: ["pz", 1], pezzi: ["pz", 1], confezione: ["pz", 1], confezioni: ["pz", 1], pacco: ["pz", 1], pacchi: ["pz", 1],
  vasetto: ["pz", 1], vasetti: ["pz", 1], bottiglia: ["pz", 1], bottiglie: ["pz", 1], scatola: ["pz", 1], scatole: ["pz", 1],
  barattolo: ["pz", 1], barattoli: ["pz", 1], fetta: ["pz", 1], fette: ["pz", 1],
};
const ARTICLES = /^(?:(?:il|lo|la|i|gli|le|un|uno|una|del|dello|della|dei|degli|delle|di|dal|dalla)\s+|(?:l|un|dell|d|dall)'\s*)/;

type Said = { name: string; amount: number | null; unit: string | null; fraction: number | null };

/** "300 grammi di pasta", "due uova", "metà del latte", "il latte" → nome, quantità, unità o frazione */
function parsePart(raw: string): Said | null {
  let s = norm(raw).replace(/^(ho|abbiamo)\s+/, "").replace(/^(usato|usata|usati|usate|finito|finita|finiti|finite|buttato|buttata|buttati|buttate|mangiato|consumato|preso)\s+/, "");
  s = s.replace(/^(anche|poi)\s+/, "");
  let fraction: number | null = null;
  const fr = s.match(/^(meta|un quarto|tre quarti|quasi tutt[oaie]|tutt[oaie])\s+/);
  if (fr) {
    const f = fr[1];
    fraction = f === "meta" ? 0.5 : f === "un quarto" ? 0.25 : f === "tre quarti" ? 0.75 : f.startsWith("quasi") ? 0.8 : 1;
    s = s.slice(fr[0].length);
  }
  let amount: number | null = null;
  let unit: string | null = null;
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*/);
  if (m) {
    amount = parseFloat(m[1].replace(",", "."));
    s = s.slice(m[0].length);
  } else {
    const w = s.split(" ")[0];
    if (w in WORD_NUM && !(["un", "uno", "una", "un'"].includes(w) && !s.split(" ")[1])) {
      amount = WORD_NUM[w];
      s = s.slice(w.length).trim();
      // "un etto e mezzo" non lo gestiamo; "mezzo chilo" sì
    }
  }
  const u = s.split(" ")[0];
  if (u in UNIT_OF) {
    const [uu, mult] = UNIT_OF[u];
    unit = uu;
    amount = (amount ?? 1) * mult;
    s = s.slice(u.length).trim();
  } else if (amount !== null) {
    unit = "pz";
  }
  for (let k = 0; k < 3; k++) s = s.replace(ARTICLES, "");
  s = s.replace(/\s+(che|perche|ormai).*$/, "").trim();
  if (s.length < 2) return null;
  return { name: s, amount, unit, fraction };
}

const splitParts = (text: string) =>
  norm(text)
    .split(/\s*,\s*|\s+e\s+|\s+poi\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

// ---------------------------------------------------------------- dispensa

type Item = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expiry_date: string | null;
  category: string | null;
  price_cents: number | null;
  price_qty: number | null;
};

const stem = (w: string) => (w.length > 3 ? w.replace(/[aeio]$/, "") : w);

/** Quanto un prodotto della dispensa somiglia a quello detto (0 = per niente) */
function matchScore(said: string, name: string) {
  const a = norm(said).split(" ").filter((w) => w.length > 1).map(stem);
  const b = norm(name).split(" ").filter((w) => w.length > 1).map(stem);
  if (!a.length || !b.length) return 0;
  let hit = 0;
  for (const w of a) if (b.some((x) => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x))))) hit++;
  if (!hit) return 0;
  // tutte le parole dette trovate, e il primo nome del prodotto conta di più
  return hit / a.length + (b[0] === a[0] ? 0.5 : 0) - b.length * 0.01;
}

function findItem(items: Item[], said: string): Item | null {
  let best: Item | null = null;
  let bestScore = 0.5;
  const byExpiry = [...items].sort((x, y) => (x.expiry_date ?? "9999").localeCompare(y.expiry_date ?? "9999"));
  for (const it of byExpiry) {
    const sc = matchScore(said, it.name);
    if (sc > bestScore) {
      best = it;
      bestScore = sc;
    }
  }
  return best;
}

const BASE: Record<string, [string, number]> = { g: ["w", 1], kg: ["w", 1000], ml: ["v", 1], cl: ["v", 10], l: ["v", 1000] };
const unitKey = (u: string) => {
  const k = (u || "").trim().toLowerCase();
  if (["gr", "grammi"].includes(k)) return "g";
  if (["lt", "litri", "litro"].includes(k)) return "l";
  if (["", "pezzi", "n"].includes(k)) return "pz";
  return k;
};
function convert(qty: number, from: string, to: string): number | null {
  const f = unitKey(from);
  const t = unitKey(to);
  if (f === t) return qty;
  const bf = BASE[f];
  const bt = BASE[t];
  if (!bf || !bt || bf[0] !== bt[0]) return null;
  return (qty * bf[1]) / bt[1];
}

const valueOf = (it: Item, used: number) => {
  if (it.price_cents == null) return null;
  if (!it.price_qty || it.price_qty <= 0) return it.price_cents;
  return Math.max(0, Math.round((it.price_cents * Math.min(used, it.price_qty)) / it.price_qty));
};

async function loadPantry(householdId: string): Promise<Item[]> {
  const { data } = await db
    .from("pantry_items")
    .select("id, name, quantity, unit, expiry_date, category, price_cents, price_qty")
    .eq("household_id", householdId);
  return (data ?? []).map((r: any) => ({ ...r, quantity: Number(r.quantity ?? 0), price_qty: r.price_qty == null ? null : Number(r.price_qty) }));
}

/** "Ho usato…" / "Ho buttato…": scala dalla dispensa e registra nelle statistiche */
async function takeFromPantry(userId: string, householdId: string, text: string, outcome: "consumed" | "wasted"): Promise<Out> {
  const items = await loadPantry(householdId);
  if (!items.length) return { text: "La tua dispensa è vuota: aggiungi i prodotti dall'app." };
  const parts = splitParts(text).map(parsePart).filter((p): p is Said => !!p);
  if (!parts.length) return ask("Non ho capito quale prodotto. Prova a dire: ho usato 300 grammi di pasta.", "Cosa hai usato?");

  const done: string[] = [];
  const missing: string[] = [];
  const left = new Map(items.map((i) => [i.id, i.quantity]));
  const events: any[] = [];

  for (const p of parts) {
    const it = findItem(items.filter((i) => (left.get(i.id) ?? 0) > 0), p.name);
    if (!it) {
      missing.push(p.name);
      continue;
    }
    const have = left.get(it.id) ?? it.quantity;
    let used = have;
    if (p.fraction !== null && p.fraction < 1) {
      used = have * p.fraction;
      if (unitKey(it.unit) === "pz" && have >= 2) used = Math.max(1, Math.round(used));
    } else if (p.amount !== null && p.unit) {
      const c = convert(p.amount, p.unit, it.unit);
      if (c !== null && c > 0) {
        used = Math.min(have, c);
      }
    }
    const rest = Math.max(0, parseFloat((have - used).toFixed(3)));
    left.set(it.id, rest);
    events.push({
      user_id: userId,
      item_name: it.name,
      category: it.category,
      quantity: used,
      unit: it.unit,
      outcome,
      value_cents: valueOf(it, used),
    });
    const n = lower(it.name);
    if (rest <= 0.0001) done.push(outcome === "wasted" ? `${n} buttato` : `${n} finito`);
    else done.push(`${n}: ne restano ${qtyIt(rest, unitKey(it.unit))}`);
  }

  for (const it of items) {
    const rest = left.get(it.id)!;
    if (rest === it.quantity) continue;
    if (rest <= 0.0001) await db.from("pantry_items").delete().eq("id", it.id);
    else await db.from("pantry_items").update({ quantity: rest }).eq("id", it.id);
  }
  if (events.length) await db.from("pantry_events").insert(events);

  const sentences: string[] = [];
  if (done.length) sentences.push(`Fatto. ${done.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(". ")}.`);
  if (missing.length) sentences.push(`Non trovo in dispensa: ${listIt(missing)}.`);
  return { text: sentences.join(" "), card: { title: "Dispensa aggiornata", content: sentences.join("\n") } };
}

async function addToShopping(userId: string, householdId: string, text: string): Promise<Out> {
  const parts = splitParts(text).map(parsePart).filter((p): p is Said => !!p);
  if (!parts.length) return ask("Cosa aggiungo alla lista della spesa?", "Dimmi per esempio: aggiungi il pane alla lista della spesa.");
  const { data: existing } = await db.from("shopping_items").select("name").eq("household_id", householdId).eq("is_checked", false);
  const have = new Set((existing ?? []).map((r: any) => norm(r.name)));
  const added: string[] = [];
  const already: string[] = [];
  const rows: any[] = [];
  for (const p of parts) {
    const name = p.name.charAt(0).toUpperCase() + p.name.slice(1);
    if (have.has(norm(name))) {
      already.push(p.name);
      continue;
    }
    have.add(norm(name));
    rows.push({
      user_id: userId,
      name,
      category: "Altro",
      quantity: p.amount !== null && p.unit ? p.amount : null,
      unit: p.amount !== null && p.unit ? p.unit : null,
    });
    added.push(p.name);
  }
  if (rows.length) await db.from("shopping_items").insert(rows);
  const s: string[] = [];
  if (added.length) s.push(`Ho aggiunto ${listIt(added)} alla lista della spesa.`);
  if (already.length) s.push(`${listIt(already)} ${already.length === 1 ? "c'era già" : "c'erano già"}.`);
  return { text: s.join(" ") };
}

/** Prodotti scaduti e da usare entro 3 giorni, in una frase */
function expiringSentence(items: Item[], max = 6): { text: string; names: string[] } {
  const withDays = items
    .map((i) => ({ i, d: daysLeft(i.expiry_date) }))
    .filter((x): x is { i: Item; d: number } => x.d !== null && x.d <= 3)
    .sort((a, b) => a.d - b.d);
  if (!withDays.length) return { text: "", names: [] };
  const pick = (f: (d: number) => boolean) => withDays.filter((x) => f(x.d)).map((x) => lower(x.i.name));
  const groups: Array<[string, string, string[]]> = [
    ["È già scaduto", "Sono già scaduti", pick((d) => d < 0)],
    ["Scade oggi", "Scadono oggi", pick((d) => d === 0)],
    ["Scade domani", "Scadono domani", pick((d) => d === 1)],
    ["Da usare nei prossimi giorni", "Da usare nei prossimi giorni", pick((d) => d > 1)],
  ];
  let budget = max;
  const parts: string[] = [];
  for (const [one, many, names] of groups) {
    if (!names.length || budget <= 0) continue;
    const shown = names.slice(0, budget);
    budget -= shown.length;
    const more = names.length - shown.length;
    parts.push(`${names.length === 1 ? one : many}: ${listIt(shown)}${more > 0 ? ` e altri ${more}` : ""}.`);
  }
  return { text: parts.join(" "), names: withDays.filter((x) => x.d >= 0).map((x) => x.i.name) };
}

async function cookIdea(userId: string, items: Item[]): Promise<Out> {
  const { names: soon } = expiringSentence(items, 20);
  const { data } = await db
    .from("recipes_saved")
    .select("title, ingredients_used")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(60);
  const ingNames = (r: any): string[] =>
    (Array.isArray(r?.ingredients_used) ? r.ingredients_used : []).map((x: any) => (typeof x === "string" ? x : x?.name ?? "")).filter(Boolean);
  let best: { title: string; uses: string[]; score: number } | null = null;
  for (const r of data ?? []) {
    const ings = ingNames(r);
    if (!ings.length) continue;
    const inPantry = ings.filter((g) => items.some((i) => matchScore(g, i.name) > 0.5 || matchScore(i.name, g) > 0.5));
    const urgent = inPantry.filter((g) => soon.some((n) => matchScore(g, n) > 0.5 || matchScore(n, g) > 0.5));
    const score = urgent.length * 3 + inPantry.length / ings.length;
    if (inPantry.length && (!best || score > best.score)) best = { title: r.title, uses: (urgent.length ? urgent : inPantry).slice(0, 3), score };
  }
  if (best) {
    return {
      text: `Potresti fare ${best.title}: usi ${listIt(best.uses.map(lower))}. La trovi nel ricettario dell'app.${
        soon.length ? ` Ricorda che hai da usare presto ${listIt(soon.slice(0, 3).map(lower))}.` : ""
      }`,
      card: { title: best.title, content: `Dal tuo ricettario. Usi: ${best.uses.join(", ")}` },
    };
  }
  if (soon.length) {
    return {
      text: `Hai da usare presto ${listIt(soon.slice(0, 4).map(lower))}. Apri EcoChef nell'app: ti propone una ricetta proprio con questi.`,
    };
  }
  return { text: "Niente scade nei prossimi giorni. Apri EcoChef nell'app e ti propongo una ricetta con quello che hai." };
}

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }));
  return h < 12 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
};

const HELP =
  "Puoi chiedermi: cosa scade; ho usato 300 grammi di pasta; ho buttato l'insalata; aggiungi il pane alla lista della spesa; oppure cosa posso cucinare.";

// ---------------------------------------------------------------- skill

async function skill(req: Request) {
  const body = await req.text();
  const problem = await verifyAmazon(req, body).catch((e) => `errore firma: ${e?.message ?? e}`);
  if (problem) {
    console.error("alexa: richiesta rifiutata:", problem);
    return json({ error: "bad request" }, 400);
  }
  let ev: any;
  try {
    ev = JSON.parse(body);
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const ts = Date.parse(ev?.request?.timestamp ?? "");
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 150_000) return json({ error: "bad request" }, 400);
  const appId = ev?.context?.System?.application?.applicationId ?? ev?.session?.application?.applicationId;
  if (appId !== SKILL_ID) return json({ error: "bad request" }, 400);

  const type = ev.request.type as string;
  if (type === "SessionEndedRequest") return json({ version: "1.0", response: {} });

  const intent = type === "IntentRequest" ? (ev.request.intent?.name as string) : "";
  if (intent === "AMAZON.StopIntent" || intent === "AMAZON.CancelIntent" || intent === "AMAZON.NavigateHomeIntent") {
    return alexaResponse({ text: "A presto!" });
  }
  if (intent === "AMAZON.HelpIntent") return alexaResponse(ask(HELP));

  // chi è? (account collegato)
  const token = ev?.context?.System?.user?.accessToken ?? ev?.session?.user?.accessToken;
  let userId: string | null = null;
  if (token) {
    const { data } = await db
      .from("alexa_tokens")
      .select("id, user_id, access_expires_at")
      .eq("access_hash", await sha256(token))
      .maybeSingle();
    if (data && new Date(data.access_expires_at).getTime() > Date.now()) {
      userId = data.user_id;
      db.from("alexa_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => undefined);
    }
  }
  if (!userId) {
    return alexaResponse({
      text: "Per usare EcoDispensa collega il tuo account: apri l'app Alexa sul telefono, ti ho mandato una scheda per farlo.",
      linkAccount: true,
    });
  }
  const { data: member } = await db.from("household_members").select("household_id, display_name").eq("user_id", userId).maybeSingle();
  if (!member?.household_id) return alexaResponse({ text: "Non trovo la tua dispensa. Apri l'app EcoDispensa e riprova." });
  const hh = member.household_id as string;
  const firstName = (member.display_name ?? "").split(" ")[0];

  const slot = (name: string) => (ev.request.intent?.slots?.[name]?.value as string | undefined)?.trim() ?? "";

  try {
    if (type === "LaunchRequest") {
      const items = await loadPantry(hh);
      const { text } = expiringSentence(items);
      const hello = `${greeting()}${firstName ? ` ${firstName}` : ""}!`;
      if (!items.length) return alexaResponse(ask(`${hello} La tua dispensa è vuota: aggiungi i prodotti dall'app.`, "Vuoi aggiungere qualcosa alla lista della spesa?"));
      return alexaResponse(ask(`${hello} ${text || "Niente scade nei prossimi tre giorni."}`, "Cosa vuoi fare? Per esempio: ho usato due uova."));
    }
    if (intent === "ExpiringIntent") {
      const items = await loadPantry(hh);
      const { text } = expiringSentence(items, 8);
      return alexaResponse({ text: text || "Niente scade nei prossimi tre giorni. Bravo!" });
    }
    if (intent === "UseIntent" || intent === "WasteIntent") {
      const what = slot("prodotto");
      if (!what) return alexaResponse(ask(intent === "WasteIntent" ? "Cosa hai buttato?" : "Cosa hai usato?", "Per esempio: 300 grammi di pasta."));
      return alexaResponse(await takeFromPantry(userId, hh, what, intent === "WasteIntent" ? "wasted" : "consumed"));
    }
    if (intent === "AddShoppingIntent") {
      const what = slot("prodotto");
      if (!what) return alexaResponse(ask("Cosa aggiungo alla lista della spesa?", "Per esempio: il pane."));
      return alexaResponse(await addToShopping(userId, hh, what));
    }
    if (intent === "CookIntent") {
      return alexaResponse(await cookIdea(userId, await loadPantry(hh)));
    }
    if (intent === "AMAZON.FallbackIntent") return alexaResponse(ask(`Non ho capito. ${HELP}`));
    return alexaResponse(ask(HELP));
  } catch (e) {
    console.error("alexa error:", e);
    return alexaResponse({ text: "Scusa, qualcosa non ha funzionato. Riprova tra poco." });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("EcoDispensa per Alexa", { status: 200 });
  const path = new URL(req.url).pathname;
  if (path.endsWith("/token")) return tokenEndpoint(req);
  return skill(req);
});
