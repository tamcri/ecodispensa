import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserClient } from "./_lib/openai.js";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

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
