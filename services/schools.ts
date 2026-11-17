import { supabase } from "./supabaseClient";

/**
 * Progetto scuole: un partner (azienda o Comune) offre i codici alle famiglie degli alunni.
 * Partner → Istituti → Classi → un codice di attivazione per ogni alunno (12 mesi).
 */

export type SchoolClassRow = { id: string; name: string; students: number; codes: number; used: number; families: number };
export type SchoolRow = { id: string; name: string; city: string | null; classes: SchoolClassRow[] };
export type PartnerRow = { id: string; name: string; kind: "azienda" | "comune"; price_cents: number; schools: SchoolRow[] };

export type RankingRow = {
  id: string;
  name: string;
  students: number;
  families: number;
  active: number;
  participation: number;
  qualified: boolean;
  position: number | null;
  waste_rate: number | null;
  wasted_value: number | null;
  items: number | null;
};

export type MyClass = {
  class_id: string;
  class_name: string;
  school: string;
  city: string | null;
  partner: string;
  partner_kind: "azienda" | "comune";
  period: "month" | "year";
  ranking: RankingRow[];
};

const schoolError = (e: any) => {
  const m = String(e?.message ?? "");
  if (m.includes("BAD_NAME")) return "Scrivi un nome di almeno 2 lettere.";
  if (m.includes("BAD_STUDENTS")) return "Gli alunni vanno da 1 a 60.";
  if (m.includes("CLASS_EXISTS")) return "In questo istituto c'è già una classe con questo nome.";
  if (m.includes("FEWER_THAN_CODES")) return "Ci sono già più codici di così: non puoi scendere sotto quel numero.";
  if (m.includes("HAS_CODES")) return "Non si può eliminare: ci sono già dei codici creati.";
  if (m.includes("NOT_ADMIN")) return "Questa sezione è riservata.";
  return "Operazione non riuscita. Riprova.";
};

export async function fetchSchoolTree(): Promise<PartnerRow[] | null> {
  const { data, error } = await supabase.rpc("admin_school_tree");
  if (error) {
    console.error("admin_school_tree error:", error);
    return null;
  }
  return (data ?? []) as PartnerRow[];
}

export async function savePartner(p: { id?: string | null; name: string; kind: "azienda" | "comune"; priceCents: number }) {
  const { data, error } = await supabase.rpc("admin_save_partner", {
    p_id: p.id ?? null,
    p_name: p.name,
    p_kind: p.kind,
    p_price_cents: p.priceCents,
  });
  return error ? { error: schoolError(error) } : { id: data as string };
}

export async function saveSchool(s: { id?: string | null; partnerId: string; name: string; city: string }) {
  const { data, error } = await supabase.rpc("admin_save_school", {
    p_id: s.id ?? null,
    p_partner: s.partnerId,
    p_name: s.name,
    p_city: s.city,
  });
  return error ? { error: schoolError(error) } : { id: data as string };
}

export async function saveClass(c: { id?: string | null; schoolId: string; name: string; students: number }) {
  const { data, error } = await supabase.rpc("admin_save_class", {
    p_id: c.id ?? null,
    p_school: c.schoolId,
    p_name: c.name,
    p_students: c.students,
  });
  return error ? { error: schoolError(error) } : { id: data as string };
}

export async function deleteSchoolItem(kind: "partner" | "school" | "class", id: string) {
  const { error } = await supabase.rpc("admin_delete_school_item", { p_kind: kind, p_id: id });
  return error ? schoolError(error) : null;
}

export async function createClassCodes(classId: string): Promise<{ created?: number; error?: string }> {
  const { data, error } = await supabase.rpc("admin_create_class_codes", { p_class: classId });
  if (error) return { error: schoolError(error) };
  return { created: Number((data as any)?.created ?? 0) };
}

export async function fetchClassCodes(classId: string): Promise<Array<{ code: string; used: boolean; active: boolean }>> {
  const { data, error } = await supabase.rpc("admin_class_codes", { p_class: classId });
  if (error) {
    console.error("admin_class_codes error:", error);
    return [];
  }
  return (data ?? []) as any[];
}

export async function fetchSchoolRanking(schoolId: string, period: "month" | "year"): Promise<RankingRow[]> {
  const { data, error } = await supabase.rpc("admin_school_ranking", { p_school: schoolId, p_period: period });
  if (error) {
    console.error("admin_school_ranking error:", error);
    return [];
  }
  return (data ?? []) as RankingRow[];
}

/** La classe della famiglia (null se non ha attivato un codice di una classe) */
export async function fetchMyClass(period: "month" | "year" = "month"): Promise<MyClass | null> {
  const { data, error } = await supabase.rpc("my_class", { p_period: period });
  if (error) {
    console.error("my_class error:", error);
    return null;
  }
  return (data ?? null) as MyClass | null;
}

export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`);
export const ordinal = (n: number) => `${n}ª`;
