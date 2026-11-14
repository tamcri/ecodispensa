import { supabase } from "./supabaseClient";
import { Category, PantryItem } from "../types";

export const RECIPE_IMAGES_BUCKET = "recipe-images";

export type SavedRecipe = {
  id: string;
  title: string;
  difficulty: string | null;
  time: string | null;
  servings?: number | null;
  source: string;
  created_at: string;
  image_url: string | null;
  recipe_json: any;
  status?: RecipeStatus | null;
  rating?: number | null;
  cooked_at?: string | null;
  saved_items_count?: number | null;
  /** Portata: primo, secondo, contorno, dolce, altro */
  course?: string | null;
};

export type RecipeStatus = "saved" | "planned" | "cooked";

export type RecipeMeta = {
  imageUrl: string | null;
  status: RecipeStatus;
  rating: number | null;
};

/** Aggiorna stato, voto o foto di una propria ricetta salvata. */
export async function updateRecipe(
  id: string,
  patch: Partial<{ status: RecipeStatus; rating: number | null; cooked_at: string; saved_items_count: number; image_url: string }>
) {
  const { error } = await supabase.from("recipes_saved").update(patch).eq("id", id);
  if (error) console.error("update recipe error:", error);
  return !error;
}

/** Link pubblico della ricetta (creato al primo uso). */
export async function getRecipeShareToken(id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("share_recipe", { p_recipe_id: id });
  if (error) {
    console.error("share_recipe error:", error);
    return null;
  }
  return data as string;
}

export type SharedRecipe = {
  title: string;
  difficulty: string | null;
  time: string | null;
  servings: number | null;
  description: string | null;
  ingredients_used: any[];
  missing_ingredients: any[];
  steps: string[];
  image_url: string | null;
  rating: number | null;
};

/** Ricetta condivisa con un link (funziona anche senza login). */
export async function fetchSharedRecipe(token: string): Promise<SharedRecipe | null> {
  const { data, error } = await supabase.rpc("get_shared_recipe", { p_token: token });
  if (error || !data) return null;
  return data as SharedRecipe;
}

/** Salva nel proprio Ricettario una ricetta ricevuta (accetta la sfida). */
export async function acceptSharedRecipe(token: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("accept_shared_recipe", { p_token: token });
  if (error) {
    console.error("accept_shared_recipe error:", error);
    return null;
  }
  return data as string;
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("SESSION_MISSING");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const r = await fetch(path, { ...init, headers });
  let body: any = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { ok: r.ok, status: r.status, body };
}

export async function fetchCredits(): Promise<number | null> {
  try {
    const { ok, body } = await authFetch("/api/credits");
    if (!ok) return null;
    return Number(body?.eco_credits ?? 0);
  } catch {
    return null;
  }
}

export async function fetchSavedRecipes(): Promise<SavedRecipe[]> {
  const { ok, body } = await authFetch("/api/saved-recipes");
  if (!ok) throw new Error(body?.error ?? "LOAD_RECIPES_FAILED");
  return Array.isArray(body?.recipes) ? body.recipes : [];
}

/** Riconosce un prodotto da una foto (data URL jpeg). Il lavoro avviene sul server. */
export async function identifyItemFromImage(
  base64Image: string
): Promise<Partial<PantryItem> | null> {
  try {
    const { ok, body } = await authFetch("/api/product", {
      method: "POST",
      body: JSON.stringify({ image: base64Image }),
    });
    if (!ok || !body?.item) return null;
    const item = body.item;
    const categories = Object.values(Category) as string[];
    return {
      name: item.name || undefined,
      category: categories.includes(item.category) ? (item.category as Category) : undefined,
      quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : undefined,
      unit: item.unit || undefined,
      expiryDate: item.expiryDate || undefined,
    };
  } catch (e) {
    console.error("identify item error:", e);
    return null;
  }
}

/**
 * Legge la data di scadenza stampata sulla confezione da una foto.
 * Restituisce la data (YYYY-MM-DD) oppure null se non è leggibile.
 */
export async function readExpiryFromImage(
  base64Image: string
): Promise<{ expiryDate: string; kind: string | null } | null> {
  try {
    const { ok, body } = await authFetch("/api/product", {
      method: "POST",
      body: JSON.stringify({ image: base64Image, mode: "date" }),
    });
    if (!ok || typeof body?.expiryDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.expiryDate)) return null;
    return { expiryDate: body.expiryDate, kind: typeof body.kind === "string" ? body.kind : null };
  } catch (e) {
    console.error("read expiry error:", e);
    return null;
  }
}

/** Riduce la foto scattata dall'utente a max 1280px in jpeg, per caricarla velocemente. */
async function resizeImage(file: File, maxSide = 1280): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82)
    );
    if (!blob) throw new Error("ENCODE_FAILED");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Carica la foto del piatto fatta dall'utente e la collega alla ricetta. */
export async function uploadRecipePhoto(recipeId: string, file: File): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("SESSION_MISSING");

  const blob = await resizeImage(file);
  const path = `${userId}/${recipeId}-${Date.now()}.jpg`;

  const { error: upErr } = await supabase.storage
    .from(RECIPE_IMAGES_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from(RECIPE_IMAGES_BUCKET).getPublicUrl(path);
  const imageUrl = pub.publicUrl;

  const { error: updErr } = await supabase
    .from("recipes_saved")
    .update({ image_url: imageUrl })
    .eq("id", recipeId)
    .eq("user_id", userId);
  if (updErr) throw updErr;

  return imageUrl;
}

export type BarcodeProduct = {
  code: string;
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  category: string;
};

/** Cerca un prodotto confezionato dal codice a barre (Open Food Facts, tramite il nostro server). */
export async function lookupBarcode(code: string): Promise<BarcodeProduct | null> {
  try {
    const { ok, body } = await authFetch(`/api/product?code=${encodeURIComponent(code)}`);
    if (!ok || !body?.product) return null;
    return body.product as BarcodeProduct;
  } catch {
    return null;
  }
}
