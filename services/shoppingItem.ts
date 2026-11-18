/**
 * Trasforma un ingrediente di una ricetta ("3 cucchiai olio extravergine", "2 spicchi di aglio")
 * in qualcosa che si compra al supermercato ("Olio extravergine", "Aglio").
 *
 * - Le misure da cucina (cucchiai, spicchi, pizzichi, q.b.…) non si comprano: resta solo il prodotto.
 * - Condimenti, spezie ed erbe si comprano interi: niente quantità.
 * - Le quantità da negozio (grammi, litri, pezzi) restano, per esempio "Farina 00 · 300 g".
 */

export const KITCHEN_UNITS = [
  "cucchiai", "cucchiaio", "cucchiaini", "cucchiaino", "cucchiaiate", "cucchiaiata",
  "spicchi", "spicchio", "pizzichi", "pizzico", "prese", "presa", "foglie", "foglia",
  "rametti", "rametto", "ciuffi", "ciuffo", "mazzetti", "mazzetto", "manciate", "manciata",
  "bicchieri", "bicchiere", "tazze", "tazza", "tazzine", "tazzina", "gocce", "goccia", "goccio",
  "fili", "filo", "noci", "noce", "fette", "fetta", "fettine", "fettina", "q.b.", "qb", "q.b",
];

export const SHOP_UNITS: Record<string, string> = {
  g: "g", gr: "g", grammi: "g", grammo: "g",
  kg: "kg", chili: "kg", chilo: "kg",
  ml: "ml", cl: "cl", l: "l", litri: "l", litro: "l",
  pz: "pz", pezzi: "pz", pezzo: "pz",
  confezione: "conf", confezioni: "conf", conf: "conf",
  barattolo: "barattolo", barattoli: "barattolo", scatola: "scatola", scatole: "scatola",
};

/** Si comprano interi: la quantità della ricetta non serve. */
const BUY_WHOLE = [
  "sale", "pepe", "olio", "aceto", "zucchero", "aglio", "cipolla", "scalogno", "peperoncino",
  "basilico", "prezzemolo", "rosmarino", "salvia", "origano", "timo", "alloro", "menta", "erba cipollina",
  "paprika", "curcuma", "cannella", "noce moscata", "zenzero", "curry", "cumino", "capperi", "olive",
  "acciughe", "dado", "brodo", "lievito", "bicarbonato", "vanillina", "cacao", "senape", "maionese",
  "ketchup", "salsa di soia", "miele", "pangrattato", "farina", "burro", "parmigiano", "pecorino", "grana",
];

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export type ShoppingDraft = { name: string; quantity: number | null; unit: string | null };

export function toShoppingItem(input: unknown): ShoppingDraft {
  let text = "";
  let quantity: number | null = null;
  let unit: string | null = null;

  if (typeof input === "string") {
    text = input;
  } else if (input && typeof input === "object") {
    const o = input as { name?: unknown; quantity?: unknown; unit?: unknown };
    text = String(o.name ?? "");
    quantity = typeof o.quantity === "number" && o.quantity > 0 ? o.quantity : null;
    unit = typeof o.unit === "string" && o.unit.trim() ? o.unit.trim() : null;
  }

  // Toglie quanto scritto tra parentesi: "pomodori (maturi)" → "pomodori"
  text = text.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

  // Quantità all'inizio: "3 cucchiai …", "1/2 cipolla", "300g farina"
  const m = text.match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*(.*)$/);
  if (m) {
    const raw = m[1].replace(",", ".");
    quantity = raw.includes("/")
      ? Number(raw.split("/")[0]) / Number(raw.split("/")[1])
      : Number(raw);
    text = m[2];
  }

  // Unità subito dopo il numero
  const first = normalize(text).split(" ")[0] ?? "";
  let kitchen = false;
  if (KITCHEN_UNITS.includes(first)) {
    kitchen = true;
    text = text.slice(text.split(" ")[0].length).trim();
  } else if (SHOP_UNITS[first.replace(/\.$/, "")]) {
    unit = SHOP_UNITS[first.replace(/\.$/, "")];
    text = text.slice(text.split(" ")[0].length).trim();
  }
  if (unit && KITCHEN_UNITS.includes(normalize(unit))) kitchen = true;

  // "di aglio", "d'olio" → "aglio", "olio"
  text = text.replace(/^(di|d['’])\s*/i, "").replace(/\s*(q\.?b\.?|a piacere|quanto basta)$/i, "").trim();
  if (!text) text = typeof input === "string" ? input : "";

  // Tuorli e albumi si comprano come uova
  if (/^(tuorl|album)/i.test(normalize(text))) text = "uova";

  const n = normalize(text);
  const whole = BUY_WHOLE.some((w) => n === w || n.startsWith(w + " "));

  if (kitchen || whole || !quantity || !Number.isFinite(quantity)) {
    return { name: capitalize(text), quantity: null, unit: null };
  }
  return { name: capitalize(text), quantity: Number(quantity.toFixed(2)), unit: unit ?? "pz" };
}
