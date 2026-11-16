import { supabase } from "./supabaseClient";

/** Le mie spese: scontrini, prezzi dei prodotti e cibo buttato in euro (importi in centesimi) */

export type GroceryItemInput = {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiryDate?: string;
  longLife: boolean;
  priceCents: number | null;
};

export type GroceriesInput = {
  source: "receipt" | "voice";
  store: string;
  date: string; // YYYY-MM-DD
  totalCents: number | null;
  items: GroceryItemInput[];
};

export async function addGroceries(input: GroceriesInput): Promise<boolean> {
  const { error } = await supabase.rpc("add_groceries", {
    p_source: input.source,
    p_store: input.store || null,
    p_date: input.date || null,
    p_total_cents: input.totalCents,
    p_items: input.items.map((i) => ({
      name: i.name,
      category: i.category,
      quantity: i.quantity,
      unit: i.unit,
      expiry_date: i.longLife ? null : i.expiryDate || null,
      long_life: i.longLife,
      price_cents: i.priceCents,
    })),
  });
  if (error) {
    console.error("add_groceries error:", error);
    return false;
  }
  return true;
}

export async function setItemPrice(itemId: string, priceCents: number | null): Promise<boolean> {
  const { error } = await supabase.rpc("set_item_price", { p_item: itemId, p_price_cents: priceCents });
  if (error) {
    console.error("set_item_price error:", error);
    return false;
  }
  return true;
}

export type Spending = {
  month_total: number;
  prev_month_total: number;
  months: Array<{ month: string; total: number }>;
  by_category: Array<{ category: string; total: number }>;
  wasted_value: number;
  wasted_count: number;
  wasted_unpriced: number;
  top_wasted: Array<{ name: string; total: number; n: number }>;
  receipts: Array<{ id: string; store: string | null; date: string; total: number | null; items: number; source: string }>;
  priced_lines: number;
};

export async function fetchSpending(): Promise<Spending | null> {
  const { data, error } = await supabase.rpc("my_spending");
  if (error) {
    console.error("my_spending error:", error);
    return null;
  }
  return data as Spending;
}

export async function fetchReceiptLines(
  receiptId: string
): Promise<Array<{ name: string; category: string | null; quantity: number | null; unit: string | null; price_cents: number | null }>> {
  const { data, error } = await supabase.rpc("receipt_lines", { p_receipt: receiptId });
  if (error) {
    console.error("receipt_lines error:", error);
    return [];
  }
  return (data ?? []) as any[];
}

export async function deleteReceipt(receiptId: string): Promise<boolean> {
  const { error } = await supabase.from("grocery_receipts").delete().eq("id", receiptId);
  if (error) {
    console.error("delete receipt error:", error);
    return false;
  }
  return true;
}

/** 1234 → "12,34 €" */
export const formatEuro = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "—"
    : (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

/** Euro senza decimali quando sono tondi: 1200 → "12 €", 1234 → "12,34 €" */
export const formatEuroShort = (cents: number) =>
  (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

/** "1,29" / "1.29" / "1 €" → 129 centesimi; "" → null; testo non valido → undefined */
export function parseEuroInput(text: string): number | null | undefined {
  const t = text.replace(/€/g, "").replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  if (!/^\d{1,6}(\.\d{0,2})?$/.test(t)) return undefined;
  return Math.round(Number(t) * 100);
}

/** 129 → "1,29" per i campi di testo */
export const centsToInput = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ",");

/** Valore della parte buttata: prezzo × quantità rimasta ÷ quantità comprata */
export function wastedValueCents(priceCents?: number | null, priceQty?: number | null, quantity?: number | null): number | null {
  if (priceCents === null || priceCents === undefined) return null;
  if (!priceQty || !quantity || priceQty <= 0) return priceCents;
  return Math.max(0, Math.round((priceCents * Math.min(quantity, priceQty)) / priceQty));
}
