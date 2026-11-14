/**
 * Confronto tra gli ingredienti di una ricetta e la dispensa vera.
 * Serve a correggere l'AI quando mette tra "ingredienti che hai" qualcosa che in dispensa non c'è:
 * quegli ingredienti vengono spostati tra quelli da comprare.
 */

const STOP_WORDS = new Set([
  "di", "del", "della", "dei", "delle", "dello", "degli", "al", "alla", "allo", "con", "e", "in", "per", "da",
  "il", "la", "le", "lo", "gli", "i", "un", "una", "uno", "q", "b", "qb", "extra", "fresco", "fresca", "freschi", "fresche",
]);

// Ingredienti che non si comprano: non finiscono mai nella lista della spesa
const ALWAYS_AVAILABLE = ["acqua"];

const normalize = (name: string) =>
  String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Radice semplice di una parola italiana: toglie la vocale finale (pomodoro/pomodori → pomodor). */
const stem = (w: string) => (w.length >= 4 ? w.replace(/[aeiou]$/, "") : w);

export const nameStems = (name: string) =>
  normalize(name)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
    .map(stem);

/** Due nomi indicano lo stesso prodotto: stessa parola principale, o tutte le parole del più corto in comune. */
export function sameIngredient(a: string, b: string): boolean {
  const sa = nameStems(a);
  const sb = nameStems(b);
  if (!sa.length || !sb.length) return false;
  if (sa[0] === sb[0]) return true;
  const common = sa.filter((w) => sb.includes(w)).length;
  return common >= Math.min(sa.length, sb.length);
}

type Used = { name?: unknown; quantity?: unknown; unit?: unknown };

const describe = (u: Used) => {
  const name = String(u?.name ?? "").trim();
  const q = typeof u?.quantity === "number" && u.quantity > 0 ? String(u.quantity) : "";
  const unit = typeof u?.unit === "string" ? u.unit.trim() : "";
  return [q, q ? unit : "", name].filter(Boolean).join(" ");
};

/**
 * Sposta in `missingIngredients` gli ingredienti "usati" che non sono nella dispensa.
 * Restituisce la ricetta corretta e quanti ingredienti sono stati spostati.
 */
export function reconcileWithPantry<T extends { ingredientsUsed?: unknown; missingIngredients?: unknown }>(
  recipe: T,
  pantryNames: string[]
): { recipe: T; moved: number } {
  const used: Used[] = Array.isArray(recipe?.ingredientsUsed) ? (recipe.ingredientsUsed as Used[]) : [];
  const missing: unknown[] = Array.isArray(recipe?.missingIngredients) ? [...(recipe.missingIngredients as unknown[])] : [];

  const keep: Used[] = [];
  let moved = 0;
  for (const u of used) {
    const name = String(u?.name ?? "").trim();
    if (!name) continue;
    const always = ALWAYS_AVAILABLE.some((w) => normalize(name).split(" ").includes(w));
    if (always || pantryNames.some((p) => sameIngredient(name, p))) {
      keep.push(u);
      continue;
    }
    const alreadyMissing = missing.some((m) => sameIngredient(typeof m === "string" ? m : String((m as any)?.name ?? ""), name));
    if (!alreadyMissing) missing.push(describe(u));
    moved++;
  }

  return { recipe: { ...recipe, ingredientsUsed: keep, missingIngredients: missing }, moved };
}
