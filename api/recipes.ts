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
- In "ingredientsUsed", devi indicare ESATTAMENTE il nome del prodotto presente in dispensa e la quantità necessaria per la ricetta.
- È accettabile suggerire di comprare 1-2 ingredienti freschi extra se necessario.

Rispondi SOLO con un JSON array con questa struttura:
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
      return res.status(r.status).json({ error: data?.error ?? data });
    }

    // Estrae testo dal Responses API
    const text =
      data?.output?.[0]?.content?.find((c: any) => c.type === "output_text")?.text ??
      data?.output_text ??
      "";

    return res.status(200).json({ text });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}
