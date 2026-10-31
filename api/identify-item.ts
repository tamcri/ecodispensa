import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserClient, responseText } from "./_lib/openai.js";

const CATEGORIES = ["Ortofrutta", "Latticini", "Carne & Pesce", "Dispensa", "Surgelati", "Casa", "Altro"];
const MAX_IMAGE_CHARS = 4_000_000; // ~3 MB di jpeg in base64

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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
    console.error("identify-item error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}
