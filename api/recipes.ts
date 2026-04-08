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

    if ((!pantryItems || pantryItems.length === 0) && !inventoryList) {
      return res.status(400).json({ error: "Missing pantryItems or inventoryList" });
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
    if (pantryItems && pantryItems.length > 0) {
      const normalized = pantryItems
        .map((it) => ({
          name: String(it.name ?? "").trim(),
          quantity: typeof it.quantity === "number" ? it.quantity : undefined,
          unit: typeof it.unit === "string" ? it.unit : undefined,
          expiryDate: it.expiryDate ? String(it.expiryDate) : null,
        }))
        .filter((it) => it.name.length > 0);

      normalized.sort((a, b) => {
        const da = a.expiryDate ? new Date(a.expiryDate).getTime() : Number.POSITIVE_INFINITY;
        const db = b.expiryDate ? new Date(b.expiryDate).getTime() : Number.POSITIVE_INFINITY;
        return da - db;
      });

      pantryText = normalized
        .map((it) => {
          const qty = it.quantity != null ? ` - qty: ${it.quantity}${it.unit ? " " + it.unit : ""}` : "";
          const exp = it.expiryDate ? ` - expiry: ${it.expiryDate}` : "";
          return `• ${it.name}${qty}${exp}`;
        })
        .join("\n");
    } else if (inventoryList) {
      pantryText = inventoryList.trim();
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

    // Consuma 1 credito SOLO se non era cache
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

    const prompt = `
Agisci come uno chef esperto di cucina sostenibile e anti-spreco.

OBIETTIVO:
- Suggerisci 3 ricette gustose usando soprattutto gli ingredienti disponibili.
- Dai PRIORITÀ assoluta agli ingredienti con scadenza più vicina.
- Rispetta in modo RIGIDO preferenze e vincoli.

VINCOLI:
- Porzioni: ${finalServings}
- Tempo massimo: ${finalTime} minuti
- ${rules.join(" ")}

DISPENSA (con quantità e scadenze quando disponibili):
${pantryText}

REGOLE DIETETICHE (IMPORTANTI):
- Se lactose-free = YES: evita latte, burro, panna, yogurt, formaggi. Se serve, proponi alternative (olio, latte vegetale, ecc).
- Se diet = veg: niente carne/pesce. Uova ok SOLO se lactose-free = NO.
- Se diet = vegan: niente prodotti animali (uova, latte, formaggi, miele). (Se diet non è vegan, non applicare.)

OUTPUT (OBBLIGATORIO):
- Rispondi SOLO con un JSON array.
- Nessun testo fuori dal JSON.
- Struttura:
[
  {
    "title": "...",
    "difficulty": "Facile|Media|Difficile",
    "time": "es. 25 min",
    "servings": ${finalServings},
    "description": "...",
    "expiresSoonUsed": ["..."],
    "ingredientsUsed": [{"name":"...", "quantity": 1, "unit":"g|kg|l|ml|pz"}],
    "missingIngredients": ["..."],
    "steps": ["..."]
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

        // Refund: se OpenAI fallisce, rimborsa 1 credito
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
