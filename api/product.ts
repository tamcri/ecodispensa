/**
 * Prodotti:
 *  - POST /api/product            { image }  → riconosce il prodotto da una foto (OpenAI)
 *  - POST /api/product            { image, mode: "date" } → legge la data di scadenza stampata
 *  - POST /api/product            { image | text, mode: "items" } → tutta la spesa da uno scontrino o da un elenco detto a voce
 *  - GET  /api/product?code=EAN              → cerca il codice a barre su Open Food Facts
 * Un'unica funzione per restare nel limite di funzioni del piano Vercel gratuito.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserClient, isPremiumActive, logAiUsage, responseText } from "./_lib/openai.js";

const CATEGORIES = ["Ortofrutta", "Latticini", "Carne & Pesce", "Dispensa", "Surgelati", "Casa", "Altro"];
const MAX_IMAGE_CHARS = 4_000_000; // ~3 MB di jpeg in base64

async function identifyHandler(req: VercelRequest, res: VercelResponse) {

  try {
    const auth = await getUserClient(req);
    if ("error" in auth) return res.status(auth.status).json({ error: auth.error });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const image = String(req.body?.image ?? "");
    if (!image.startsWith("data:image/")) return res.status(400).json({ error: "Missing image" });
    if (image.length > MAX_IMAGE_CHARS) return res.status(413).json({ error: "Image too large" });

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Analizza la foto di un prodotto alimentare o per la casa.
Rispondi con:
- name: nome breve e descrittivo in italiano (es. "Latte parzialmente scremato", "Mele Golden"). Se non è un prodotto riconoscibile, name vuoto.
- category: una tra ${CATEGORIES.join(", ")}.
- quantity: quantità stimata (numero), 1 se non chiaro.
- unit: una tra pz, kg, g, l.
- expiryDate: scadenza stimata in formato YYYY-MM-DD supponendo l'acquisto oggi (${today}). Se è leggibile sulla confezione usa quella. Stringa vuota per prodotti a lunga conservazione o non alimentari.`;

    const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: image },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "pantry_item",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["name", "category", "quantity", "unit", "expiryDate"],
              properties: {
                name: { type: "string" },
                category: { type: "string", enum: CATEGORIES },
                quantity: { type: "number" },
                unit: { type: "string", enum: ["pz", "kg", "g", "l"] },
                expiryDate: { type: "string" },
              },
            },
          },
        },
      }),
    });

    const data = await r.json();
    if (r.ok) await logAiUsage(auth.supabase, "product_photo", model, data);
    if (!r.ok) {
      console.error("OpenAI identify error:", data);
      return res.status(502).json({ error: "IDENTIFY_FAILED" });
    }

    const text = responseText(data);
    let item: any = null;
    try {
      item = JSON.parse(text);
    } catch {
      item = null;
    }

    if (!item || !item.name) return res.status(200).json({ item: null });

    if (item.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.expiryDate)) item.expiryDate = "";

    return res.status(200).json({ item });
  } catch (e: any) {
    console.error("product identify error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}


// Categorie di Open Food Facts → categorie di EcoDispensa (la prima che corrisponde vince)
const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/en:(frozen|surgel)/, "Surgelati"],
  [/en:(non-food|household|cleaning|detergent|hygiene|toilet-paper)/, "Casa"],
  [/en:(dairies|dairy|milks|cheeses|yogurts|butters|creams|eggs)/, "Latticini"],
  [/en:(meats|poultry|fishes|seafood|fish-and-meat|hams|sausages|salamis|cured-meats)/, "Carne & Pesce"],
  [/en:(fresh-fruits|fresh-vegetables|fruits-based|vegetables-based|fruits$|vegetables$|salads)/, "Ortofrutta"],
];

function mapCategory(tags: string[]): string {
  const all = tags.join(" ");
  for (const [re, cat] of CATEGORY_RULES) if (re.test(all)) return cat;
  return "Dispensa";
}

function mapQuantity(p: any): { quantity: number; unit: string } {
  const q = Number(p?.product_quantity);
  const u = String(p?.product_quantity_unit ?? "").toLowerCase();
  if (Number.isFinite(q) && q > 0) {
    if (u === "ml" || u === "cl" || u === "l") {
      const liters = u === "ml" ? q / 1000 : u === "cl" ? q / 100 : q;
      return { quantity: Math.round(liters * 100) / 100, unit: "l" };
    }
    if (u === "kg") return { quantity: q, unit: "kg" };
    // Open Food Facts esprime di solito i solidi in grammi
    return q >= 1000 ? { quantity: Math.round((q / 1000) * 100) / 100, unit: "kg" } : { quantity: q, unit: "g" };
  }
  // fallback sul testo, es. "500 g", "1,5 l"
  const m = String(p?.quantity ?? "").replace(",", ".").match(/([\d.]+)\s*(kg|g|ml|cl|l)\b/i);
  if (m) return mapQuantity({ product_quantity: Number(m[1]), product_quantity_unit: m[2] });
  return { quantity: 1, unit: "pz" };
}

async function barcodeHandler(req: VercelRequest, res: VercelResponse) {

  const auth = await getUserClient(req);
  if ("error" in auth) return res.status(auth.status).json({ error: auth.error });

  const code = String(req.query.code ?? "").replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) return res.status(400).json({ error: "Invalid barcode" });

  try {
    const fields = "product_name,product_name_it,generic_name_it,brands,quantity,product_quantity,product_quantity_unit,categories_tags";
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`, {
      headers: { "User-Agent": "EcoDispensa/1.0 (+https://github.com/tamcri/ecodispensa)" },
    });
    if (r.status === 404) return res.status(200).json({ product: null });
    if (!r.ok) return res.status(502).json({ error: "LOOKUP_FAILED" });

    const data = await r.json();
    const p = data?.product;
    const name = String(p?.product_name_it || p?.product_name || p?.generic_name_it || "").trim();
    if (data?.status !== 1 || !p || !name) return res.status(200).json({ product: null });

    const { quantity, unit } = mapQuantity(p);
    const brand = String(p.brands ?? "").split(",")[0].trim() || null;

    // i dati dei prodotti cambiano raramente: cache di un giorno sulla CDN
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.status(200).json({
      product: {
        code,
        name,
        brand,
        quantity,
        unit,
        category: mapCategory(Array.isArray(p.categories_tags) ? p.categories_tags : []),
      },
    });
  } catch (e: any) {
    console.error("barcode lookup error:", e);
    return res.status(502).json({ error: "LOOKUP_FAILED" });
  }
}

/** Ultimo giorno del mese (per date stampate solo come mese/anno, es. "12/2027"). */
function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

