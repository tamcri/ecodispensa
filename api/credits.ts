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

    // saldo = crediti comprati/regalati + crediti mensili dell'abbonamento (ricaricati se è iniziato un nuovo mese)
    const { data, error } = await supabase.rpc("get_my_credits");
    if (error) return res.status(500).json({ error: error.message });

    const d = (data ?? {}) as Record<string, unknown>;
    return res.status(200).json({
      eco_credits: Number(d.eco_credits ?? 0),
      purchased_credits: Number(d.purchased_credits ?? 0),
      monthly_credits: Number(d.monthly_credits ?? 0),
      monthly_reset_at: d.monthly_reset_at ?? null,
      updated_at: d.updated_at ?? null,
    });
  } catch (e: any) {
    console.error("credits api error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}