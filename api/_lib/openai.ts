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