/** Controlla che la data letta sia valida e plausibile (non più di 2 anni fa, non oltre 10 anni). */
function normalizeReadDate(raw: string): string | null {
  const s = String(raw ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let iso: string | null = null;
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) iso = s;
  } else if ((m = s.match(/^(\d{4})-(\d{2})$/))) {
    const [y, mo] = [Number(m[1]), Number(m[2])];
    if (mo >= 1 && mo <= 12) iso = lastDayOfMonth(y, mo);
  }
  if (!iso) return null;
  const t = new Date(iso + "T00:00:00Z").getTime();
  const now = Date.now();
  if (t < now - 2 * 365 * 86_400_000 || t > now + 10 * 365 * 86_400_000) return null;
  return iso;
}

/** Legge la data di scadenza stampata sulla confezione. Non consuma crediti. */
async function readDateHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await getUserClient(req);
    if ("error" in auth) return res.status(auth.status).json({ error: auth.error });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const image = String(req.body?.image ?? "");
    if (!image.startsWith("data:image/")) return res.status(400).json({ error: "Missing image" });
    if (image.length > MAX_IMAGE_CHARS) return res.status(413).json({ error: "Image too large" });

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Nella foto c'è la data di scadenza stampata su una confezione di cibo (es. "da consumarsi entro 12/03/27", "da consumarsi preferibilmente entro fine 05.2027", "SCAD. 03 12 2026", "EXP 2027-01").
Oggi è ${today}. Le date italiane sono nel formato giorno/mese/anno.
Rispondi con:
- found: true solo se leggi davvero una data di scadenza, false se non c'è o non è leggibile. Non inventare.
- date: la data in formato YYYY-MM-DD; se sulla confezione ci sono solo mese e anno, usa YYYY-MM. Stringa vuota se found è false.
- kind: "entro" per "da consumarsi entro", "preferibilmente" per "da consumarsi preferibilmente entro" o "TMC", "altro" se non è scritto.
Ignora date di produzione, confezionamento e lotti (es. "PROD.", "CONF.", "L.").`;

    const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: image, detail: "high" },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "expiry_date",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["found", "date", "kind"],
              properties: {
                found: { type: "boolean" },
                date: { type: "string" },
                kind: { type: "string", enum: ["entro", "preferibilmente", "altro"] },
              },
            },
          },
        },
      }),
    });

    const data = await r.json();
    if (r.ok) await logAiUsage(auth.supabase, "date_photo", model, data);
    if (!r.ok) {
      console.error("OpenAI read date error:", data?.error?.message ?? r.status);
      return res.status(502).json({ error: "READ_FAILED" });
    }

    let out: any = null;
    try {
      out = JSON.parse(responseText(data));
    } catch {
      out = null;
    }
    const date = out?.found ? normalizeReadDate(out.date) : null;
    return res.status(200).json({ expiryDate: date, kind: date ? out.kind : null });
  } catch (e: any) {
    console.error("read date error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}

const MAX_TEXT_CHARS = 2000;

/** Prezzo in euro plausibile (arrotondato ai centesimi) oppure null */
const euros = (v: any): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 100000 ? Math.round(v * 100) / 100 : null;
const MAX_ITEMS = 60;

/**
 * Tutta la spesa in un colpo: dalla foto dello scontrino (anche la schermata di uno scontrino digitale)
 * oppure da un elenco scritto o detto a voce ("ho comprato latte, sei uova e un chilo di mele").
 * Non consuma crediti: serve a riempire la dispensa.
 */
async function itemsHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await getUserClient(req);
    if ("error" in auth) return res.status(auth.status).json({ error: auth.error });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const image = typeof req.body?.image === "string" ? req.body.image : "";
    const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, MAX_TEXT_CHARS) : "";
    if (image) {
      if (!image.startsWith("data:image/")) return res.status(400).json({ error: "Bad image" });
      if (image.length > MAX_IMAGE_CHARS) return res.status(413).json({ error: "Image too large" });
      // la lettura dello scontrino è inclusa negli abbonamenti (la voce resta per tutti)
      if (!(await isPremiumActive(auth.supabase, auth.userId))) return res.status(402).json({ error: "PREMIUM_REQUIRED" });
    } else if (text.length < 2) {
      return res.status(400).json({ error: "Missing image or text" });
    }

    const rules = `Per ogni prodotto alimentare o per la casa rispondi con:
