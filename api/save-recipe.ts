import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function getBearerToken(req: VercelRequest): string | null {
  const h = req.headers.authorization || req.headers.Authorization;

  if (!h || typeof h !== "string") return null;

  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = getBearerToken(req);

    if (!token) {
      return res
        .status(401)
        .json({ error: "Missing Authorization Bearer token" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res
        .status(500)
        .json({ error: "Missing Supabase environment variables" });
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const {
      data: userData,
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return res.status(401).json({
        error: "Invalid session",
      });
    }

    const userId = userData.user.id;

    const {
      source,
      recipe,
      imageUrl = null,
    } = req.body ?? {};

    if (!source || !recipe) {
      return res.status(400).json({
        error: "Missing source or recipe",
      });
    }

    const { error } = await supabase
      .from("recipes_saved")
      .insert({
        user_id: userId,
        source,
        title: recipe.title,
        difficulty: recipe.difficulty ?? null,
        time: recipe.time ?? null,
        servings: recipe.servings ?? null,
        description: recipe.description ?? null,
        ingredients_used: recipe.ingredientsUsed ?? [],
        missing_ingredients: recipe.missingIngredients ?? [],
        steps: recipe.steps ?? [],
        recipe_json: recipe,
        image_url: imageUrl,
      });

    if (error) {
      return res.status(500).json({
        error: error.message,
      });
    }

    return res.status(200).json({
      success: true,
    });
  } catch (e: any) {
    console.error("save recipe error:", e);

    return res.status(500).json({
      error: e?.message ?? "Server error",
    });
  }
}