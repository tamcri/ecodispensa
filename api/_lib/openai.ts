import type { VercelRequest } from "@vercel/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getBearerToken(req: VercelRequest): string | null {
  const h = req.headers.authorization || (req.headers as any).Authorization;
  if (!h || typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Client Supabase che agisce come l'utente della richiesta (rispetta le regole RLS). */
export async function getUserClient(
  req: VercelRequest
): Promise<{ supabase: SupabaseClient; userId: string } | { error: string; status: number }> {
  const token = getBearerToken(req);
  if (!token) return { error: "Missing Authorization Bearer token", status: 401 };

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: "Missing Supabase environment variables", status: 500 };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return { error: "Invalid session", status: 401 };

  return { supabase, userId: data.user.id };
}

export async function isPremiumActive(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_profiles")
    .select("plan_type, premium_until")
    .eq("user_id", userId)
    .maybeSingle();
  const until = data?.premium_until ? new Date(String(data.premium_until)) : null;
  return (
    data?.plan_type === "premium" &&
    until !== null &&
    !Number.isNaN(until.getTime()) &&
    until.getTime() > Date.now()
  );
}

/** Estrae il testo dalla risposta della Responses API di OpenAI. */
export function responseText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  const parts: string[] = [];
  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c?.text === "string") parts.push(c.text);
      }
    }
  }
  return parts.join("");
}

export type AiKind = "recipes" | "menu" | "menu_fix" | "receipt" | "voice" | "product_photo" | "date_photo";

/**
 * Client Supabase con la chiave del server (service_role): serve per le operazioni che
 * l'utente non deve poter fare da solo (rimborsi dei crediti, registro dei costi, limiti).
 * Nelle anteprime senza la chiave restituisce null: quelle operazioni vengono saltate.
 */
let _service: SupabaseClient | null | undefined;
export function serviceClient(): SupabaseClient | null {
  if (_service !== undefined) return _service;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  _service = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return _service;
}

/**
 * Registra quanto ha "consumato" una richiesta a OpenAI (token in entrata e in uscita),
 * per vedere i costi nella dashboard dell'amministratore. Non blocca mai la risposta.
 */
export async function logAiUsage(userId: string, kind: AiKind, model: string, data: any): Promise<void> {
  try {
    const admin = serviceClient();
    if (!admin) return;
    const usage = data?.usage ?? {};
    await admin.rpc("srv_log_ai_usage", {
      p_user: userId,
      p_kind: kind,
      p_model: String(data?.model || model || "?"),
      p_input: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0,
      p_output: Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0,
    });
  } catch {
    /* il registro dei costi non deve fermare l'app */
  }
}

/** Limiti giornalieri (ultime 24 ore) delle funzioni gratuite che usano l'intelligenza artificiale */
export const DAILY_LIMITS: Partial<Record<AiKind, number>> = {
  voice: 40,
  receipt: 25,
  product_photo: 60,
  date_photo: 60,
};

/** true se l'utente può ancora usare questa funzione oggi */
export async function withinDailyLimit(userId: string, kind: AiKind): Promise<boolean> {
  const limit = DAILY_LIMITS[kind];
  const admin = serviceClient();
  if (!limit || !admin) return true;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error } = await admin
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", since);
  if (error) return true; // in caso di dubbio non blocchiamo l'utente
  return (count ?? 0) < limit;
}

export const DAILY_LIMIT_MESSAGE =
  "Hai raggiunto il limite di oggi per questa funzione. Riprova domani, oppure inserisci i prodotti a mano.";

/** Rimborso di una richiesta di ricette: lo fa solo il server */
export async function refundGenerationFor(
  userId: string,
  consumedCredit: boolean,
  reason: string
): Promise<{ remainingCredits?: number; ok: boolean }> {
  const admin = serviceClient();
  if (!admin) return { ok: false };
  const { data, error } = await admin.rpc("srv_refund_eco_generation", {
    p_user: userId,
    p_consumed_credit: consumedCredit,
    p_reason: reason,
  });
  return { ok: !error, remainingCredits: typeof (data as any)?.remainingCredits === "number" ? (data as any).remainingCredits : undefined };
}

/** Rimborso dei crediti del menu settimanale: lo fa solo il server */
export async function refundCreditsFor(
  userId: string,
  consumptionId: string,
  reason: string
): Promise<{ remainingCredits?: number; ok: boolean }> {
  const admin = serviceClient();
  if (!admin) return { ok: false };
  const { data, error } = await admin.rpc("srv_refund_eco_credits", {
    p_user: userId,
    p_consumption_id: consumptionId,
    p_reason: reason,
  });
  return { ok: !error, remainingCredits: typeof (data as any)?.remainingCredits === "number" ? (data as any).remainingCredits : undefined };
}
