import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { canUserCheckout } from "./_lib/billing";

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
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();

    if (userErr || !userData?.user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const { data, error } = await supabase
      .from("billing_products")
      .select(
        "code,type,name,description,price_cents,currency,credits_amount,is_active,min_quantity,max_quantity,quantity_step"
      )
      .eq("is_active", true)
      .order("price_cents", { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      products: data ?? [],
      // false finché i pagamenti veri non sono attivi (con le chiavi di prova acquista solo chi testa)
      checkout_enabled: canUserCheckout(userData.user.id),
    });
  } catch (e: any) {
    console.error("billing-products api error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}