import { supabase } from "./supabaseClient";

export type HouseholdMember = {
  user_id: string;
  display_name: string | null;
  role: "owner" | "member";
  joined_at: string;
};

export type Household = {
  id: string;
  name: string;
  invite_code: string;
  members: HouseholdMember[];
};

/** Nome visibile agli altri membri: la parte prima della @ dell'email. */
export const displayNameFromEmail = (email?: string | null) => (email ? email.split("@")[0] : null);

export async function ensureHousehold(displayName: string | null) {
  const { error } = await supabase.rpc("ensure_household", { p_display_name: displayName });
  if (error) console.error("ensure_household error:", error);
}

export async function fetchHousehold(): Promise<Household | null> {
  const { data: hh, error } = await supabase.from("households").select("id, name, invite_code").maybeSingle();
  if (error || !hh) {
    if (error) console.error("household load error:", error);
    return null;
  }
  const { data: members } = await supabase
    .from("household_members")
    .select("user_id, display_name, role, joined_at")
    .order("joined_at", { ascending: true });
  return { ...(hh as any), members: (members ?? []) as HouseholdMember[] };
}

export async function joinHousehold(code: string, displayName: string | null): Promise<string | null> {
  const { error } = await supabase.rpc("join_household", { p_code: code, p_display_name: displayName });
  if (!error) return null;
  if (String(error.message).includes("INVALID_CODE")) return "Codice non valido. Controlla di averlo scritto bene.";
  return "Non sono riuscito a unirti alla famiglia. Riprova.";
}

export async function leaveHousehold(): Promise<string | null> {
  const { error } = await supabase.rpc("leave_household");
  if (!error) return null;
  if (String(error.message).includes("ALONE")) return "Sei l'unico membro: non c'è nulla da cui uscire.";
  return "Operazione non riuscita. Riprova.";
}

export async function regenerateInviteCode(): Promise<string | null> {
  const { data, error } = await supabase.rpc("regenerate_invite_code");
  if (error) return null;
  return data as string;
}

export async function renameHousehold(id: string, name: string) {
  await supabase.from("households").update({ name }).eq("id", id);
}

// ---------------------------------------------------------------
// Consumato / buttato
// ---------------------------------------------------------------

export type Outcome = "consumed" | "wasted";

export async function logPantryEvents(
  rows: Array<{ name: string; category?: string | null; quantity?: number | null; unit?: string | null; outcome: Outcome }>
) {
  if (!rows.length) return;
  const { error } = await supabase.from("pantry_events").insert(
    rows.map((r) => ({
      item_name: r.name,
      category: r.category ?? null,
      quantity: r.quantity ?? null,
      unit: r.unit ?? null,
      outcome: r.outcome,
    }))
  );
  if (error) console.error("pantry_events insert error:", error);
}

export type WasteStats = { consumed: number; wasted: number; since: string };

/** Riepilogo del mese corrente per la famiglia. */
export async function fetchMonthStats(): Promise<WasteStats | null> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const since = start.toISOString();

  const [c, w] = await Promise.all([
    supabase.from("pantry_events").select("id", { count: "exact", head: true }).eq("outcome", "consumed").gte("created_at", since),
    supabase.from("pantry_events").select("id", { count: "exact", head: true }).eq("outcome", "wasted").gte("created_at", since),
  ]);
  if (c.error || w.error) return null;
  return { consumed: c.count ?? 0, wasted: w.count ?? 0, since };
}
