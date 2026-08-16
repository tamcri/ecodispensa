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
      return res.status(500).json({
        error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
      });
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
      return res.status(401).json({
        error: "Invalid session",
        details: userErr?.message,
      });
    }

    const userId = userData.user.id;

    const { data: purchases, error: purchasesErr } = await supabase
      .from("purchases")
      .select(
        "id,purchase_type,product_code,amount,currency,credits_added,created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (purchasesErr) {
      return res.status(500).json({ error: purchasesErr.message });
    }

    const productCodes = Array.from(
      new Set(
        (purchases ?? [])
          .map((purchase) => purchase.product_code)
          .filter((code): code is string => typeof code === "string" && code.length > 0)
      )
    );

    let productNames = new Map<string, string>();

    if (productCodes.length > 0) {
      const { data: products, error: productsErr } = await supabase
        .from("billing_products")
        .select("code,name")
        .in("code", productCodes);

      if (productsErr) {
        console.error("purchases product names load error:", productsErr);
      } else {
        productNames = new Map(
          (products ?? []).map((product) => [product.code, product.name])
        );
      }
    }

    return res.status(200).json({
      purchases: (purchases ?? []).map((purchase) => ({
        ...purchase,
        product_name: productNames.get(purchase.product_code) ?? null,
      })),
    });
  } catch (e: any) {
    console.error("purchases api error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}
