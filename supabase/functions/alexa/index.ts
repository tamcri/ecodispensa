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

// ---------------------------------------------------------------- collegamento in un tocco dall'app (app-to-app)
//
//  POST /alexa/collega/start   (con il token di accesso di EcoDispensa) → indirizzi di Alexa / Amazon per il consenso
//  POST /alexa/collega/finish  { code, state } → abilita la skill e collega l'account
//
// Segreti: ALEXA_A2A_CLIENT_ID e ALEXA_A2A_CLIENT_SECRET (console Alexa → Account Linking → collegamento dall'app)

const A2A_REDIRECT = "https://ecodispensa.it/app/alexa-collega";
const SKILL_STAGE = Deno.env.get("ALEXA_SKILL_STAGE") || "development";
const ALEXA_HOSTS = ["https://api.eu.amazonalexa.com", "https://api.amazonalexa.com", "https://api.fe.amazonalexa.com"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const cors = (body: unknown, status = 200) => json(body, status, CORS);

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function linkStart(req: Request) {
  const clientId = Deno.env.get("ALEXA_A2A_CLIENT_ID");
  if (!clientId) return cors({ error: "NOT_CONFIGURED" }, 503);
  const userId = await userFromJwt(req);
  if (!userId) return cors({ error: "UNAUTHORIZED" }, 401);

  const state = randomToken();
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  await db.from("alexa_link_states").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
  const { error } = await db.from("alexa_link_states").insert({ state_hash: await sha256(state), user_id: userId, verifier });
  if (error) return cors({ error: "SERVER_ERROR" }, 500);

  const common = {
    client_id: clientId,
    scope: "alexa::skills:account_linking",
    response_type: "code",
    redirect_uri: A2A_REDIRECT,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  };
  const alexaUrl = `https://alexa.amazon.com/spa/skill-account-linking-consent?${new URLSearchParams({
    fragment: "skill-account-linking-consent",
    ...common,
    skill_stage: SKILL_STAGE,
  })}`;
  const lwaUrl = `https://www.amazon.com/ap/oa?${new URLSearchParams(common)}`;
  return cors({ alexaUrl, lwaUrl });
}

// il token di rinnovo di Amazon (serve a sapere se la skill è ancora attiva e a scollegarla) è salvato cifrato
async function refreshKey(): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${Deno.env.get("ALEXA_A2A_CLIENT_SECRET") ?? ""}|ecodispensa-refresh`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await refreshKey(), new TextEncoder().encode(text)));
  return `${b64url(iv)}.${b64url(enc)}`;
}
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function unseal(sealed: string): Promise<string | null> {
  try {
    const [iv, data] = sealed.split(".");
    const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64url(iv) }, await refreshKey(), unb64url(data));
    return new TextDecoder().decode(dec);
  } catch {
    return null;
  }
}

/** Token di Amazon nuovo per l'utente (dal token di rinnovo salvato al collegamento) */
async function amazonAccess(userId: string): Promise<{ token: string; host: string } | null> {
  const { data: row } = await db.from("alexa_amazon_links").select("refresh_enc, api_host").eq("user_id", userId).maybeSingle();
  if (!row) return null;
  const refresh = await unseal(row.refresh_enc);
  if (!refresh) return null;
  const r = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: Deno.env.get("ALEXA_A2A_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("ALEXA_A2A_CLIENT_SECRET") ?? "",
    }),
  });
  const t = await r.json().catch(() => null);
  if (!r.ok || !t?.access_token) {
    console.error("alexa stato: rinnovo token Amazon", r.status, t?.error ?? "");
    // l'utente ha tolto il permesso ad Amazon: il collegamento non c'è più
    if (t?.error === "invalid_grant") await db.from("alexa_amazon_links").delete().eq("user_id", userId);
    return null;
  }
  if (t.refresh_token && t.refresh_token !== refresh) {
    await db.from("alexa_amazon_links").update({ refresh_enc: await seal(t.refresh_token), updated_at: new Date().toISOString() }).eq("user_id", userId);
  }
  return { token: t.access_token, host: row.api_host };
}

async function userFromJwt(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data } = await db.auth.getUser(jwt);
  return data?.user?.id ?? null;
}

/** Stato vero del collegamento: chiede ad Amazon se la skill è ancora attiva e collegata */
async function linkStatus(req: Request) {
  const userId = await userFromJwt(req);
  if (!userId) return cors({ error: "UNAUTHORIZED" }, 401);
  const { count } = await db.from("alexa_tokens").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const ours = (count ?? 0) > 0;
  const amazon = await amazonAccess(userId);
  if (!amazon) return cors({ linked: ours, checked: false });
  const r = await fetch(`${amazon.host}/v1/users/~current/skills/${SKILL_ID}/enablement`, { headers: { Authorization: `Bearer ${amazon.token}` } });
  if (r.status !== 200 && r.status !== 404) return cors({ linked: ours, checked: false });
  const st = r.status === 200 ? await r.json().catch(() => null) : null;
  const linked = st?.status === "ENABLED" && st?.accountLink?.status === "LINKED";
  if (!linked) {
    // disattivata dall'app Alexa: puliamo anche da noi
    await db.from("alexa_tokens").delete().eq("user_id", userId);
    await db.from("alexa_amazon_links").delete().eq("user_id", userId);
  }
  return cors({ linked, checked: true });
}

/** Scollega da EcoDispensa: disattiva anche la skill nell'app Alexa (se il collegamento è nato dall'app) */
async function linkRemove(req: Request) {
  const userId = await userFromJwt(req);
  if (!userId) return cors({ error: "UNAUTHORIZED" }, 401);
  const amazon = await amazonAccess(userId);
  if (amazon) {
    const r = await fetch(`${amazon.host}/v1/users/~current/skills/${SKILL_ID}/enablement`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${amazon.token}` },
    });
    if (!r.ok && r.status !== 404) console.error("alexa scollega: disattivazione", r.status, (await r.text().catch(() => "")).slice(0, 200));
  }
  await db.from("alexa_tokens").delete().eq("user_id", userId);
  await db.from("alexa_amazon_links").delete().eq("user_id", userId);
  return cors({ ok: true });
}

async function linkFinish(req: Request) {
  const clientId = Deno.env.get("ALEXA_A2A_CLIENT_ID");
  const clientSecret = Deno.env.get("ALEXA_A2A_CLIENT_SECRET");
  if (!clientId || !clientSecret) return cors({ error: "NOT_CONFIGURED" }, 503);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* corpo non valido */
  }
  const amazonCode = typeof body?.code === "string" ? body.code : "";
  const state = typeof body?.state === "string" ? body.state : "";
  if (!amazonCode || !state) return cors({ error: "BAD_REQUEST" }, 400);

  // lo "state" segreto e monouso dice chi ha iniziato il collegamento (anche se il ritorno si apre in un altro browser)
  const { data: st } = await db
    .from("alexa_link_states")
    .delete()
    .eq("state_hash", await sha256(state))
    .select("user_id, verifier, created_at")
    .maybeSingle();
  if (!st || Date.parse(st.created_at) < Date.now() - 30 * 60_000) return cors({ error: "EXPIRED" }, 400);

  // 1. il codice di Amazon diventa un token di Amazon per questo utente
  const tr = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: amazonCode,
      redirect_uri: A2A_REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: st.verifier,
    }),
  });
  const tok = await tr.json().catch(() => null);
  if (!tr.ok || !tok?.access_token) {
    console.error("alexa collega: token Amazon", tr.status, tok?.error ?? "");
    return cors({ error: "AMAZON_TOKEN" }, 502);
  }

  // 2. un nostro codice monouso per lo stesso utente, che Alexa scambierà con /alexa/token
  const ourCode = randomToken();
  const { error: ce } = await db.from("alexa_auth_codes").insert({ code_hash: await sha256(ourCode), user_id: st.user_id, redirect_uri: A2A_REDIRECT });
  if (ce) return cors({ error: "SERVER_ERROR" }, 500);

  // 3. abilitazione della skill e collegamento: si prova la regione dell'utente (prima l'Europa)
  const payload = JSON.stringify({ stage: SKILL_STAGE, accountLinkRequest: { redirectUri: A2A_REDIRECT, authCode: ourCode, type: "AUTH_CODE" } });
  for (const host of ALEXA_HOSTS) {
    const r = await fetch(`${host}/v1/users/~current/skills/${SKILL_ID}/enablement`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
      body: payload,
    });
    if (r.status === 201 || r.status === 200) {
      if (tok.refresh_token) {
        await db
          .from("alexa_amazon_links")
          .upsert({ user_id: st.user_id, refresh_enc: await seal(tok.refresh_token), api_host: host, updated_at: new Date().toISOString() });
      }
      return cors({ ok: true });
    }
    const t = await r.text().catch(() => "");
    console.error("alexa collega: abilitazione", host, r.status, t.slice(0, 300));
  }
  return cors({ error: "ENABLE_FAILED" }, 502);
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

type Out = {
  text: string;
  reprompt?: string;
  end?: boolean;
  linkAccount?: boolean;
  card?: { title: string; content: string };
  /** memoria della conversazione (scadenze da chiedere, lista in preparazione) */
  attrs?: Record<string, unknown>;
};

