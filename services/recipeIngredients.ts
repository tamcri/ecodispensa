import { IngredientUsage, Recipe } from "../types";
import { KITCHEN_UNITS, SHOP_UNITS, toShoppingItem } from "./shoppingItem";

/**
 * Ingredienti di una ricetta, per la scheda:
 * - "Ingredienti": tutti, con la quantità per le porzioni della ricetta
 * - "Dalla tua dispensa" e "Da comprare": solo il nome del prodotto
 */

export type IngredientRow = { amount: string; name: string; fromPantry: boolean };

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const formatNumber = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

const cleanName = (s: string) =>
  s
    .replace(/^(di|d['’])\s*/i, "")
    .replace(/\s*(q\.?\s?b\.?|a piacere|quanto basta)$/i, "")
    .trim();

/** "180 g" da un ingrediente della dispensa; per i pezzi basta il numero ("4 uova") */
function amountOfUsage(u: IngredientUsage): string {
  const q = Number(u.quantity);
  const unit = String(u.unit ?? "").trim();
  if (!q || !Number.isFinite(q)) return "q.b.";
  if (!unit || unit === "pz") return formatNumber(q);
  return `${formatNumber(q)} ${unit}`;
}

/** "2 spicchi di aglio" → { amount: "2 spicchi", name: "Aglio" }; "sale" → { amount: "q.b.", name: "Sale" } */
export function splitIngredient(input: unknown): { amount: string; name: string } {
  if (input && typeof input === "object") {
    const o = input as { name?: unknown; quantity?: unknown; unit?: unknown };
    return {
      amount: amountOfUsage({ name: String(o.name ?? ""), quantity: Number(o.quantity) || 0, unit: String(o.unit ?? "") }),
      name: capitalize(cleanName(String(o.name ?? ""))),
    };
  }
  let text = String(input ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const asNeeded = /(q\.?\s?b\.?|a piacere|quanto basta)$/i.test(text);
  const m = text.match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*(.*)$/);
  if (!m) return { amount: asNeeded || text ? "q.b." : "", name: capitalize(cleanName(text)) };

  const qty = m[1].replace(/\s+/g, "");
  text = m[2];
  const firstWord = text.split(" ")[0] ?? "";
  const unitKey = firstWord.toLowerCase().replace(/\.$/, "");
  let unit = "";
  if (KITCHEN_UNITS.includes(unitKey) || SHOP_UNITS[unitKey]) {
    // misura da cucina: resta com'è scritta ("2 spicchi"); unità da negozio: forma breve ("g"), i pezzi solo col numero
    unit = KITCHEN_UNITS.includes(unitKey) ? firstWord : SHOP_UNITS[unitKey] === "pz" ? "" : SHOP_UNITS[unitKey];
    text = text.slice(firstWord.length).trim();
  }
  const name = capitalize(cleanName(text));
  return { amount: unit ? `${qty} ${unit}` : qty, name: name || capitalize(cleanName(String(input))) };
}

/** Tutti gli ingredienti della ricetta: prima quelli che hai, poi quelli da comprare */
export function recipeIngredientRows(recipe: Recipe): IngredientRow[] {
  const used = (recipe.ingredientsUsed ?? []).map((u) => ({ ...splitIngredient(u), fromPantry: true }));
  const missing = (recipe.missingIngredients ?? []).map((m) => ({ ...splitIngredient(m), fromPantry: false }));
  return [...used, ...missing].filter((r) => r.name);
}

/** Solo il nome del prodotto, per le sezioni "Dalla tua dispensa" e "Da comprare" */
export const pantryName = (u: IngredientUsage | unknown) => splitIngredient(u).name;
export const shoppingName = (m: unknown) => toShoppingItem(m).name || splitIngredient(m).name;