- name: nome chiaro in italiano, con la maiuscola iniziale (es. "Latte parzialmente scremato", "Mozzarella fior di latte", "Banane"). Niente marche se non servono a capire il prodotto.
- category: una tra ${CATEGORIES.join(", ")}.
- quantity: numero di pezzi o confezioni (es. "x3" o "3 vasetti" → 3); per i prodotti al peso il peso; 1 se non è chiaro.
- unit: "pz" per pezzi e confezioni, "kg" o "g" per i prodotti al peso, "l" per i liquidi sfusi.
- storage: "fresh" per frutta, verdura, pane, carne, pesce e gastronomia senza data stampata; "packaged" per i confezionati con una data stampata (latte, yogurt, formaggi, salumi, uova, pasta fresca); "long_life" per pasta secca, riso, farina, scatolame, olio, sale, caffè, biscotti, bevande a lunga conservazione e prodotti per la casa.
- shelfDays: giorni di conservazione tipici dall'acquisto, conservato come si deve (es. banane 5, latte fresco 6, yogurt 20, mozzarella 5, uova 21); 0 per "long_life".
- price: prezzo pagato in euro per quella riga (tutta la quantità), già tolti gli sconti che si riferiscono a quel prodotto; null se non c'è.
Unisci le righe uguali sommando le quantità. Al massimo ${MAX_ITEMS} prodotti. Non inventare prodotti che non ci sono.`;

    const prompt = image
      ? `Nella foto c'è lo scontrino di un supermercato italiano, oppure la schermata di uno scontrino digitale.
Elenca i prodotti acquistati. Gli scontrini abbreviano i nomi (es. "LATTE PS UHT 1L", "MOZZ.FIORDIL.125G", "BANANE KG 1,234"): traducili in nomi chiari.
Ignora totali, subtotali, sconti, resto, pagamenti, IVA, buste e shopper, punti e carte fedeltà, depositi e righe di servizio.
Il prezzo di ogni riga è l'importo in euro allineato a destra, con la virgola (es. "1,29"): non confonderlo con pesi, quantità, codici o aliquote IVA. Se una riga sotto il prodotto dice "2 x 0,99", la riga vale 1,98 e quantity è 2. Le righe "SCONTO" o con il segno meno vanno tolte dal prodotto sopra.
Se un numero non è leggibile con sicurezza, metti price null invece di indovinare.
Se la foto non è uno scontrino ma una spesa appoggiata sul tavolo, elenca i prodotti che vedi (price null).
Leggi anche: store = nome del negozio o della catena (es. "Conad", "Esselunga"), stringa vuota se non c'è; date = data dello scontrino in formato YYYY-MM-DD (le date italiane sono giorno/mese/anno), stringa vuota se non c'è; total = totale pagato in euro (la riga TOTALE o "IMPORTO PAGATO"), null se non c'è.
${rules}`
      : `L'utente ha scritto o dettato a voce cosa ha comprato: «${text.replace(/[«»]/g, "")}».