const alexaResponse = (o: Out) =>
  json({
    version: "1.0",
    ...(o.attrs ? { sessionAttributes: o.attrs } : {}),
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

// ---------------------------------------------------------------- guida di conservazione (da /foodGuide.ts dell'app)

// [parole chiave (inizio parola), categoria, giorni di conservazione, fresco senza data stampata]
const GUIDE: Array<[string[], string, number, boolean]> = [
  [["pasta fresca", "tortellin", "ravioli", "gnocchi", "lasagn"], "Dispensa", 3, false],
  [["insalata di riso", "gastronomi", "piatto pronto", "piatti pronti"], "Altro", 2, true],
  [["fragol", "lampon", "mirtill", "more ", "frutti di bosco", "ribes"], "Ortofrutta", 3, true],
  [["banan"], "Ortofrutta", 5, true],
  [["mela ", "mele "], "Ortofrutta", 21, true],
  [["pera ", "pere "], "Ortofrutta", 5, true],
  [["aranc", "mandarin", "clementin", "limon", "pompelm", "lime "], "Ortofrutta", 14, true],
  [["uva "], "Ortofrutta", 5, true],
  [["pesca ", "pesche ", "percoc", "albicocc", "nettarin", "susin", "prugn", "cilieg"], "Ortofrutta", 4, true],
  [["kiwi"], "Ortofrutta", 10, true],
  [["ananas", "mango", "papaya"], "Ortofrutta", 4, true],
  [["melon", "angur", "cocomer"], "Ortofrutta", 5, true],
  [["avocad"], "Ortofrutta", 4, true],
  [["fich"], "Ortofrutta", 2, true],
  [["melagran", "melograno"], "Ortofrutta", 30, true],
  [["cach", "kaki"], "Ortofrutta", 5, true],
  [["castagn", "marron"], "Ortofrutta", 7, true],
  [["pomodor", "pachin", "datterin", "ciliegin"], "Ortofrutta", 5, true],
  [["basilic"], "Ortofrutta", 4, true],
  [["prezzemol", "coriandol", "erba cipollina", "aneto", "menta", "erbe aromatic"], "Ortofrutta", 5, true],
  [["insalat", "lattug", "rucol", "valerian", "songin", "spinaci freschi", "spinac", "radicchi", "indivia", "scarola", "misticanza"], "Ortofrutta", 3, true],
  [["fungh", "champignon", "porcin"], "Ortofrutta", 3, true],
  [["asparag"], "Ortofrutta", 3, true],
  [["zucchin", "melanzan", "cetriol", "fagiolin", "tacc"], "Ortofrutta", 5, true],
  [["peperon"], "Ortofrutta", 7, true],
  [["broccol", "cavolfior", "cavol", "verza", "cime di rapa", "friariell", "bietol", "catalogn"], "Ortofrutta", 5, true],
  [["carciof"], "Ortofrutta", 5, true],
  [["finocch", "porr"], "Ortofrutta", 7, true],
  [["sedan"], "Ortofrutta", 10, true],
  [["carot"], "Ortofrutta", 21, true],
  [["ravanell", "rape ", "rapa ", "barbabietol"], "Ortofrutta", 7, true],
  [["cipollott", "germogl"], "Ortofrutta", 4, true],
  [["pisell", "fave ", "fava "], "Ortofrutta", 3, true],
  [["pannocch", "mais fresco"], "Ortofrutta", 3, true],
  [["cavolin"], "Ortofrutta", 5, true],
  [["zucca"], "Ortofrutta", 7, true],
  [["patat"], "Ortofrutta", 30, true],
  [["cipoll", "scalogn"], "Ortofrutta", 30, true],
  [["agli"], "Ortofrutta", 30, true],
  [["zenzer"], "Ortofrutta", 21, true],
  [["pane ", "baguette", "ciabatt", "rosett", "filon"], "Dispensa", 2, true],
  [["focacc", "pizza"], "Dispensa", 2, true],
  [["cornett", "brioche", "croissant", "pasticcin"], "Dispensa", 2, true],
  [["macinat", "hamburger", "polpett"], "Carne & Pesce", 1, true],
  [["salsicc"], "Carne & Pesce", 2, true],
  [["pollo", "tacchin", "petto", "cosce", "alett"], "Carne & Pesce", 2, true],
  [["manzo", "vitell", "maial", "braciol", "bistecc", "fettin", "arrost", "spezzatin", "agnell", "carne"], "Carne & Pesce", 2, true],
  [["cozz", "vongol", "gamber", "scamp", "calamar", "seppi", "polp", "frutti di mare"], "Carne & Pesce", 1, true],
  [["pesce", "salmon", "orat", "branzin", "spigol", "merluzz", "tonno fresco", "trot", "sogliol", "aliciott", "acciugh", "sardin"], "Carne & Pesce", 1, true],
  [["prosciutt", "salam", "mortadell", "bresaol", "speck", "affettat", "pancett", "coppa"], "Carne & Pesce", 3, true],
  [["mozzarell", "burrat", "stracciatell", "fiordilatte", "bufala"], "Latticini", 3, false],
  [["ricott", "stracchin", "crescenz", "squaquerone", "mascarpon"], "Latticini", 4, false],
  [["parmigian", "grana", "pecorin", "formagg"], "Latticini", 30, false],
  [["latte"], "Latticini", 4, false],
  [["yogurt", "kefir"], "Latticini", 10, false],
  [["burro"], "Latticini", 30, false],
  [["panna"], "Latticini", 3, false],
  [["uova", "uovo"], "Latticini", 21, false],
  [["avanz", "sugo", "ragu", "brodo", "minestr", "zupp"], "Altro", 3, true],
];
const PROCESSED = [' passat', ' pelat', ' polpa ', ' salsa', ' succo', ' succhi', ' marmellat', ' confettur', ' surgel', ' scatol', ' secch', ' sott', ' affumicat', ' liofilizz', ' in polvere', ' crackers', ' biscott', ' grissin', ' fette biscottate', ' pan carre', ' pancarre', ' uht', ' a lunga conservazione'];
const foodNorm = (name: string) => ` ${norm(name).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()} `;
function guideFor(name: string) {
  const n = foodNorm(name);
  if (n.trim().length < 2 || PROCESSED.some((w) => n.includes(w))) return null;
  for (const g of GUIDE) for (const k of g[0]) if (n.includes(` ${k}`)) return { category: g[1], days: g[2], fresh: g[3] };
  return null;
}
const looksProcessed = (name: string) => PROCESSED.some((w) => foodNorm(name).includes(w));
const isoInDays = (days: number) => {
  const d = new Date(Date.parse(romeToday()) + days * 86_400_000);
  return d.toISOString().slice(0, 10);
};
/** Scadenza stimata solo per i freschi senza etichetta (come nell'app) */
function suggestedExpiry(name: string, category: string): string | null {
  const g = guideFor(name);
  if (g) return g.fresh ? isoInDays(g.days) : null;
  if (looksProcessed(name)) return null;
  const days = category === "Ortofrutta" ? 5 : category === "Carne & Pesce" ? 2 : 0;
  return days ? isoInDays(days) : null;
}

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
    // numeri a parole, anche staccati: "cinque cento" = 500, "trecento cinquanta" = 350, "due mila" = 2000
    const words = s.split(" ");
    const first = words[0];
    if (first in WORD_NUM && !(["un", "uno", "una", "un'"].includes(first) && !words[1])) {
      let total = 0;
      let used = 0;
      for (const w of words) {
        if (w === "cento" && total > 0 && total < 10) total *= 100;
        else if ((w === "mila" || w === "mille") && total > 0) total *= 1000;
        else if (w in WORD_NUM && (used === 0 || WORD_NUM[w] >= 1)) total += WORD_NUM[w];
        else break;
        used++;
        if (["un", "uno", "una", "un'", "mezzo", "mezza"].includes(w) && used === 1) break;
      }
      amount = total;
      s = words.slice(used).join(" ").trim();
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

// inizi di parola dei prodotti più comuni: servono a dividere "latte pane burro" detto senza pause
const EXTRA_FOOD = ["pasta", "spaghett", "penne", "fusill", "rigaton", "riso", "farina", "zucchero", "sale", "olio", "aceto", "caffe", "biscott", "cracker", "grissin", "cereali", "tonno", "pelati", "passata", "ceci", "fagiol", "lenticch", "marmellat", "miele", "nutella", "cioccolat", "acqua", "vino", "birra", "succo", "bibit", "coca", "aranciata", "carta", "detersiv", "sapone", "dentifric", "shampoo", "sacchett", "gelat", "surgelat", "frutta", "verdura", "uova", "uovo", "wurstel", "pancarre", "piadin", "tortill", "olive", "capperi", "maionese", "ketchup", "senape", "spezie", "pepe", "origano", "lievito", "cacao", "the"];
let foodStarts: string[] | null = null;
const isFoodWord = (w: string) => {
  if (!foodStarts) {
    foodStarts = [...new Set([...GUIDE.flatMap((g) => g[0]).map((k) => k.trim()).filter((k) => k.length >= 3 && !k.includes(" ")), ...EXTRA_FOOD])];
  }
  return w.length >= 3 && foodStarts.some((k) => w.startsWith(k));
};
const LINKS = new Set(["di", "del", "dello", "della", "dei", "degli", "delle", "d'", "al", "alla", "allo", "ai", "alle", "con", "in", "da", "per", "senza", "all'", "dell'"]);
const isQtyWord = (w: string) => /^\d/.test(w) || (w in WORD_NUM && !["un", "uno", "una", "un'"].includes(w));

/** Divide "due litri di latte sei uova pane e burro" in "due litri di latte", "sei uova", "pane", "burro" */
function splitRun(part: string): string[] {
  const words = part.split(" ").filter(Boolean);
  const out: string[][] = [];
  let cur: string[] = [];
  let hasFood = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = words[i - 1] ?? "";
    const startsNew =
      cur.length > 0 &&
      hasFood &&
      !LINKS.has(prev) &&
      (isQtyWord(w) || isFoodWord(w) || ["il", "lo", "la", "i", "gli", "le", "l'"].includes(w) || w.startsWith("l'"));
    if (startsNew) {
      out.push(cur);
      cur = [];
      hasFood = false;
    }
    cur.push(w);
    if (isFoodWord(w) || (!isQtyWord(w) && !LINKS.has(w) && !(w in UNIT_OF) && w.length > 2 && cur.length > 0 && !hasFood && i === words.length - 1)) hasFood = true;
    else if (!isQtyWord(w) && !LINKS.has(w) && !(w in UNIT_OF) && !["il", "lo", "la", "i", "gli", "le", "un", "uno", "una"].includes(w)) hasFood = true;
  }
  if (cur.length) out.push(cur);
  return out.map((ws) => ws.join(" "));
}

const splitParts = (text: string) =>
  norm(text)
    .split(/\s*,\s*|\s+e\s+|\s+poi\s+|\s+ed\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap(splitRun);

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
  const finished: string[] = [];
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
    if (rest <= 0.0001) {
      done.push(outcome === "wasted" ? `${n} buttato` : `${n} finito`);
      if (outcome === "consumed" && !finished.includes(n)) finished.push(n);
    }
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
  const card = { title: "Dispensa aggiornata", content: sentences.join("\n") };
  // finito un prodotto: lo rimetto in lista? (ma non se c'è già)
  if (finished.length) {
    const { data: inList } = await db.from("shopping_items").select("name").eq("household_id", householdId).eq("is_checked", false);
    const listed = new Set((inList ?? []).map((r: any) => norm(r.name)));
    const again = finished.filter((n) => ![...listed].some((l) => matchScore(n, l) > 0.5));
    if (again.length) {
      return {
        text: `${sentences.join(" ")} Vuoi che ${again.length === 1 ? "lo metta" : "li metta"} nella lista della spesa?`,
        reprompt: `Metto ${listIt(again)} nella lista della spesa? Dimmi sì o no.`,
        end: false,
        card,
        attrs: { missing: again },
      };
    }
  }
  return { text: sentences.join(" "), card };
}

async function addToShopping(userId: string, householdId: string, text: string): Promise<Out> {
  const parts = splitParts(text).map(parsePart).filter((p): p is Said => !!p);
  if (!parts.length) return ask("Cosa aggiungo alla lista della spesa?", "Dimmi per esempio: aggiungi il pane alla lista della spesa.");
  return saveShopping(userId, householdId, parts);
}

async function saveShopping(userId: string, householdId: string, parts: Said[]): Promise<Out> {
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
      category: guideFor(name)?.category ?? (PANTRY_WORDS.test(norm(name)) ? "Dispensa" : "Altro"),
      quantity: p.amount !== null && p.unit ? p.amount : null,
      unit: p.amount !== null && p.unit ? p.unit : null,
    });
    added.push(p.name);
  }
  if (rows.length) {
    const { error } = await db.from("shopping_items").insert(rows);
    if (error) {
      console.error("alexa shopping insert:", error.message);
      return { text: "Non sono riuscito a salvare la lista. Riprova tra poco." };
    }
  }
  const s: string[] = [];
  if (added.length) s.push(`Ho aggiunto ${listIt(added)} alla lista della spesa.`);
  if (already.length) s.push(`${listIt(already)} ${already.length === 1 ? "c'era già" : "c'erano già"}.`);
  return { text: s.join(" ") };
}

