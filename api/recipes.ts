import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type CacheEntry = { ts: number; value: any };
const TTL_MS = 60_000;
const MAX_ENTRIES = 100;

const g = globalThis as any;
g.__ecoRecipesCache = g.__ecoRecipesCache ?? new Map<string, CacheEntry>();
g.__ecoRecipesInflight = g.__ecoRecipesInflight ?? new Map<string, Promise<any>>();

const cache: Map<string, CacheEntry> = g.__ecoRecipesCache;
const inflight: Map<string, Promise<any>> = g.__ecoRecipesInflight;

function pruneCache() {
  if (cache.size <= MAX_ENTRIES) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
  const toRemove = entries.slice(0, Math.max(0, cache.size - MAX_ENTRIES));
  for (const [k] of toRemove) cache.delete(k);
}

function stableStringify(obj: any) {
  const seen = new WeakSet();
  const sorter = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return null;
      seen.add(v);
      if (Array.isArray(v)) return v.map(sorter);
      return Object.keys(v)
        .sort()
        .reduce((acc: any, k: string) => {
          acc[k] = sorter(v[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(sorter(obj));
}

function getBearerToken(req: VercelRequest): string | null {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h || typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

type PantryItem = {
  name: string;
  quantity?: number;
  unit?: string;
  expiryDate?: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY not set" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY" });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Missing Authorization Bearer token" });

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: "Invalid session", details: userErr?.message });
    }

    const user_id = userData.user.id;
    const body = req.body ?? {};
    const pantryItems: PantryItem[] | undefined = Array.isArray(body.pantryItems) ? body.pantryItems : undefined;

    const constraints = body.constraints ?? {};
    const servings: number = Number(constraints.servings ?? body.servings ?? 2);
    const timeMinutes: number = Number(constraints.timeMinutes ?? body.timeMinutes ?? 30);

    const inventoryList: string | undefined = typeof body.inventoryList === "string" ? body.inventoryList : undefined;
    const idea: string | undefined =
      typeof constraints.idea === "string"
        ? constraints.idea.trim()
        : typeof body.idea === "string"
          ? body.idea.trim()
          : undefined;

    if ((!pantryItems || pantryItems.length === 0) && !inventoryList) {
      if (!idea) {
        return res.status(400).json({
          error: "Non ci sono ingredienti validi in dispensa. Rimuovi i prodotti scaduti o aggiungi nuovi prodotti.",
        });
      }
    }

    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("diet, lactose_free, avoid, allergies, default_servings, max_time_minutes_default")
      .eq("user_id", user_id)
      .maybeSingle();

    if (profileErr) return res.status(500).json({ error: profileErr.message });

    const diet = (profile?.diet ?? "omnivore") as string;
    const lactoseFree = Boolean(profile?.lactose_free ?? false);
    const avoid: string[] = Array.isArray(profile?.avoid) ? profile!.avoid : [];
    const allergies: string[] = Array.isArray(profile?.allergies) ? profile!.allergies : [];

    const finalServings = Number.isFinite(servings) && servings > 0 ? servings : Number(profile?.default_servings ?? 2);
    const finalTime = Number.isFinite(timeMinutes) && timeMinutes > 0 ? timeMinutes : Number(profile?.max_time_minutes_default ?? 30);

    let pantryText = "";
    let expiredPantryText = "";
    let expiringSoonPantryText = "";

    if (pantryItems && pantryItems.length > 0) {
      const nowDate = new Date();
      nowDate.setHours(0, 0, 0, 0);

      const soonThreshold = new Date(nowDate);
      soonThreshold.setDate(soonThreshold.getDate() + 3);

      const normalized = pantryItems
        .map((it) => {
          const name = String(it.name ?? "").trim();
          const quantity = typeof it.quantity === "number" ? it.quantity : undefined;
          const unit = typeof it.unit === "string" ? it.unit : undefined;
          const expiryDate = it.expiryDate ? String(it.expiryDate) : null;

          let expiryTs: number | null = null;
          if (expiryDate) {
            const parsed = new Date(expiryDate);
            const ts = parsed.getTime();
            if (!Number.isNaN(ts)) {
              parsed.setHours(0, 0, 0, 0);
              expiryTs = parsed.getTime();
            }
          }

          return { name, quantity, unit, expiryDate, expiryTs };
        })
        .filter((it) => it.name.length > 0);

      normalized.sort((a, b) => {
        const da = a.expiryTs ?? Number.POSITIVE_INFINITY;
        const db = b.expiryTs ?? Number.POSITIVE_INFINITY;
        return da - db;
      });

      const availableItems = normalized.filter((it) => {
        if (it.expiryTs == null) return true;
        return it.expiryTs >= nowDate.getTime();
      });

      const expiredItems = normalized.filter((it) => {
        if (it.expiryTs == null) return false;
        return it.expiryTs < nowDate.getTime();
      });

      const expiringSoonItems = availableItems.filter((it) => {
        if (it.expiryTs == null) return false;
        return it.expiryTs <= soonThreshold.getTime();
      });

      const formatItem = (it: { name: string; quantity?: number; unit?: string; expiryDate?: string | null }) => {
        const qty = it.quantity != null ? ` - qty: ${it.quantity}${it.unit ? " " + it.unit : ""}` : "";
        const exp = it.expiryDate ? ` - expiry: ${it.expiryDate}` : "";
        return `• ${it.name}${qty}${exp}`;
      };

      pantryText = availableItems.map(formatItem).join("\n");
      expiredPantryText = expiredItems.map(formatItem).join("\n");
      expiringSoonPantryText = expiringSoonItems.map(formatItem).join("\n");
    } else if (inventoryList) {
      pantryText = inventoryList.trim();
    }

    if (!pantryText && idea) {
      pantryText = "Nessun ingrediente valido disponibile in dispensa.";
    }

    const keyObj = {
      model,
      pantryItems: pantryItems ?? inventoryList ?? "",
      finalServings,
      finalTime,
      diet,
      lactoseFree,
      avoid,
      allergies,
      idea: idea ?? "",
    };
    const cacheKey = stableStringify(keyObj);

    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < TTL_MS) {
      return res.status(200).json({ ...cached.value, cached: true });
    }

    const existing = inflight.get(cacheKey);
    if (existing) {
      const value = await existing;
      return res.status(200).json({ ...value, deduped: true });
    }

    const { data: remainingAfterConsume, error: creditErr } = await supabase.rpc("consume_eco_credit");
    if (creditErr) {
      if (String(creditErr.message || "").includes("NO_CREDITS")) {
        return res.status(402).json({
          error: "NO_CREDITS",
          message: "Crediti EcoChef esauriti. Acquista un pacchetto crediti per continuare.",
        });
      }
      return res.status(500).json({ error: creditErr.message });
    }

    const rules: string[] = [];
    rules.push(`Diet: ${diet}.`);
    rules.push(`Lactose-free: ${lactoseFree ? "YES" : "NO"}.`);
    if (avoid.length) rules.push(`Avoid ingredients: ${avoid.join(", ")}.`);
    if (allergies.length) rules.push(`Allergies: ${allergies.join(", ")}.`);

    const userRequestBlock = idea
      ? `
RICHIESTA UTENTE:
- ${idea}
`.trim()
      : "";

    const expiredBlock = expiredPantryText
      ? `
INGREDIENTI SCADUTI (NON USARLI MAI):
${expiredPantryText}
`.trim()
      : "";

    const expiringSoonBlock = expiringSoonPantryText
      ? `
INGREDIENTI IN SCADENZA A BREVE (DA PRIORITIZZARE):
${expiringSoonPantryText}
`.trim()
      : "";

    const prompt = `
Sei EcoChef, uno chef personale esperto di cucina italiana, cucina quotidiana, anti-spreco e ricette spiegate passo-passo.

OBIETTIVO PRINCIPALE:
${idea
  ? `- Genera UNA SOLA ricetta completa e coerente con questa richiesta: "${idea}".`
  : "- Suggerisci 3 ricette complete usando soprattutto gli ingredienti disponibili in dispensa."}
- La ricetta deve essere coerente: titolo, descrizione, ingredienti e passaggi devono appartenere allo stesso piatto.
- Ogni ricetta deve accompagnare l'utente dall'inizio alla fine, come farebbe uno chef con una persona inesperta.
- Non generare mai passaggi scollegati dal titolo della ricetta.
- Non mescolare ingredienti dolci e salati in modo incoerente. Esempio: se il titolo è "Torta di mele", non usare mozzarella, guanciale, pasta, vongole, carne o ingredienti salati non pertinenti.
- Non usare ingredienti scaduti.
- Dai priorità agli ingredienti disponibili e non scaduti.
- Se mancano ingredienti necessari alla ricetta richiesta, inseriscili in "missingIngredients".

VINCOLI:
- Porzioni: ${finalServings}
- Tempo massimo indicativo: ${finalTime} minuti
- ${rules.join(" ")}

DISPENSA DISPONIBILE:
${pantryText || "Nessun ingrediente valido disponibile in dispensa."}

${expiringSoonBlock}

${expiredBlock}

${userRequestBlock}

REGOLE DIETETICHE E DI SICUREZZA:
- Se lactose-free = YES: evita latte, burro, panna, yogurt e formaggi tradizionali, salvo alternative senza lattosio.
- Se diet = veg: niente carne e niente pesce.
- Se diet = vegan: niente carne, pesce, uova, latte, burro, formaggi, yogurt, miele o altri ingredienti animali.
- Non usare ingredienti presenti in "Avoid ingredients".
- Non usare ingredienti presenti in "Allergies".
- Se un ingrediente è incompatibile con anche uno solo dei vincoli attivi, non deve comparire nella ricetta.
- Usa come "expiresSoonUsed" solo ingredienti realmente presenti in dispensa, non scaduti.
- Non inventare disponibilità in dispensa.
- Se un ingrediente NON è nella DISPENSA DISPONIBILE, deve stare in "missingIngredients".
- Se la dispensa è vuota, "ingredientsUsed" deve essere [] e tutti gli ingredienti necessari devono stare in "missingIngredients".

REGOLE DI QUALITÀ DELLA RICETTA:
- La ricetta deve sembrare cucinabile davvero, non una descrizione generica.
- "description" deve essere breve, chiara e coerente con il titolo.
- "ingredientsUsed" deve contenere solo ingredienti realmente disponibili in dispensa.
- "missingIngredients" deve contenere ingredienti specifici e acquistabili.
- Non usare mai nomi vaghi come "pasta avanzata", "pasta a scelta", "formaggio a piacere", "verdure miste", "ingredienti vari", "condimento pronto".
- Per la pasta specifica sempre il formato: spaghetti, penne, rigatoni, fusilli, linguine, tagliatelle, ecc.
- Per il riso specifica il tipo se rilevante: Carnaroli, Arborio, riso basmati, riso originario, ecc.
- Per dolci, usa ingredienti coerenti da pasticceria.
- Per primi piatti, spiega chiaramente acqua, sale, cottura, condimento e mantecatura.
- Per risotti, spiega tostatura, aggiunta graduale del brodo, tempo di cottura e mantecatura.
- Per carne/pesce, indica cottura, temperatura/fiamma e controllo della cottura.
- Per piatti al forno, indica temperatura, preriscaldamento e tempo indicativo.

REGOLE SUI PASSAGGI:
- "steps" deve contenere almeno 7 passaggi pratici.
- Ogni passaggio deve essere autonomo, concreto e utile.
- Ogni passaggio deve spiegare cosa fare, con tempi, fiamma, temperatura o consistenza quando utile.
- Non usare frasi generiche tipo "prepara la ricetta", "cuoci tutto", "mescola gli ingredienti" senza spiegare come.
- Non ripetere la descrizione come passaggio.
- L'utente deve poter cucinare seguendo solo i passaggi.
- I passaggi devono essere ordinati cronologicamente.
- L'ultimo passaggio deve spiegare come completare, impiattare o servire.

OUTPUT OBBLIGATORIO:
- Rispondi SOLO con un JSON array valido.
- Nessun testo fuori dal JSON.
${idea ? "- Restituisci esattamente 1 ricetta." : "- Restituisci esattamente 3 ricette."}
${idea ? "- La ricetta deve essere solo quella richiesta dall'utente, senza alternative non richieste." : ""}
- Ogni oggetto deve rispettare questa struttura:
[
  {
    "title": "Nome coerente della ricetta",
    "difficulty": "Facile|Media|Difficile",
    "time": "es. 35 min",
    "servings": ${finalServings},
    "description": "Descrizione breve e coerente con il piatto.",
    "expiresSoonUsed": ["solo ingredienti in scadenza usati davvero"],
    "ingredientsUsed": [
      {"name":"ingrediente disponibile", "quantity": 100, "unit":"g|kg|l|ml|pz"}
    ],
    "missingIngredients": [
      "ingrediente mancante specifico con quantità indicativa"
    ],
    "steps": [
      "Prepara tutti gli ingredienti: lava, pesa, taglia o misura ciò che serve.",
      "Esegui il primo passaggio operativo spiegando cosa fare e per quanto tempo.",
      "Prosegui con la preparazione principale indicando fiamma, temperatura o consistenza.",
      "Aggiungi gli ingredienti nel giusto ordine spiegando quando e perché.",
      "Completa la cottura indicando tempi indicativi e segnali visivi.",
      "Regola sapore e consistenza con istruzioni pratiche.",
      "Impiatta e servi spiegando come completare il piatto."
    ]
  }
]
`.trim();

    const work = (async () => {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, input: prompt }),
      });

      const data = await r.json();

      if (!r.ok) {
        console.error("OpenAI error:", data);

        const refundReason = `openai_error_${r.status}`;
        const { data: refunded, error: refundErr } = await supabase.rpc("refund_eco_credit", {
          p_reason: refundReason,
        });

        const errType = data?.error?.type;
        const status = r.status;

        return {
          error: data?.error ?? data,
          status,
          hint:
            status === 429 && errType === "insufficient_quota"
              ? "Quota/billing API non attivo o crediti esauriti su OpenAI Platform."
              : undefined,
          remainingCredits: typeof refunded === "number" ? refunded : remainingAfterConsume ?? null,
          refunded: refundErr ? false : true,
        };
      }

      let text: string = data?.output_text ?? "";
      if (!text && Array.isArray(data?.output)) {
        const parts: string[] = [];
        for (const item of data.output) {
          const content = item?.content;
          if (!Array.isArray(content)) continue;
          for (const c of content) {
            if (c?.type === "output_text" && typeof c?.text === "string") parts.push(c.text);
          }
        }
        text = parts.join("");
      }

      if (!text) {
        console.error("OpenAI returned empty text:", data);
        return {
          recipes: [],
          raw: data,
          remainingCredits: typeof remainingAfterConsume === "number" ? remainingAfterConsume : null,
        };
      }

      try {
        let cleaned = String(text).trim();
        cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
        cleaned = cleaned.replace(/\s*```$/i, "").trim();

        const start = cleaned.indexOf("[");
        const end = cleaned.lastIndexOf("]");
        if (start !== -1 && end !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);

        const recipes = JSON.parse(cleaned);
        return {
          recipes,
          remainingCredits: typeof remainingAfterConsume === "number" ? remainingAfterConsume : null,
        };
      } catch (e) {
        console.error("JSON parse failed. Raw text:", text);
        return {
          recipes: [],
          parse_error: true,
          text,
          remainingCredits: typeof remainingAfterConsume === "number" ? remainingAfterConsume : null,
        };
      }
    })();

    inflight.set(cacheKey, work);
    const value = await work.finally(() => inflight.delete(cacheKey));

    cache.set(cacheKey, { ts: Date.now(), value });
    pruneCache();

    if (value?.error && typeof value?.status === "number") {
      return res.status(value.status).json(value);
    }

    return res.status(200).json({ ...value, cached: false });
  } catch (e: any) {
    console.error("recipes api error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}
