import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUserClient, isPremiumActive } from "./_lib/openai.js";

const BUCKET = "recipe-images";

function buildPrompt(recipe: any, title: string) {
  const ingredients: string[] = [];
  for (const ing of Array.isArray(recipe?.ingredientsUsed) ? recipe.ingredientsUsed : []) {
    if (ing?.name) ingredients.push(String(ing.name));
  }
  for (const ing of Array.isArray(recipe?.missingIngredients) ? recipe.missingIngredients : []) {
    if (ing) ingredients.push(typeof ing === "string" ? ing : String(ing?.name ?? ""));
  }
  const description = recipe?.description ? `Descrizione: ${String(recipe.description).slice(0, 300)}.` : "";

  return `Fotografia gastronomica realistica del piatto italiano "${title}", appena preparato e servito in un piatto di ceramica su un tavolo di legno chiaro di una cucina di casa.
${description}
Ingredienti principali visibili: ${ingredients.slice(0, 8).join(", ") || "quelli tipici del piatto"}.
Luce naturale morbida da finestra, inquadratura dall'alto a 45 gradi, profondità di campo ridotta, colori vivi e appetitosi, porzione realistica.
Nessun testo, nessuna scritta, nessun logo, nessuna persona.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = await getUserClient(req);
  if ("error" in auth) return res.status(auth.status).json({ error: auth.error });
  const { supabase, userId } = auth;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

  const recipeId = String(req.body?.recipeId ?? "");
  if (!recipeId) return res.status(400).json({ error: "Missing recipeId" });

  const { data: row, error: rowErr } = await supabase
    .from("recipes_saved")
    .select("id, title, recipe_json, image_url")
    .eq("id", recipeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (rowErr) return res.status(500).json({ error: rowErr.message });
  if (!row) return res.status(404).json({ error: "RECIPE_NOT_FOUND" });
  if (row.image_url) return res.status(200).json({ imageUrl: row.image_url, remainingCredits: null });

  // Una foto AI costa come una generazione di ricetta (gratis per chi è premium)
  const premium = await isPremiumActive(supabase, userId);
  let consumedCredit = false;
  let remainingCredits: number | null = null;

  if (!premium) {
    const { data: usage, error: usageErr } = await supabase.rpc("consume_eco_generation");
    if (usageErr) {
      if (String(usageErr.message || "").includes("NO_CREDITS")) {
        return res.status(402).json({ error: "NO_CREDITS", message: "Crediti EcoChef esauriti." });
      }
      return res.status(500).json({ error: usageErr.message });
    }
    consumedCredit = Boolean((usage as any)?.consumedCredit);
    remainingCredits =
      typeof (usage as any)?.remainingCredits === "number" ? (usage as any).remainingCredits : null;
  }

  const refund = async (reason: string) => {
    if (premium) return;
    const { error } = await supabase.rpc("refund_eco_generation", {
      p_consumed_credit: consumedCredit,
      p_reason: reason,
    });
    if (error) console.error("refund error:", error);
  };

  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini",
        prompt: buildPrompt(row.recipe_json, row.title),
        size: "1024x1024",
        quality: process.env.OPENAI_IMAGE_QUALITY || "medium",
        output_format: "jpeg",
        output_compression: 82,
        n: 1,
      }),
    });

    const data = await r.json();
    const b64 = data?.data?.[0]?.b64_json;

    if (!r.ok || !b64) {
      console.error("OpenAI image error:", data);
      await refund(`recipe_image_error_${r.status}`);
      return res.status(502).json({
        error: "IMAGE_FAILED",
        message: "Non sono riuscito a creare la foto. Il credito non è stato scalato.",
      });
    }

    const path = `${userId}/${recipeId}-ai-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, Buffer.from(b64, "base64"), { contentType: "image/jpeg", upsert: false });

    if (upErr) {
      console.error("upload error:", upErr);
      await refund("recipe_image_upload_failed");
      return res.status(500).json({ error: "UPLOAD_FAILED", message: "Salvataggio della foto non riuscito." });
    }

    const imageUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    const { error: updErr } = await supabase
      .from("recipes_saved")
      .update({ image_url: imageUrl })
      .eq("id", recipeId)
      .eq("user_id", userId);

    if (updErr) {
      console.error("update image_url error:", updErr);
      return res.status(500).json({ error: "UPDATE_FAILED", message: updErr.message });
    }

    return res.status(200).json({ imageUrl, remainingCredits });
  } catch (e: any) {
    console.error("recipe-image error:", e);
    await refund("recipe_image_exception");
    return res.status(500).json({ error: "IMAGE_FAILED", message: "Errore imprevisto. Il credito non è stato scalato." });
  }
}
