import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function getBearerToken(req: VercelRequest): string | null {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h || typeof h !== "string") return null;

  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const appUrl = process.env.APP_URL || "http://localhost:3000";

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!stripeSecretKey) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY" });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }

    const { productCode } = req.body ?? {};

    if (!productCode || typeof productCode !== "string") {
      return res.status(400).json({ error: "Missing productCode" });
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

    const user = userData.user;

    const { data: product, error: productErr } = await supabase
      .from("billing_products")
      .select("code,type,name,stripe_price_id")
      .eq("code", productCode)
      .eq("is_active", true)
      .maybeSingle();

    if (productErr) {
      return res.status(500).json({ error: productErr.message });
    }

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (!product.stripe_price_id) {
      return res.status(400).json({ error: "Product missing stripe_price_id" });
    }

    const stripe = new Stripe(stripeSecretKey);

    const mode = product.type === "subscription" ? "subscription" : "payment";

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [
        {
          price: product.stripe_price_id,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: {
        user_id: user.id,
        product_code: product.code,
        product_type: product.type,
      },
      subscription_data:
        mode === "subscription"
          ? {
              metadata: {
                user_id: user.id,
                product_code: product.code,
                product_type: product.type,
              },
            }
          : undefined,
      payment_intent_data:
        mode === "payment"
          ? {
              metadata: {
                user_id: user.id,
                product_code: product.code,
                product_type: product.type,
              },
            }
          : undefined,
    });

    return res.status(200).json({
      url: session.url,
    });
  } catch (e: any) {
    console.error("create checkout session error:", e);
    return res.status(500).json({
      error: e?.message ?? "Server error",
    });
  }
}