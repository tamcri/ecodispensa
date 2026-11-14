import { supabase } from "./supabaseClient";

/**
 * Codici:
 *  - attivazione (Comuni, aziende): 12 mesi di abbonamento senza carta e senza rinnovo
 *  - creator (es. GIULIA10): crediti in regalo per chi si iscrive
 *  - invito di un amico (AMICO-XXXXX): 2 crediti all'amico, 2 a chi invita quando l'amico usa l'app
 */

export type RedeemResult = {
  ok: boolean;
  kind?: "activation" | "creator" | "invite";
  credits?: number;
  premium_until?: string;
  label?: string;
  error?: string;
};

const ERRORS: Record<string, string> = {
  CODE_NOT_FOUND: "Codice non trovato: controlla di averlo scritto bene.",
  CODE_USED_UP: "Questo codice è già stato usato.",
  CODE_EXPIRED: "Questo codice è scaduto.",
  CODE_INACTIVE: "Questo codice non è più attivo.",
  ALREADY_REDEEMED: "Hai già usato questo codice.",
  ONLY_NEW_ACCOUNTS: "I codici dei creator e degli amici valgono solo nei primi 14 giorni dall'iscrizione.",
  ALREADY_HAS_BONUS: "Hai già ricevuto un regalo di benvenuto con un codice: se ne può usare uno solo.",
  HAS_SUBSCRIPTION:
    "Hai già un abbonamento con rinnovo automatico. Disdicilo qui nel Profilo e poi usa il codice: i 12 mesi partono dalla fine del periodo già pagato.",
  OWN_CODE: "Questo è il tuo codice: condividilo con un amico!",
  TOO_MANY_ATTEMPTS: "Troppi tentativi sbagliati: riprova domani.",
  NO_USER: "Accedi per usare il codice.",
};

const dateIt = (iso?: string) => {
  if (!iso) return "";
  // il server tiene 1 giorno di margine: la data reale di scadenza è il giorno prima
  return new Date(new Date(iso).getTime() - 86_400_000).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

/** Messaggio da mostrare all'utente dopo aver usato un codice */
export function redeemMessage(r: RedeemResult): string {
  if (!r.ok) return ERRORS[r.error ?? ""] ?? "Non sono riuscito a usare il codice. Riprova tra poco.";
  if (r.kind === "activation") {
    const by = r.label ? `, offerto da ${r.label}` : "";
    return `Fatto! Hai EcoDispensa con 25 crediti al mese fino al ${dateIt(r.premium_until)}${by}. Nessun pagamento e nessun rinnovo automatico.`;
  }
  if (r.kind === "creator") {
    const by = r.label ? ` da ${r.label}` : "";
    return `Benvenuto! Hai ricevuto ${r.credits ?? 10} crediti in regalo${by}.`;
  }
  return `Benvenuto! Hai ricevuto ${r.credits ?? 2} crediti in regalo dal tuo amico.`;
}

export async function redeemCode(code: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc("redeem_code", { p_code: code });
  if (error) {
    console.error("redeem_code error:", error);
    return { ok: false, error: "SERVER" };
  }
  return (data ?? { ok: false }) as RedeemResult;
}

export type MyInvite = {
  code: string;
  invited: number;
  rewarded: number;
  bonus_received: boolean;
  can_redeem_bonus: boolean;
};

export async function fetchMyInvite(): Promise<MyInvite | null> {
  const { data, error } = await supabase.rpc("my_invite");
  if (error) {
    console.error("my_invite error:", error);
    return null;
  }
  return data as MyInvite;
}

/** Link da condividere: apre l'app con il codice già scritto nella registrazione */
export const inviteLink = (code: string) => `${window.location.origin}/?codice=${encodeURIComponent(code)}`;

// ---------- Codice inserito alla registrazione: lo uso al primo accesso ----------
const PENDING_KEY = "eco-pending-code";

export function savePendingCode(code: string, username: string) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ code: code.trim(), username: username.trim().toLowerCase() }));
  } catch {
    /* storage non disponibile */
  }
}

export function takePendingCode(username: string | null): string | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p?.code || (username && p.username && p.username !== username.toLowerCase())) return null;
    localStorage.removeItem(PENDING_KEY);
    return String(p.code);
  } catch {
    return null;
  }
}

/** Codice arrivato con il link di invito (?codice=...) */
export function codeFromUrl(): string | null {
  try {
    const c = new URLSearchParams(window.location.search).get("codice");
    return c ? c.trim().toUpperCase().slice(0, 32) : null;
  } catch {
    return null;
  }
}

// ---------- Area riservata ----------
export async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

export type CreatorRow = {
  code: string;
  label: string;
  bonus: number;
  active: boolean;
  created_at: string;
  signups: number;
  subscribers: number;
};

export type BatchRow = {
  batch_id: string;
  label: string;
  months: number;
  total: number;
  used: number;
  active: boolean;
  created_at: string;
};

export type CodesOverview = {
  creators: CreatorRow[];
  batches: BatchRow[];
  invites: { total: number; rewarded: number };
};

const adminError = (e: any) => {
  const m = String(e?.message ?? "");
  if (m.includes("CODE_EXISTS")) return "Esiste già un codice uguale: scegline un altro.";
  if (m.includes("RESERVED_PREFIX")) return "I codici che iniziano con AMICO- sono riservati agli inviti.";
  if (m.includes("BAD_CODE")) return "Il codice deve avere da 4 a 32 caratteri: lettere, numeri o trattino.";
  if (m.includes("BAD_COUNT")) return "Puoi creare da 1 a 2000 codici alla volta.";
  if (m.includes("BAD_MONTHS")) return "La durata va da 1 a 24 mesi.";
  if (m.includes("NOT_ADMIN")) return "Questa sezione è riservata.";
  return "Operazione non riuscita. Riprova.";
};

export async function fetchCodesOverview(): Promise<CodesOverview | null> {
  const { data, error } = await supabase.rpc("admin_codes_overview");
  if (error) {
    console.error("admin_codes_overview error:", error);
    return null;
  }
  return data as CodesOverview;
}

export async function createActivationCodes(
  label: string,
  prefix: string,
  count: number,
  months: number
): Promise<{ codes?: string[]; batchId?: string; error?: string }> {
  const { data, error } = await supabase.rpc("admin_create_activation_codes", {
    p_label: label,
    p_prefix: prefix,
    p_count: count,
    p_months: months,
  });
  if (error) return { error: adminError(error) };
  return { codes: (data as any)?.codes ?? [], batchId: (data as any)?.batch_id };
}

export async function createCreatorCode(code: string, label: string, bonus: number): Promise<{ code?: string; error?: string }> {
  const { data, error } = await supabase.rpc("admin_create_creator_code", { p_code: code, p_label: label, p_bonus: bonus });
  if (error) return { error: adminError(error) };
  return { code: (data as any)?.code };
}

export async function fetchBatchCodes(batchId: string): Promise<Array<{ code: string; used: boolean }>> {
  const { data, error } = await supabase.rpc("admin_batch_codes", { p_batch_id: batchId });
  if (error) {
    console.error("admin_batch_codes error:", error);
    return [];
  }
  return (data ?? []) as Array<{ code: string; used: boolean }>;
}

export async function setCodeActive(code: string, active: boolean) {
  const { error } = await supabase.rpc("admin_set_code_active", { p_code: code, p_active: active });
  return error ? adminError(error) : null;
}

export async function setBatchActive(batchId: string, active: boolean) {
  const { error } = await supabase.rpc("admin_set_batch_active", { p_batch_id: batchId, p_active: active });
  return error ? adminError(error) : null;
}