Elenca i prodotti. Capisci i numeri scritti a parole ("sei uova" → 6 pz, "un chilo di mele" → 1 kg, "mezzo chilo" → 0.5 kg, "un litro di latte" → 1 pz).
Ignora le parole che non sono prodotti ("ho comprato", "poi", "e anche").
Se l'utente dice un prezzo ("latte 1 euro e 29", "mele 2,50"), mettilo in price; se dice dove ha comprato ("da Lidl"), mettilo in store. date stringa vuota, total null.
${rules}`;

    const content: any[] = [{ type: "input_text", text: prompt }];
    if (image) content.push({ type: "input_image", image_url: image, detail: "high" });

    // Scontrini: un modello più preciso a leggere testi piccoli e prezzi; se non risponde, quello di sempre
    const fallback = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const models = image
      ? [...new Set([process.env.OPENAI_RECEIPT_MODEL || "gpt-4o", fallback])]
      : [process.env.OPENAI_MODEL || "gpt-4o-mini"];

    let data: any = null;
    let ok = false;
    for (const model of models) {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: [{ role: "user", content }],
          text: {
            format: {
              type: "json_schema",
              name: "shopping_items",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["store", "date", "total", "items"],
                properties: {
                  store: { type: "string" },
                  date: { type: "string" },
                  total: { type: ["number", "null"] },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["name", "category", "quantity", "unit", "storage", "shelfDays", "price"],
                      properties: {
                        name: { type: "string" },
                        category: { type: "string", enum: CATEGORIES },
                        quantity: { type: "number" },
                        unit: { type: "string", enum: ["pz", "kg", "g", "l"] },
                        storage: { type: "string", enum: ["fresh", "packaged", "long_life"] },
                        shelfDays: { type: "number" },
                        price: { type: ["number", "null"] },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      });
      data = await r.json();
      if (r.ok) {
        await logAiUsage(auth.supabase, image ? "receipt" : "voice", model, data);
        ok = true;
        break;
      }
      console.error(`OpenAI items error (${model}):`, data?.error?.message ?? r.status);
    }
    if (!ok) return res.status(502).json({ error: "READ_FAILED" });

    let out: any = null;
    try {
      out = JSON.parse(responseText(data));
    } catch {
      out = null;
    }
    const items = (Array.isArray(out?.items) ? out.items : [])
      .filter((i: any) => typeof i?.name === "string" && i.name.trim().length >= 2)
      .slice(0, MAX_ITEMS)
      .map((i: any) => ({
        name: i.name.trim().slice(0, 80),
        category: CATEGORIES.includes(i.category) ? i.category : "Altro",
        quantity: Number.isFinite(i.quantity) && i.quantity > 0 ? Math.round(i.quantity * 1000) / 1000 : 1,
        unit: ["pz", "kg", "g", "l"].includes(i.unit) ? i.unit : "pz",
        storage: ["fresh", "packaged", "long_life"].includes(i.storage) ? i.storage : "packaged",
        shelfDays: Number.isFinite(i.shelfDays) ? Math.max(0, Math.min(730, Math.round(i.shelfDays))) : 0,
        price: euros(i.price),
      }));

    const date = normalizeReadDate(String(out?.date ?? ""));
    return res.status(200).json({
      store: typeof out?.store === "string" ? out.store.trim().slice(0, 80) : "",
      // la data dello scontrino non può essere nel futuro né troppo vecchia
      date: date && date <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) && Date.parse(date) > Date.now() - 400 * 86_400_000 ? date : "",
      total: euros(out?.total),
      items,
    });
  } catch (e: any) {
    console.error("items error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "POST" && req.body?.mode === "date") return readDateHandler(req, res);
  if (req.method === "POST" && req.body?.mode === "items") return itemsHandler(req, res);
  if (req.method === "POST") return identifyHandler(req, res);
  if (req.method === "GET") return barcodeHandler(req, res);
  return res.status(405).json({ error: "Method not allowed" });
}
