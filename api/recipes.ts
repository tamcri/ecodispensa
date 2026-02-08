import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { inventoryList } = req.body ?? {};
    if (!inventoryList || typeof inventoryList !== "string") {
      return res.status(400).json({ error: "Missing inventoryList" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY not set" });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const prompt = `
Agisci come uno chef esperto di cucina sostenibile e anti-spreco.
Ho questi ingredienti nella mia dispensa: ${inventoryList}.

Suggerisci 3 ricette gustose che posso preparare principalmente con questi ingredienti per evitare che scadano.

IMPORTANTE:
- Rispondi SOLO con un JSON array.
- Nessun testo fuori dal JSON.
- Struttura:
[
  {
    "title": "...",
    "difficulty": "Facile|Media|Difficile",
    "time": "es. 30 min",
    "description": "...",
    "ingredientsUsed": [{"name":"...", "quantity": 1, "unit":"g|kg|l|ml|pz"}],
    "missingIngredients": ["..."],
    "steps": ["..."]
  }
]
`.trim();

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: prompt,
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      console.error("OpenAI error:", data);
      return res.status(r.status).json({ error: data?.error ?? data });
    }

    // ✅ Estrazione testo robusta (non assumere output[0]...)
    let text: string = data?.output_text ?? "";

    if (!text && Array.isArray(data?.output)) {
      const parts: string[] = [];
      for (const item of data.output) {
        const content = item?.content;
        if (!Array.isArray(content)) continue;
        for (const c of content) {
          if (c?.type === "output_text" && typeof c?.text === "string") {
            parts.push(c.text);
          }
        }
      }
      text = parts.join("");
    }

    if (!text) {
      console.error("OpenAI returned empty text:", data);
      return res.status(200).json({ recipes: [], raw: data });
    }

    // ✅ Parse JSON e se fallisce dimmi cosa torna davvero
    try {
      const recipes = JSON.parse(text);
      return res.status(200).json({ recipes });
    } catch (e) {
      console.error("JSON parse failed. Raw text:", text);
      return res.status(200).json({ recipes: [], parse_error: true, text });
    }
  } catch (e: any) {
    console.error("Server error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}

