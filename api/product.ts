/**
 * Prodotti:
 *  - POST /api/product            { image }  → riconosce il prodotto da una foto (OpenAI)
 *  - GET  /api/product?code=EAN              → cerca il codice a barre su Open Food Facts
 * Un'unica funzione per restare nel limite di funzioni del piano Vercel gratuito.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserClient, responseText } from "./_lib/openai.js";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "POST") return identifyHandler(req, res);
  if (req.method === "GET") return barcodeHandler(req, res);
  return res.status(405).json({ error: "Method not allowed" });
}
