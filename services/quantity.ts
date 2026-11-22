/** Unità brevi: "gr", "grammi", "litri", "pezzi"… → g, kg, ml, cl, l, pz (senza unità = pezzi) */
export const normalizeUnit = (u: string) => {
  const k = (u || "").trim().toLowerCase().replace(/\.$/, "");
  if (["g", "gr", "grammo", "grammi"].includes(k)) return "g";
  if (["kg", "chilo", "chili", "chilogrammi"].includes(k)) return "kg";
  if (["ml", "millilitri"].includes(k)) return "ml";
  if (["cl", "centilitri"].includes(k)) return "cl";
  if (["l", "lt", "litro", "litri"].includes(k)) return "l";
  if (["", "pz", "pezzo", "pezzi", "n"].includes(k)) return "pz";
  return k;
};

/** Converte una quantità nell'unità del prodotto in dispensa (null se le unità non sono confrontabili). */
export const convertQuantity = (qty: number, from: string, to: string): number | null => {
  const f = normalizeUnit(from);
  const t = normalizeUnit(to);
  if (f === t) return qty;
  // tutto in grammi o millilitri, poi nell'unità della dispensa
  const base: Record<string, [string, number]> = { g: ["w", 1], kg: ["w", 1000], ml: ["v", 1], cl: ["v", 10], l: ["v", 1000] };
  const bf = base[f];
  const bt = base[t];
  if (!bf || !bt || bf[0] !== bt[0]) return null;
  return (qty * bf[1]) / bt[1];
};

/** Quantità leggibile: 0.5 kg → "0,5 kg", 3 → "3 pz" */
export const formatQty = (qty: number, unit: string) => {
  const n = Math.round(qty * 100) / 100;
  return `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })} ${unit || "pz"}`;
};

/** Una parte del prodotto (¼, metà…): i pezzi si contano interi (metà di 6 uova = 3), una confezione sola si può dividere */
export const portionOf = (item: { quantity: number; unit: string }, fraction: number) => {
  if (fraction >= 1) return item.quantity;
  const raw = item.quantity * fraction;
  if (normalizeUnit(item.unit) === "pz" && item.quantity >= 2) return Math.min(item.quantity, Math.max(1, Math.round(raw)));
  return raw;
};