// prodotti da dispensa che la guida non conosce (non freschi, di solito con la data stampata)
const PANTRY_WORDS = /\b(pasta|spaghett|penne|fusill|rigaton|linguine|tagliatell|maccheron|riso|farina|zucchero|sale|olio|aceto|caffe|te\b|tisan|biscott|cracker|grissin|fette biscottate|cereali|tonno|pelati|passata|legumi|ceci|fagiol|lenticch|marmellat|miele|nutella|cioccolat|pane in cassetta|pancarre)/;

/** "Aggiungi 500 grammi di spaghetti in dispensa": prodotti nuovi, con categoria e scadenza stimata se freschi */
async function addToPantry(userId: string, text: string): Promise<Out> {
  const parts = splitParts(text).map(parsePart).filter((p): p is Said => !!p);
  if (!parts.length) return ask("Cosa aggiungo in dispensa?", "Per esempio: 500 grammi di spaghetti.");
  const rows: any[] = [];
  const said: string[] = [];
  let noDate = 0;
  for (const p of parts) {
    const name = p.name.charAt(0).toUpperCase() + p.name.slice(1);
    const g = guideFor(name);
    const category = g?.category ?? (looksProcessed(name) || PANTRY_WORDS.test(norm(name)) ? "Dispensa" : "Altro");
    const expiry = suggestedExpiry(name, category);
    if (!expiry) noDate++;
    const unit = p.amount !== null && p.unit ? p.unit : "pz";
    const quantity = p.amount !== null && p.amount > 0 ? p.amount : 1;
    rows.push({ user_id: userId, name, quantity, unit, category, expiry_date: expiry });
    said.push(p.amount !== null ? `${qtyIt(quantity, unit)} di ${p.name}` : p.name);
  }
  const { data: saved, error } = await db.from("pantry_items").insert(rows).select("id, name, expiry_date");
  if (error) {
    console.error("alexa add pantry:", error.message);
    return { text: "Non sono riuscito ad aggiungerli. Riprova tra poco." };
  }
  // per i prodotti senza scadenza stimata la chiedo, uno alla volta
  const pending = (saved ?? []).filter((r: any) => !r.expiry_date).map((r: any) => ({ id: r.id, name: r.name }));
  const done = `Ho aggiunto in dispensa ${listIt(said)}.`;
  if (!pending.length) return { text: done };
  return { ...askExpiry(pending, done), attrs: { pending } };
}

type Pending = { id: string; name: string };

const askExpiry = (pending: Pending[], before = ""): Out => {
  const n = lower(pending[0].name);
  return {
    text: `${before} Quando scade ${n}? Dimmi la data, oppure tra quanti giorni. Se non lo sai di' salta.`.trim(),
    reprompt: `Quando scade ${n}? Per esempio: il 30 novembre, oppure tra 3 giorni.`,
    end: false,
    attrs: { pending },
  };
};

/** Data detta ad Alexa: "2026-11-30", "tra 3 giorni" → YYYY-MM-DD (null se non è una data precisa) */
function expiryFrom(dateSlot: string, daysSlot: string): string | null {
  const days = parseInt(daysSlot, 10);
  if (Number.isFinite(days) && days >= 0 && days <= 3650) return isoInDays(days);
  const m = dateSlot.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  let iso = dateSlot;
  // "il 3 gennaio" detto a dicembre: Alexa a volte capisce l'anno passato
  if (iso < romeToday()) iso = `${Number(m[1]) + 1}-${m[2]}-${m[3]}`;
  return iso;
}

const dateIt = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "UTC" });

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
    .select("title, status, ingredients_used, missing_ingredients")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(80);
  const names = (v: any): string[] =>
    (Array.isArray(v) ? v : []).map((x: any) => (typeof x === "string" ? x : x?.name ?? "")).filter((x: string) => x.trim().length > 1);
  const same = (a: string, b: string) => matchScore(a, b) > 0.5 || matchScore(b, a) > 0.5;

  // la ricetta migliore: quasi tutti gli ingredienti già in casa, meglio se usa quelli che scadono
  let best: { title: string; status: string; have: string[]; missing: string[]; urgent: string[]; score: number } | null = null;
  for (const r of data ?? []) {
    const ings = [...new Set([...names(r.ingredients_used), ...names(r.missing_ingredients)])];
    if (!ings.length) continue;
    const have = ings.filter((g) => items.some((i) => same(g, i.name)));
    const missing = ings.filter((g) => !have.includes(g));
    const coverage = have.length / ings.length;
    if (coverage < 0.6 || missing.length > 2) continue;
    const urgent = have.filter((g) => soon.some((n) => same(g, n)));
    const score = urgent.length * 2 + coverage + (r.status === "cooked" ? 0 : 0.2);
    if (!best || score > best.score) best = { title: r.title, status: r.status, have, missing, urgent, score };
  }

  if (best) {
    const where = best.status === "cooked" ? "La trovi nel ricettario, tra quelle già cucinate." : "La trovi nel ricettario dell'app.";
    const miss = best.missing.length ? ` Ti manca solo ${listIt(best.missing.map(lower))}.` : " Hai già tutto.";
    const rest = soon.filter((n) => !best!.urgent.some((u) => same(u, n)));
    const urgent = best.urgent.length
      ? ` Così usi ${listIt(best.urgent.map(lower))}, che ${best.urgent.length === 1 ? "scade" : "scadono"} presto.`
      : "";
    const also = rest.length ? ` Da usare presto hai anche ${listIt(rest.slice(0, 3).map(lower))}.` : "";
    return {
      text: `Potresti fare ${best.title}.${miss}${urgent} ${where}${also}`,
      card: { title: best.title, content: `Hai: ${best.have.join(", ")}${best.missing.length ? `\nTi manca: ${best.missing.join(", ")}` : ""}` },
    };
  }
  if (soon.length) {
    return {
      text: `Nel tuo ricettario non c'è una ricetta che puoi fare con quello che hai. Da usare presto hai ${listIt(
        soon.slice(0, 4).map(lower)
      )}: apri EcoChef nell'app e ti propone una ricetta proprio con ${soon.length === 1 ? "questo" : "questi"}.`,
    };
  }
  return { text: "Nel tuo ricettario non c'è una ricetta che puoi fare con quello che hai. Apri EcoChef nell'app e ti propongo qualcosa." };
}

// ---------------------------------------------------------------- lista della spesa: leggere, togliere, comprato

type ShopRow = { id: string; name: string; is_checked: boolean };

async function loadShopping(hh: string): Promise<ShopRow[]> {
  const { data } = await db.from("shopping_items").select("id, name, is_checked").eq("household_id", hh).order("created_at", { ascending: true });
  return (data ?? []) as ShopRow[];
}

/** "Leggimi la lista" */
async function readList(hh: string): Promise<Out> {
  const rows = await loadShopping(hh);
  const todo = rows.filter((r) => !r.is_checked).map((r) => lower(r.name));
  const inCart = rows.filter((r) => r.is_checked).length;
  if (!todo.length) {
    return { text: inCart ? `Hai già preso tutto: ${inCart === 1 ? "un prodotto è" : `${inCart} prodotti sono`} nel carrello.` : "La lista della spesa è vuota." };
  }
  const shown = todo.slice(0, 12);
  const rest = todo.length - shown.length;
  const cart = inCart ? ` Nel carrello ne hai già ${inCart}.` : "";
  return {
    text: `Nella lista ${todo.length === 1 ? "c'è" : `ci sono ${todo.length} prodotti`}: ${listIt(shown)}${rest > 0 ? `, e altri ${rest}` : ""}.${cart}`,
    card: { title: "Lista della spesa", content: todo.join("\n") },
  };
}

