import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function getBearerToken(req: VercelRequest): string | null {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h || typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY" });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: "Invalid session", details: userErr?.message });
    }

    const user_id = userData.user.id;
    const user_email = userData.user.email ?? null;

    console.log("USER FROM TOKEN:", user_id, user_email);

    const { data, error } = await supabase
      .from("user_credits")
      .select("eco_credits, updated_at")
      .eq("user_id", user_id)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        error: error.message,
        debug_user_id: user_id,
        debug_email: user_email,
      });
    }

    return res.status(200).json({
      eco_credits: data?.eco_credits ?? 0,
      updated_at: data?.updated_at ?? null,

      // DEBUG temporaneo: rimuoveremo dopo aver verificato
      debug_user_id: user_id,
      debug_email: user_email,
      debug_has_row: Boolean(data),
    });
  } catch (e: any) {
    console.error("credits api error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}