const findRow = (rows: ShopRow[], said: string) => {
  let best: ShopRow | null = null;
  let score = 0.5;
  for (const r of rows) {
    const s = matchScore(said, r.name);
    if (s > score) {
      best = r;
      score = s;
    }
  }
  return best;
};

/** "Togli il pane dalla lista" */
async function removeFromList(hh: string, text: string): Promise<Out> {
  const clean = norm(text).replace(/\s+(dalla|dall'|nella|della)\s*(lista|spesa).*$/, "").replace(/\s+dalla$/, "");
  const parts = splitParts(clean).map(parsePart).filter((p): p is Said => !!p);
  if (!parts.length) return ask("Cosa tolgo dalla lista?", "Per esempio: togli il pane dalla lista.");
  const rows = await loadShopping(hh);
  const removed: string[] = [];
  const missing: string[] = [];
  const ids: string[] = [];
  for (const p of parts) {
    const r = findRow(rows.filter((x) => !ids.includes(x.id)), p.name);
    if (!r) missing.push(p.name);
    else {
      ids.push(r.id);
      removed.push(lower(r.name));
    }
  }
  if (ids.length) await db.from("shopping_items").delete().in("id", ids).eq("household_id", hh);
  const s: string[] = [];
  if (removed.length) s.push(`Ho tolto ${listIt(removed)} dalla lista.`);
  if (missing.length) s.push(`Non trovo ${listIt(missing)} nella lista.`);
  return { text: s.join(" ") };
}

/** Comprato e messo in dispensa: se era nella lista della spesa lo tolgo (senza dirlo) */
async function dropFromList(hh: string, text: string) {
  const parts = splitParts(text).map(parsePart).filter((p): p is Said => !!p);
  const rows = (await loadShopping(hh)).filter((r) => !r.is_checked);
  const ids = parts.map((p) => findRow(rows, p.name)?.id).filter((x): x is string => !!x);
  if (ids.length) await db.from("shopping_items").delete().in("id", ids).eq("household_id", hh);
}

const ALL_WORDS = /^(tutto|la spesa|tutta la lista|tutta la spesa|tutto quanto|tutti|tutte|tutto della lista|tutta)$/;

/** "Ho comprato il latte": lo segna come preso (nel carrello) */
async function boughtItems(hh: string, text: string): Promise<Out> {
  const n = norm(text).replace(/\s+(della|dalla|nella)\s+lista.*$/, "");
  if (!n || ALL_WORDS.test(n)) return askBoughtAll(hh);
  const parts = splitParts(n).map(parsePart).filter((p): p is Said => !!p);
  const rows = (await loadShopping(hh)).filter((r) => !r.is_checked);
  const done: string[] = [];
  const missing: string[] = [];
  const ids: string[] = [];
  for (const p of parts) {
    const r = findRow(rows.filter((x) => !ids.includes(x.id)), p.name);
    if (!r) missing.push(p.name);
    else {
      ids.push(r.id);
      done.push(lower(r.name));
    }
  }
  if (ids.length) await db.from("shopping_items").update({ is_checked: true }).in("id", ids).eq("household_id", hh);
  const s: string[] = [];
  if (done.length) s.push(`Segnato come preso: ${listIt(done)}.`);
  if (missing.length) s.push(`${cap(listIt(missing))} non ${missing.length === 1 ? "era" : "erano"} nella lista.`);
  if (!s.length) s.push("Non ho capito cosa hai comprato.");
  return { text: s.join(" ") };
}

/** "Ho comprato tutto": prima chiedo conferma */
async function askBoughtAll(hh: string): Promise<Out> {
  const todo = (await loadShopping(hh)).filter((r) => !r.is_checked);
  if (!todo.length) return { text: "Nella lista non c'è niente da prendere." };
  return {
    text: `Segno come presi ${todo.length === 1 ? `${lower(todo[0].name)}, l'unico prodotto della lista` : `tutti i ${todo.length} prodotti della lista`}?`,
    reprompt: "Li segno tutti come presi? Dimmi sì o no.",
    end: false,
    attrs: { boughtAll: true },
  };
}

async function boughtAll(hh: string): Promise<Out> {
  const { data } = await db.from("shopping_items").update({ is_checked: true }).eq("household_id", hh).eq("is_checked", false).select("id");
  const n = (data ?? []).length;
  if (!n) return { text: "Nella lista non c'era niente da prendere." };
  return {
    text: `Fatto: ${n === 1 ? "un prodotto è" : `${n} prodotti sono`} nel carrello. A casa apri la lista nell'app e premi «Metti in dispensa», così li aggiungi con le scadenze.`,
  };
}

// ---------------------------------------------------------------- cosa c'è in dispensa

/** "la mozzarella in frigo", "pasta mi è rimasta" → "mozzarella", "pasta" */
function productSaid(raw: string): string {
  let s = norm(raw)
    .replace(/^(ancora|se ho|se c'e|se ci sono|in casa)\s+/, "")
    .replace(/\s+(in casa|in frigo|in frigorifero|in dispensa|in freezer|ancora|ho|abbiamo|mi e rimast[oaie]|mi sono rimast[oaie]|e rimast[oaie]|sono rimast[oaie]|ci sono|c'e)$/g, "")
    .replace(/^(di|del|della|dello|dei|delle|degli)\s+/, "");
  const p = parsePart(s);
  return p?.name ?? s;
}

const matching = (items: Item[], said: string) =>
  items
    .filter((i) => matchScore(said, i.name) > 0.5)
    .sort((a, b) => (a.expiry_date ?? "9999").localeCompare(b.expiry_date ?? "9999"));

/** "scade domani", "è già scaduto il 3 novembre", "scade il 30 dicembre" */
function expiryPhrase(iso: string | null): string {
  const d = daysLeft(iso);
  if (d === null || !iso) return "non ha una scadenza segnata";
  if (d < -1) return `è già scaduto il ${dateIt(iso)}`;
  if (d === -1) return "è scaduto ieri";
  if (d === 0) return "scade oggi";
  if (d === 1) return "scade domani";
  if (d <= 7) return `scade tra ${d} giorni`;
  return `scade il ${dateIt(iso)}`;
}

/** quantità totale dei prodotti trovati, nell'unità del primo */
function totalQty(found: Item[]): string {
  const unit = unitKey(found[0].unit);
  let tot = 0;
  for (const i of found) {
    const c = convert(i.quantity, i.unit, unit);
    if (c === null) return "";
    tot += c;
  }
  return qtyIt(tot, unit);
}

/** "Ho la mozzarella?", "quanta pasta mi è rimasta?" */
async function haveReport(hh: string, raw: string): Promise<Out> {
  const said = productSaid(raw);
  if (!said) return ask("Quale prodotto cerco?", "Per esempio: ho la mozzarella?");
  const found = matching(await loadPantry(hh), said);
  if (!found.length) {
    return {
      text: `No, non trovo ${said} in dispensa. Vuoi che lo metta nella lista della spesa?`,
      reprompt: `Metto ${said} nella lista della spesa? Dimmi sì o no.`,
      end: false,
      attrs: { missing: [said] },
    };
  }
  const first = found[0];
  const qty = totalQty(found);
  if (found.length === 1) return { text: `Sì, hai ${lower(first.name)}${qty ? `: ${qty}` : ""}. ${cap(expiryPhrase(first.expiry_date))}.` };
  return {
    text: `Sì, hai ${found.length} confezioni di ${said}${qty ? `, in tutto ${qty}` : ""}. La prima ${expiryPhrase(first.expiry_date).replace(/^è già scaduto/, "è già scaduta")}.`,
  };
}

/** "Quando scade il latte?" */
async function whenExpiresReport(hh: string, raw: string): Promise<Out> {
  const said = productSaid(raw);
  if (!said) return ask("Di quale prodotto vuoi sapere la scadenza?", "Per esempio: quando scade il latte?");
  const found = matching(await loadPantry(hh), said);
  if (!found.length) return { text: `Non trovo ${said} in dispensa.` };
  if (found.length === 1 && !found[0].expiry_date) {
    return askExpiry([{ id: found[0].id, name: found[0].name }], `${cap(lower(found[0].name))} non ha una scadenza segnata.`);
  }
  const lines = found.slice(0, 3).map((i, k) => `${k === 0 ? cap(lower(i.name)) : lower(i.name)} ${expiryPhrase(i.expiry_date)}`);
  const more = found.length > 3 ? ` E ce ne sono altri ${found.length - 3}.` : "";
  return { text: `${listIt(lines)}.${more}` };
}

/** "La mozzarella scade il 30 novembre", "cambia la scadenza del latte" */
async function setExpiry(hh: string, raw: string, dateSlot: string, daysSlot: string): Promise<Out> {
  const said = productSaid(raw);
  if (!said) return ask("Di quale prodotto cambio la scadenza?", "Per esempio: la mozzarella scade il 30 novembre.");
  const it = findItem(await loadPantry(hh), said);
  if (!it) return { text: `Non trovo ${said} in dispensa.` };
  const iso = dateSlot || daysSlot ? expiryFrom(dateSlot, daysSlot) : null;
  if (!iso) return askExpiry([{ id: it.id, name: it.name }], dateSlot || daysSlot ? "Non ho capito la data." : "");
  await db.from("pantry_items").update({ expiry_date: iso, long_life: false }).eq("id", it.id).eq("household_id", hh);
  return { text: `Fatto: ${lower(it.name)} ora scade il ${dateIt(iso)}.` };
}

// le categorie dell'app, come si dicono a voce
const CATEGORIES: Array<[string, string, RegExp]> = [
  ["Ortofrutta", "frutta e verdura", /frutta|verdur|ortofrutta|ortaggi/],
  ["Latticini", "latticini", /latticin|formagg|latte e/],
  ["Carne & Pesce", "carne e pesce", /carne|pesce|carni/],
  ["Dispensa", "dispensa", /dispensa|secch|scatolam|confezionat/],
  ["Surgelati", "surgelati", /surgelat|congelat|freezer/],
  ["Casa", "prodotti per la casa", /casa|pulizi|detersiv|igiene/],
  ["Altro", "altro", /altro|altri|avanz/],
];

/** "carne pesce e latticini" → ["Carne & Pesce", "Latticini"]; "tutti" → "all"; niente → null */
function categoriesSaid(text: string): string[] | "all" | null {
  const n = norm(text);
  if (!n) return null;
  if (/\btutt[oiae]\b|\bogni\b|\bintera\b/.test(n)) return "all";
  const found = CATEGORIES.filter((c) => c[2].test(n)).map((c) => c[0]);
  return found.length ? found : null;
}

const INVENTORY_ASK: Out = {
  text: "Vuoi che ti elenchi tutti i prodotti, o ti interessa una categoria? Per esempio: carne e pesce, latticini, frutta e verdura.",
  reprompt: "Dimmi tutti i prodotti, oppure una o più categorie, per esempio: carne, pesce e latticini.",
  end: false,
  attrs: { inventory: true },
};

/** Elenco della dispensa: tutta, oppure solo alcune categorie (prima i prodotti da usare presto) */
async function inventoryReport(hh: string, which: string[] | "all"): Promise<Out> {
  const all = (await loadPantry(hh)).sort((a, b) => (a.expiry_date ?? "9999").localeCompare(b.expiry_date ?? "9999"));
  const groups = CATEGORIES.filter((c) => which === "all" || which.includes(c[0]))
    .map((c) => ({ label: c[1], items: all.filter((i) => (i.category || "Altro") === c[0]) }))
    .filter((g) => which !== "all" || g.items.length);
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  if (!total) {
    if (which === "all") return { text: "La dispensa è vuota." };
    return { text: `Non hai niente in ${listIt(groups.map((g) => g.label))}.` };
  }
  const perGroup = which === "all" ? 4 : groups.length === 1 ? 10 : 6;
  const parts = groups.map((g) => {
    if (!g.items.length) return `${cap(g.label)}: niente.`;
    const names = [...new Set(g.items.map((i) => lower(i.name)))];
    const shown = names.slice(0, perGroup);
    const rest = names.length - shown.length;
    return `${cap(g.label)}: ${listIt(shown)}${rest > 0 ? `, e altri ${rest}` : ""}.`;
  });
  const head = which === "all" ? `Hai ${total === 1 ? "un prodotto" : `${total} prodotti`}, prima quelli da usare presto. ` : "";
  return { text: `${head}${parts.join(" ")}` };
}

// ---------------------------------------------------------------- spese e risparmio

type Period = { from: string; to: string; label: string; prev: { from: string; to: string; label: string } };

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** "questa settimana", "il mese scorso"… → giorni (YYYY-MM-DD, \"to\" escluso) */
function periodFrom(said: string): Period {
  const n = norm(said);
  const today = romeToday();
  const weekStart = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthStart = (() => {
    const [y, m] = today.split("-").map(Number);
    return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
  })();
  const week = { from: weekStart, to: addDays(today, 1), label: "questa settimana" };
  const lastWeek = { from: addDays(weekStart, -7), to: weekStart, label: "la settimana scorsa" };
  const month = { from: monthStart, to: addDays(today, 1), label: "questo mese" };
  const lastMonth = { from: prevMonthStart, to: monthStart, label: "il mese scorso" };
  if (/settiman/.test(n)) return /scors|passat/.test(n) ? { ...lastWeek, prev: addWeekBefore(lastWeek) } : { ...week, prev: lastWeek };
  if (/oggi/.test(n)) return { from: today, to: addDays(today, 1), label: "oggi", prev: { from: addDays(today, -1), to: today, label: "ieri" } };
  if (/scors|passat/.test(n)) {
    const [y, m] = prevMonthStart.split("-").map(Number);
    const before = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
    return { ...lastMonth, prev: { from: before, to: prevMonthStart, label: "il mese prima" } };
  }
  return { ...month, prev: lastMonth };
}
const addWeekBefore = (w: { from: string; to: string }) => ({ from: addDays(w.from, -7), to: w.from, label: "la settimana prima" });

/** il periodo precedente, fermo allo stesso giorno (1–22 novembre contro 1–22 ottobre) */
function samePart(p: Period) {
  const len = Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86_400_000);
  const cut = addDays(p.prev.from, len);
  const partial = cut < p.prev.to;
  return { from: p.prev.from, to: partial ? cut : p.prev.to, label: partial ? `lo stesso periodo ${p.prev.label === "il mese scorso" ? "del mese scorso" : p.prev.label === "la settimana scorsa" ? "della settimana scorsa" : `di ${p.prev.label}`}` : p.prev.label };
}

/** mezzanotte a Roma di quel giorno, come istante */
function romeMidnight(iso: string) {
  const noon = new Date(`${iso}T12:00:00Z`);
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", timeZoneName: "shortOffset" })
    .formatToParts(noon)
    .find((p) => p.type === "timeZoneName")?.value.match(/GMT([+-]\d+)?/)?.[1];
  const h = Number(off ?? 0);
  return new Date(Date.parse(`${iso}T00:00:00Z`) - h * 3600_000).toISOString();
}

/** "12,50 euro", "3 euro" */
const euroIt = (cents: number) => {
  const e = Math.floor(cents / 100);
  const c = cents % 100;
  return c ? `${e} euro e ${c} centesimi` : `${e} euro`;
};

async function spentIn(hh: string, p: { from: string; to: string }) {
  const [{ data: rec }, { data: lines }] = await Promise.all([
    db.from("grocery_receipts").select("id, store, total_cents").eq("household_id", hh).gte("purchased_on", p.from).lt("purchased_on", p.to),
    db.from("grocery_lines").select("receipt_id, price_cents, category").eq("household_id", hh).gte("purchased_on", p.from).lt("purchased_on", p.to),
  ]);
  const byReceipt = new Map<string, number>();
  let loose = 0;
  const byCat = new Map<string, number>();
  for (const l of lines ?? []) {
    if (l.price_cents == null) continue;
    if (l.receipt_id) byReceipt.set(l.receipt_id, (byReceipt.get(l.receipt_id) ?? 0) + l.price_cents);
    else loose += l.price_cents;
    const c = l.category || "Altro";
    byCat.set(c, (byCat.get(c) ?? 0) + l.price_cents);
  }
  const byStore = new Map<string, number>();
  let total = loose;
  for (const r of rec ?? []) {
    const t = r.total_cents ?? byReceipt.get(r.id) ?? 0;
    total += t;
    const s = (r.store ?? "").trim();
    if (s && t) byStore.set(s, (byStore.get(s) ?? 0) + t);
  }
  const top = <T,>(m: Map<T, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return { total, receipts: (rec ?? []).length, stores: top(byStore), cats: top(byCat) };
}

async function eventsIn(hh: string, p: { from: string; to: string }) {
  const { data } = await db
    .from("pantry_events")
    .select("item_name, outcome, value_cents")
    .eq("household_id", hh)
    .gte("created_at", romeMidnight(p.from))
    .lt("created_at", romeMidnight(p.to));
  const ev = data ?? [];
  const used = ev.filter((e: any) => e.outcome === "consumed");
  const wasted = ev.filter((e: any) => e.outcome === "wasted");
  const sum = (xs: any[]) => xs.reduce((a, e) => a + (e.value_cents ?? 0), 0);
  const names = new Map<string, number>();
  for (const e of wasted) names.set(lower(e.item_name), (names.get(lower(e.item_name)) ?? 0) + 1);
  return {
    used: used.length,
    usedValue: sum(used),
    wasted: wasted.length,
    wastedValue: sum(wasted),
    wastedNames: [...names.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]),
  };
}

async function spendingReport(hh: string, said: string): Promise<Out> {
  const p = periodFrom(said);
  const prev = samePart(p);
  const [now, before] = await Promise.all([spentIn(hh, p), spentIn(hh, prev)]);
  if (!now.total) {
    return { text: `${cap(p.label)} non ho spese registrate. Le spese si aggiungono dall'app, fotografando lo scontrino.` };
  }
  let cmp = "";
  if (before.total) {
    const d = now.total - before.total;
    if (Math.abs(d) >= 100) cmp = ` Sono ${euroIt(Math.abs(d))} ${d > 0 ? "in più" : "in meno"} rispetto a ${prev.label}.`;
    else cmp = ` Più o meno come ${prev.label}.`;
  }
  const n = now.receipts;
  const rec = n ? ` con ${n === 1 ? "una spesa" : `${n} spese`}` : "";
  return { text: `${cap(p.label)} hai speso ${euroIt(now.total)}${rec}.${cmp}` };
}

async function savedReport(hh: string, said: string): Promise<Out> {
  const p = periodFrom(said);
  const e = await eventsIn(hh, p);
  if (!e.used && !e.wasted) return { text: `${cap(p.label)} non hai ancora segnato prodotti usati o buttati. Dimmi per esempio: ho usato due uova.` };
  const parts: string[] = [];
  if (e.usedValue) parts.push(`${cap(p.label)} hai usato cibo per ${euroIt(e.usedValue)} invece di buttarlo: ${e.used === 1 ? "un prodotto" : `${e.used} prodotti`}.`);
  else parts.push(`${cap(p.label)} hai usato ${e.used === 1 ? "un prodotto" : `${e.used} prodotti`} senza sprecarli.`);
  if (e.wasted) parts.push(`Ne hai buttati ${e.wasted}${e.wastedValue ? `, per ${euroIt(e.wastedValue)}` : ""}.`);
  else if (e.used) parts.push("E non hai buttato niente. Bravissimo!");
  if (!e.usedValue) parts.push("Per sapere quanto vale in euro, aggiungi i prezzi con lo scontrino.");
  return { text: parts.join(" ") };
}

async function wastedReport(hh: string, said: string): Promise<Out> {
  const p = periodFrom(said);
  const e = await eventsIn(hh, p);
  if (!e.wasted) return { text: `${cap(p.label)} non hai buttato niente. Ottimo lavoro!` };
  const value = e.wastedValue ? `, per circa ${euroIt(e.wastedValue)}` : "";
  const what = e.wastedNames.length ? ` Tra questi: ${listIt(e.wastedNames.slice(0, 3))}.` : "";
  return { text: `${cap(p.label)} hai buttato ${e.wasted === 1 ? "un prodotto" : `${e.wasted} prodotti`}${value}.${what}` };
}

async function progressReport(hh: string): Promise<Out> {
  const p = periodFrom("mese");
  const [e, now, before] = await Promise.all([eventsIn(hh, p), spentIn(hh, p), spentIn(hh, samePart(p))]);
  const parts: string[] = [];
  const tot = e.used + e.wasted;
  if (tot) {
    const pct = Math.round((e.used / tot) * 100);
    const mood = pct >= 90 ? "Benissimo!" : pct >= 70 ? "Bene." : "Si può fare meglio.";
    parts.push(`${mood} Questo mese hai usato il ${pct} per cento del cibo che hai segnato: ${e.used} prodotti usati e ${e.wasted} buttati.`);
  } else parts.push("Questo mese non hai ancora segnato prodotti usati o buttati.");
  if (now.total) {
    const d = before.total ? now.total - before.total : 0;
    parts.push(`Di spesa sei a ${euroIt(now.total)}${before.total && Math.abs(d) >= 100 ? `, ${euroIt(Math.abs(d))} ${d > 0 ? "in più" : "in meno"} dello stesso periodo del mese scorso` : ""}.`);
  }
  const items = await loadPantry(hh);
  const soon = items.filter((i) => {
    const d = daysLeft(i.expiry_date);
    return d !== null && d >= 0 && d <= 2;
  }).length;
  if (soon) parts.push(`In dispensa ${soon === 1 ? "c'è un prodotto" : `ci sono ${soon} prodotti`} da usare entro due giorni.`);
  return { text: parts.join(" ") };
}

async function topStoreReport(hh: string, said: string): Promise<Out> {
  const p = periodFrom(said);
  const now = await spentIn(hh, p);
  if (!now.total) return { text: `${cap(p.label)} non ho spese registrate.` };
  const parts: string[] = [];
  const [store, cents] = now.stores[0] ?? [];
  if (store) {
    parts.push(`${cap(p.label)} hai speso di più da ${store}: ${euroIt(cents!)}.`);
    if (now.stores[1]) parts.push(`Poi da ${now.stores[1][0]}, ${euroIt(now.stores[1][1])}.`);
  } else parts.push(`${cap(p.label)} non so in quali negozi hai fatto la spesa.`);
  const [cat, cc] = now.cats[0] ?? [];
  if (cat) parts.push(`Il reparto che ti costa di più è ${lower(cat)}, con ${euroIt(cc!)}.`);
  return { text: parts.join(" ") };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- lo Chef a voce (abbonati)

type ChefRecipe = {
  title: string;
  course: string;
  difficulty: string;
  time: string;
  servings: number;
  description: string;
  expiresSoonUsed: string[];
  ingredientsUsed: Array<{ name: string; quantity: number; unit: string }>;
  missingIngredients: string[];
};

const CHEF_DAILY_LIMIT = 15;
const CHEF_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

async function isPremium(userId: string): Promise<boolean> {
  const { data } = await db.from("user_profiles").select("plan_type, premium_until").eq("user_id", userId).maybeSingle();
  const until = data?.premium_until ? Date.parse(String(data.premium_until)) : NaN;
  return data?.plan_type === "premium" && Number.isFinite(until) && until > Date.now();
}

async function chefUsedToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "alexa_chef").gte("created_at", since);
  return count ?? 0;
}

async function logUsage(userId: string, kind: string, data: any) {
  try {
    const u = data?.usage ?? {};
    await db.rpc("srv_log_ai_usage", {
      p_user: userId,
      p_kind: kind,
      p_model: String(data?.model || CHEF_MODEL),
      p_input: Number(u.input_tokens ?? 0) || 0,
      p_output: Number(u.output_tokens ?? 0) || 0,
    });
  } catch {
    /* il registro dei costi non deve fermare Alexa */
  }
}

const outputText = (data: any): string =>
  typeof data?.output_text === "string" && data.output_text
    ? data.output_text
    : (data?.output ?? []).flatMap((o: any) => (o?.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text)).join("");

async function openai(body: unknown, ms: number): Promise<any | null> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("alexa chef openai:", data?.error?.message ?? r.status);
      return null;
    }
    return data;
  } catch (e) {
    console.error("alexa chef openai:", (e as Error)?.message ?? e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Alexa dice subito una frase mentre lo Chef lavora (risposta progressiva) */
async function speakNow(ev: any, speech: string) {
  try {
    const sys = ev?.context?.System;
    if (!sys?.apiEndpoint || !sys?.apiAccessToken) return;
    await fetch(`${sys.apiEndpoint}/v1/directives`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sys.apiAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ header: { requestId: ev.request.requestId }, directive: { type: "VoicePlayer.Speak", speech } }),
    });
  } catch {
    /* se non riesce, pazienza: la risposta arriva comunque */
  }
}

/** Tre proposte veloci dello Chef: solo nomi e ingredienti (il procedimento arriva dopo, nel ricettario) */
async function chefProposals(userId: string, items: Item[]): Promise<ChefRecipe[] | null> {
  const today = items.filter((i) => (daysLeft(i.expiry_date) ?? 99) >= 0);
  const soon = today.filter((i) => (daysLeft(i.expiry_date) ?? 99) <= 3).map((i) => i.name);
  const pantry = today.slice(0, 80).map((i) => `- ${i.name} (${numIt(i.quantity)} ${i.unit})`).join("\n");
  const prompt = `Sei EcoChef, chef di cucina italiana quotidiana e anti-spreco.
Proponi 3 ricette diverse tra loro (per esempio un primo, un secondo e un'alternativa veloce) per 2 persone, da fare con soprattutto gli ingredienti della dispensa, dando la precedenza a quelli in scadenza.
Titoli brevi e riconoscibili, da leggere ad alta voce (massimo 6 parole, niente virgolette).
"ingredientsUsed": solo ingredienti presenti nella dispensa, con quantità per la ricetta.
"missingIngredients": gli ingredienti necessari che NON sono in dispensa, con quantità indicativa (es. "200 g spaghetti", "1 spicchio aglio"); sale, olio e acqua solo se non ci sono.
Niente ingredienti scaduti. Ricette realistiche e coerenti.

DISPENSA:
${pantry || "vuota"}
${soon.length ? `\nIN SCADENZA (da usare per primi): ${soon.join(", ")}` : ""}`;
  const data = await openai(
    {
      model: CHEF_MODEL,
      input: prompt,
      max_output_tokens: 900,
      text: {
        format: {
          type: "json_schema",
          name: "chef",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["recipes"],
            properties: {
              recipes: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "course", "difficulty", "time", "servings", "description", "expiresSoonUsed", "ingredientsUsed", "missingIngredients"],
                  properties: {
                    title: { type: "string" },
                    course: { type: "string", enum: ["primo", "secondo", "contorno", "dolce", "altro"] },
                    difficulty: { type: "string", enum: ["Facile", "Media", "Difficile"] },
                    time: { type: "string" },
                    servings: { type: "integer" },
                    description: { type: "string" },
                    expiresSoonUsed: { type: "array", items: { type: "string" } },
                    ingredientsUsed: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["name", "quantity", "unit"],
                        properties: { name: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" } },
                      },
                    },
                    missingIngredients: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    6000
  );
  if (!data) return null;
  await logUsage(userId, "alexa_chef", data);
  try {
    const out = JSON.parse(outputText(data));
    const recipes = (Array.isArray(out?.recipes) ? out.recipes : []).filter((r: any) => typeof r?.title === "string" && r.title.trim()).slice(0, 3);
    return recipes.length ? recipes : null;
  } catch {
    return null;
  }
}

/** Salva la ricetta scelta nel ricettario e prepara il procedimento in sottofondo */
async function saveChefRecipe(userId: string, r: ChefRecipe): Promise<void> {
  const recipe = { ...r, steps: [] as string[] };
  const { data: row, error } = await db
    .from("recipes_saved")
    .insert({
      user_id: userId,
      source: "suggest",
      title: r.title,
      course: r.course,
      difficulty: r.difficulty,
      time: r.time,
      servings: r.servings,
      description: r.description,
      ingredients_used: r.ingredientsUsed,
      missing_ingredients: r.missingIngredients,
      steps: [],
      recipe_json: recipe,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("alexa chef save:", error?.message);
    return;
  }
  const work = (async () => {
    const ings = [...r.ingredientsUsed.map((i) => `${numIt(i.quantity)} ${i.unit} ${i.name}`), ...r.missingIngredients].join(", ");
    const data = await openai(
      {
        model: CHEF_MODEL,
        input: `Sei EcoChef. Scrivi il procedimento della ricetta "${r.title}" (${r.servings} persone) con questi ingredienti: ${ings}.
Almeno 7 passaggi pratici e ordinati, ognuno autonomo e concreto, con tempi, fiamma, temperatura o segnali visivi quando serve. L'ultimo spiega come servire.`,
        text: {
          format: {
            type: "json_schema",
            name: "steps",
            strict: true,
            schema: { type: "object", additionalProperties: false, required: ["steps"], properties: { steps: { type: "array", items: { type: "string" } } } },
          },
        },
      },
      40000
    );
    if (!data) return;
    await logUsage(userId, "recipes", data);
    try {
      const steps = (JSON.parse(outputText(data))?.steps ?? []).filter((x: any) => typeof x === "string" && x.trim());
      if (steps.length) await db.from("recipes_saved").update({ steps, recipe_json: { ...recipe, steps } }).eq("id", row.id);
    } catch {
      /* il procedimento si può rigenerare dall'app */
    }
  })();
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work);
}

/** "il secondo", "la terza", "spaghetti al pesto" → indice della proposta */
const ORDINALS: Record<string, number> = { primo: 0, prima: 0, uno: 0, "1": 0, secondo: 1, seconda: 1, due: 1, "2": 1, terzo: 2, terza: 2, tre: 2, "3": 2 };
function pickRecipe(recipes: ChefRecipe[], said: string): number {
  const n = norm(said);
  for (const w of n.split(" ")) if (w in ORDINALS && ORDINALS[w] < recipes.length) return ORDINALS[w];
  if (/\bultim/.test(n)) return recipes.length - 1;
  let best = -1;
  let bestScore = 0.3;
  recipes.forEach((r, i) => {
    const sc = matchScore(n, r.title);
    if (sc > bestScore) {
      best = i;
      bestScore = sc;
    }
  });
  return best;
}

const HELP =
  "Puoi chiedermi: cosa scade; ho usato 300 grammi di pasta; ho buttato l'insalata; aggiungi 500 grammi di spaghetti in dispensa; aggiungi il pane alla lista della spesa; prepariamo la lista della spesa; leggimi la lista; quanto ho speso questo mese; come sto andando; oppure cosa posso cucinare.";

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
  const intent = type === "IntentRequest" ? (ev.request.intent?.name as string) : "";
  if (intent) console.log("alexa intent:", intent);
  const attrs = (ev?.session?.attributes ?? {}) as { pending?: Pending[]; list?: Said[]; chef?: ChefRecipe[]; missing?: string[]; inventory?: boolean; boughtAll?: boolean };
  const list = Array.isArray(attrs.list) ? attrs.list : null;
  const pending = Array.isArray(attrs.pending) && attrs.pending.length ? attrs.pending : null;
  const chef = Array.isArray(attrs.chef) && attrs.chef.length ? attrs.chef : null;
  const missing = Array.isArray(attrs.missing) && attrs.missing.length ? attrs.missing : null;
  const inventory = attrs.inventory === true;
  const confirmBought = attrs.boughtAll === true;
  const isStop = ["AMAZON.StopIntent", "AMAZON.CancelIntent", "AMAZON.NavigateHomeIntent"].includes(intent);

  // senza niente in sospeso: stop e fine sessione non hanno bisogno dell'account
  if (!list?.length) {
    if (type === "SessionEndedRequest") return json({ version: "1.0", response: {} });
    if (isStop || (intent === "AMAZON.NoIntent" && !pending && !missing && !confirmBought)) return alexaResponse({ text: "A presto!" });
  }
  if (intent === "AMAZON.HelpIntent") return alexaResponse({ ...ask(HELP), attrs });

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
    if (type === "SessionEndedRequest") return json({ version: "1.0", response: {} });
    return alexaResponse({
      text: "Per usare EcoDispensa collega il tuo account: apri l'app Alexa sul telefono, ti ho mandato una scheda per farlo.",
      linkAccount: true,
    });
  }
  const { data: member } = await db.from("household_members").select("household_id, display_name").eq("user_id", userId).maybeSingle();
  if (!member?.household_id) return alexaResponse({ text: "Non trovo la tua dispensa. Apri l'app EcoDispensa e riprova." });
  const hh = member.household_id as string;
  const first = (member.display_name ?? "").trim().split(/\s+/)[0] ?? "";
  const firstName = first ? first.charAt(0).toUpperCase() + first.slice(1) : "";

  // aperta con "apri la mia dispensa": dopo ogni risposta resto in ascolto; frase unica ("chiedi a…"): chiudo
  const inSession = ev?.session?.new === false;
  const more = (o: Out): Out => (inSession && o.end !== false ? { ...o, text: `${o.text} Altro?`, reprompt: "Vuoi fare altro? Puoi dire: stop.", end: false } : o);
  const slot = (name: string) => (ev.request.intent?.slots?.[name]?.value as string | undefined)?.trim() ?? "";

  try {
    // ---- lista della spesa a voce: i prodotti si accumulano finché l'utente dice "chiudi lista"
    if (list) {
      const close = async (prefix = "") => {
        if (!list.length) return { text: `${prefix}La lista è vuota, non ho salvato niente.` } as Out;
        const out = await saveShopping(userId!, hh, list);
        return { text: `${prefix}${out.text}` } as Out;
      };
      if (type === "SessionEndedRequest") {
        await close();
        return json({ version: "1.0", response: {} });
      }
      if (intent === "CloseListIntent" || isStop || intent === "AMAZON.NoIntent") {
        const out = await close();
        return alexaResponse(isStop ? out : more(out));
      }
      if (intent === "StartListIntent") return alexaResponse({ text: "La lista è già aperta: dimmi i prodotti.", reprompt: "Quando hai finito di' chiudi lista.", end: false, attrs: { list } });
      // durante la lista ogni frase con un prodotto è un prodotto da segnare (anche se Alexa l'ha presa per un altro comando)
      const what = slot("prodotti") || slot("prodotto") || slot("piatto") || [slot("categoria"), slot("categoriadue"), slot("categoriatre")].filter(Boolean).join(" e ");
      console.log("alexa lista:", list.length, "prodotti, ricevuto:", what || "(niente)");
      const keep = (text: string, reprompt = "Altro? Quando hai finito di' chiudi lista."): Response =>
        alexaResponse({ text, reprompt, end: false, attrs: { list } });
      if (what) {
        const parts = splitParts(what).map(parsePart).filter((p): p is Said => !!p);
        if (!parts.length) return keep("Non ho capito, ripeti.");
        const next = [...list, ...parts].slice(0, 60);
        // risposta corta: Alexa riascolta subito
        return alexaResponse({
          text: `Segnato ${listIt(parts.map((p) => p.name))}.`,
          reprompt: "Altro? Quando hai finito di' chiudi lista.",
          end: false,
          attrs: { list: next },
        });
      }
      if (intent === "AMAZON.FallbackIntent") return keep("Non ho capito, ripeti.");
      if (intent === "AMAZON.YesIntent") return keep("Dimmi pure.");
      // altri comandi: la lista resta aperta finché non dici chiudi lista
      return keep("Stiamo facendo la lista: dimmi un prodotto, oppure chiudi lista.");
    }

    // ---- lo Chef ha proposto le ricette: l'utente sceglie
    if (chef) {
      if (intent === "ChooseRecipeIntent" || intent === "ChooseDishIntent" || intent === "ListItemsIntent" || intent === "CategoryIntent" || intent === "AMAZON.FallbackIntent" || (intent === "AMAZON.YesIntent" && chef.length === 1)) {
        const said = intent === "AMAZON.YesIntent" ? "primo" : slot("numero") || slot("piatto") || slot("prodotti") || slot("categoria");
        const i = said ? pickRecipe(chef, said) : -1;
        if (i < 0) {
          return alexaResponse({
            text: `Non ho capito quale. Le proposte sono: ${listIt(chef.map((r) => r.title))}. Quale preferisci?`,
            reprompt: "Puoi dire il primo, il secondo o il terzo, oppure il nome del piatto.",
            end: false,
            attrs: { chef },
          });
        }
        const r = chef[i];
        await saveChefRecipe(userId, r);
        const saved = `Ottima scelta: ${r.title}. L'ho salvata nel ricettario, il procedimento lo trovi nell'app.`;
        if (r.missingIngredients.length) {
          return alexaResponse({
            text: `${saved} Per questa ricetta ${r.missingIngredients.length === 1 ? "manca" : "mancano"} ${listIt(r.missingIngredients.map((x) => parsePart(x)?.name ?? x))}. Vuoi che li metta nella lista della spesa?`,
            reprompt: "Li metto nella lista della spesa? Dimmi sì o no.",
            end: false,
            attrs: { missing: r.missingIngredients },
          });
        }
        return alexaResponse(more({ text: `${saved} Hai già tutto quello che serve. Buon appetito!` }));
      }
      if (isStop || intent === "AMAZON.NoIntent") return alexaResponse({ text: "Va bene, a presto!" });
    }
    if (confirmBought) {
      if (intent === "AMAZON.YesIntent") return alexaResponse(more(await boughtAll(hh)));
      if (intent === "AMAZON.NoIntent") return alexaResponse(more({ text: "Va bene, non cambio niente." }));
    }
    if (missing) {
      if (intent === "AMAZON.YesIntent") {
        const parts = missing.map(parsePart).filter((p): p is Said => !!p);
        return alexaResponse(more(await saveShopping(userId, hh, parts)));
      }
      if (intent === "AMAZON.NoIntent") return alexaResponse(more({ text: "Va bene, non li aggiungo." }));
    }
    // ---- "vuoi tutti i prodotti o una categoria?": la risposta può arrivare come qualunque frase
    if (inventory && !isStop && intent !== "AMAZON.NoIntent") {
      const cats = [slot("categoria"), slot("categoriadue"), slot("categoriatre")].filter(Boolean).join(" e ");
      const said = [cats, slot("prodotti"), slot("prodotto"), slot("piatto")].filter(Boolean).join(" e ");
      const which = intent === "AMAZON.YesIntent" || (intent === "CategoryIntent" && !cats) ? "all" : categoriesSaid(said);
      if (which) return alexaResponse(more(await inventoryReport(hh, which)));
      if (intent === "AMAZON.FallbackIntent" || intent === "ListItemsIntent") {
        return alexaResponse({ ...INVENTORY_ASK, text: "Non ho capito. Dimmi tutti i prodotti, oppure una categoria: frutta e verdura, latticini, carne e pesce, dispensa, surgelati, casa o altro." });
      }
    }
    if (intent === "ChooseRecipeIntent" || intent === "ChooseDishIntent") return alexaResponse(ask("Prima chiedimi cosa posso cucinare, così lo Chef ti fa le sue proposte.", "Cosa vuoi fare?"));

    if (intent === "StartListIntent") {
      return alexaResponse({
        text: "Va bene, dimmi cosa serve. Quando hai finito di' chiudi lista.",
        reprompt: "Dimmi i prodotti, per esempio: latte, pane e sei uova. Quando hai finito di' chiudi lista.",
        end: false,
        attrs: { list: [] },
      });
    }
    if (intent === "CloseListIntent") return alexaResponse(more({ text: "Non c'è una lista aperta. Per cominciare di' prepariamo la lista della spesa." }));

    // ---- scadenza dei prodotti appena aggiunti
    if (pending) {
      if (intent === "ExpiryIntent") {
        const iso = expiryFrom(slot("data"), slot("giorni"));
        if (!iso) return alexaResponse(askExpiry(pending, "Non ho capito la data."));
        await db.from("pantry_items").update({ expiry_date: iso }).eq("id", pending[0].id).eq("household_id", hh);
        const rest = pending.slice(1);
        const ok = `Va bene, ${lower(pending[0].name)} scade il ${dateIt(iso)}.`;
        return alexaResponse(rest.length ? askExpiry(rest, ok) : more({ text: ok }));
      }
      if (intent === "AMAZON.NoIntent" || intent === "AMAZON.FallbackIntent") {
        const rest = pending.slice(1);
        const skip = `Va bene, la scadenza di ${lower(pending[0].name)} la puoi aggiungere dall'app.`;
        return alexaResponse(rest.length ? askExpiry(rest, skip) : more({ text: skip }));
      }
      if (isStop) return alexaResponse({ text: "A presto!" });
    }
    if (intent === "ExpiryIntent") return alexaResponse(more({ text: "Per dirmi una scadenza, prima aggiungi il prodotto: per esempio, aggiungi una mozzarella in dispensa." }));
    if (intent === "ListItemsIntent") return alexaResponse(ask("Vuoi fare la lista della spesa? Di' prepariamo la lista della spesa.", "Cosa vuoi fare?"));

    if (type === "LaunchRequest") {
      return alexaResponse({
        text: `Ciao${firstName ? ` ${firstName}` : ""}, come posso aiutarti?`,
        reprompt: "Puoi chiedermi cosa scade, cosa posso cucinare, oppure di preparare la lista della spesa.",
        end: false,
      });
    }
    if (intent === "ExpiringTodayIntent") {
      const items = await loadPantry(hh);
      const today = items.filter((i) => daysLeft(i.expiry_date) === 0).map((i) => lower(i.name));
      const expired = items.filter((i) => (daysLeft(i.expiry_date) ?? 1) < 0).map((i) => lower(i.name));
      const parts: string[] = [];
      parts.push(today.length ? `Oggi ${today.length === 1 ? "scade" : "scadono"} ${listIt(today.slice(0, 6))}.` : "Oggi non scade niente.");
      if (expired.length) parts.push(`${expired.length === 1 ? "È già scaduto" : "Sono già scaduti"} ${listIt(expired.slice(0, 4))}.`);
      return alexaResponse(more({ text: parts.join(" ") }));
    }
    if (intent === "ExpiringIntent") {
      const items = await loadPantry(hh);
      const { text } = expiringSentence(items, 8);
      return alexaResponse(more({ text: text || "Niente scade nei prossimi tre giorni. Bravo!" }));
    }
    if (intent === "UseIntent" || intent === "WasteIntent") {
      const what = slot("prodotto");
      if (!what) return alexaResponse(ask(intent === "WasteIntent" ? "Cosa hai buttato?" : "Cosa hai usato?", "Per esempio: 300 grammi di pasta."));
      // "togli il pane dalla lista" a volte arriva qui
      if (/\b(dalla|nella|della) (lista|spesa)\b|\blista della spesa\b/.test(norm(what))) return alexaResponse(more(await removeFromList(hh, what)));
      if (ALL_WORDS.test(norm(what))) return alexaResponse(await askBoughtAll(hh));
      const out = await takeFromPantry(userId, hh, what, intent === "WasteIntent" ? "wasted" : "consumed");
      return alexaResponse(out.end === false ? out : more(out));
    }
    if (intent === "AddShoppingIntent") {
      const what = slot("prodotto");
      if (!what) return alexaResponse(ask("Cosa aggiungo alla lista della spesa?", "Per esempio: il pane."));
      return alexaResponse(more(await addToShopping(userId, hh, what)));
    }
    if (intent === "AddPantryIntent") {
      const what = slot("prodotto");
      if (!what) return alexaResponse(ask("Cosa aggiungo in dispensa?", "Per esempio: 500 grammi di spaghetti."));
      if (ALL_WORDS.test(norm(what))) return alexaResponse(await askBoughtAll(hh));
      const out = await addToPantry(userId, what);
      await dropFromList(hh, what);
      return alexaResponse(out.end === false ? out : more(out));
    }
    if (intent === "HaveIntent") {
      const what = slot("prodotto");
      // a volte Alexa prende "ho usato…" o "cosa c'è in frigo" per questa domanda
      const n = norm(what);
      const verb = n.match(/^(usat|consumat|finit|mangiat|buttat|sprecat)\w*\s+/);
      if (verb) {
        const out = await takeFromPantry(userId, hh, n.slice(verb[0].length), /^(buttat|sprecat)/.test(verb[1]) ? "wasted" : "consumed");
        return alexaResponse(out.end === false ? out : more(out));
      }
      if (/^(in |nel |nella )?(dispensa|casa)$/.test(n)) return alexaResponse(INVENTORY_ASK);
      const out = await haveReport(hh, what);
      return alexaResponse(out.end === false ? out : more(out));
    }
    if (intent === "InventoryIntent" || intent === "CategoryIntent") {
      const cats = [slot("categoria"), slot("categoriadue"), slot("categoriatre")].filter(Boolean).join(" e ");
      // CategoryIntent senza categorie = "tutti i prodotti"
      const which = intent === "CategoryIntent" && !cats ? "all" : categoriesSaid(cats);
      if (!which) return alexaResponse(INVENTORY_ASK);
      return alexaResponse(more(await inventoryReport(hh, which)));
    }
    if (intent === "WhenExpiresIntent") {
      const out = await whenExpiresReport(hh, slot("prodotto"));
      return alexaResponse(out.end === false ? out : more(out));
    }
    if (intent === "SetExpiryIntent") {
      const out = await setExpiry(hh, slot("cibo"), slot("data"), slot("giorni"));
      return alexaResponse(out.end === false ? out : more(out));
    }
    if (intent === "ReadListIntent") return alexaResponse(more(await readList(hh)));
    if (intent === "RemoveShoppingIntent") {
      const what = slot("prodotto");
      if (!what) return alexaResponse(ask("Cosa tolgo dalla lista?", "Per esempio: togli il pane dalla lista."));
      return alexaResponse(more(await removeFromList(hh, what)));
    }
    if (intent === "BoughtIntent") {
      const out = await boughtItems(hh, slot("prodotto"));
      return alexaResponse(out.end === false ? out : more(out));
    }
    if (intent === "BoughtAllIntent") return alexaResponse(await askBoughtAll(hh));
    if (intent === "SpendingIntent") return alexaResponse(more(await spendingReport(hh, slot("periodo"))));
    if (intent === "SavedIntent") return alexaResponse(more(await savedReport(hh, slot("periodo"))));
    if (intent === "WastedReportIntent") return alexaResponse(more(await wastedReport(hh, slot("periodo"))));
    if (intent === "ProgressIntent") return alexaResponse(more(await progressReport(hh)));
    if (intent === "TopStoreIntent") return alexaResponse(more(await topStoreReport(hh, slot("periodo"))));
    if (intent === "CookIntent") {
      const [items, premium, used] = await Promise.all([loadPantry(hh), isPremium(userId), chefUsedToday(userId)]);
      if (!premium) {
        const idea = await cookIdea(userId, items);
        return alexaResponse(more({ ...idea, text: `Lo Chef a voce è incluso nell'abbonamento; dall'app puoi usarlo con i crediti. Intanto, dal tuo ricettario: ${idea.text}` }));
      }
      if (used >= CHEF_DAILY_LIMIT) {
        return alexaResponse(more({ text: "Per oggi lo Chef ha già proposto tante ricette. Riprova domani, oppure aprilo nell'app." }));
      }
      const [, recipes] = await Promise.all([speakNow(ev, "Bene, vediamo cosa ci propone lo Chef."), chefProposals(userId, items)]);
      if (!recipes) {
        const idea = await cookIdea(userId, items);
        return alexaResponse(more({ ...idea, text: `Lo Chef in questo momento non risponde. ${idea.text}` }));
      }
      if (recipes.length === 1) {
        return alexaResponse({
          text: `Lo Chef propone ${recipes[0].title}. Ti va?`,
          reprompt: "Ti va questa ricetta? Dimmi il primo per sceglierla, oppure stop.",
          end: false,
          attrs: { chef: recipes },
        });
      }
      return alexaResponse({
        text: `Lo Chef propone: ${listIt(recipes.map((r) => r.title))}. Quale preferisci?`,
        reprompt: "Puoi dire il primo, il secondo o il terzo, oppure il nome del piatto.",
        end: false,
        attrs: { chef: recipes },
      });
    }
    if (isStop || intent === "AMAZON.NoIntent") return alexaResponse({ text: "A presto!" });
    if (type === "SessionEndedRequest") return json({ version: "1.0", response: {} });
    if (intent === "AMAZON.YesIntent") return alexaResponse(ask("Dimmi pure.", "Per esempio: ho usato due uova, oppure: cosa scade."));
    if (intent === "AMAZON.FallbackIntent") return alexaResponse(ask(`Non ho capito. ${HELP}`));
    return alexaResponse(ask(HELP));
  } catch (e) {
    console.error("alexa error:", e);
    return alexaResponse({ text: "Scusa, qualcosa non ha funzionato. Riprova tra poco." });
  }
}

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname;
  if (path.includes("/collega/")) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      if (path.endsWith("/collega/start")) return await linkStart(req);
      if (path.endsWith("/collega/finish")) return await linkFinish(req);
      if (path.endsWith("/collega/stato")) return await linkStatus(req);
      if (path.endsWith("/collega/scollega")) return await linkRemove(req);
    } catch (e) {
      console.error("alexa collega:", e);
      return cors({ error: "SERVER_ERROR" }, 500);
    }
    return cors({ error: "NOT_FOUND" }, 404);
  }
  if (req.method !== "POST") return new Response("EcoDispensa per Alexa", { status: 200 });
  if (path.endsWith("/token")) return tokenEndpoint(req);
  return skill(req);
});
