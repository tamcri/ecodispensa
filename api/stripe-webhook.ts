import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Missing webhook environment variables" });
  }

  const stripe = new Stripe(stripeSecretKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let event: Stripe.Event;

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers["stripe-signature"];

    if (!signature || typeof signature !== "string") {
      return res.status(400).json({ error: "Missing Stripe signature" });
    }

    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e: any) {
    console.error("Stripe webhook signature error:", e?.message ?? e);
    return res.status(400).json({ error: "Invalid Stripe webhook signature" });
  }

  try {
    if (event.type !== "checkout.session.completed") {
      return res.status(200).json({ received: true, ignored: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    const stripeSessionId = session.id;
    const userId = session.metadata?.user_id || session.client_reference_id;
    const productCode = session.metadata?.product_code;

    if (!userId || !productCode) {
      return res.status(400).json({ error: "Missing user_id or product_code in session metadata" });
    }

    const { data: alreadyProcessed, error: existingErr } = await supabase
      .from("purchases")
      .select("id")
      .eq("stripe_session_id", stripeSessionId)
      .maybeSingle();

    if (existingErr) {
      throw existingErr;
    }

    if (alreadyProcessed) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    const { data: product, error: productErr } = await supabase
      .from("billing_products")
      .select("code,type,name,price_cents,currency,credits_amount")
      .eq("code", productCode)
      .eq("is_active", true)
      .maybeSingle();

    if (productErr) {
      throw productErr;
    }

    if (!product) {
      return res.status(404).json({ error: "Billing product not found" });
    }

    const purchaseType = product.type;
    const creditsToAdd = purchaseType === "credits_pack" ? Number(product.credits_amount ?? 0) : 0;
    const amount = Number(product.price_cents ?? 0) / 100;

    if (purchaseType === "credits_pack" && creditsToAdd > 0) {
      const { error: creditErr } = await supabase.rpc("admin_add_eco_credits", {
        p_user_id: userId,
        p_amount: creditsToAdd,
        p_reason: `stripe_${product.code}`,
      });

      if (creditErr) {
        throw creditErr;
      }
    }

    if (purchaseType === "subscription") {
      const premiumUntil = new Date();
      premiumUntil.setMonth(premiumUntil.getMonth() + 1);

      const { error: profileErr } = await supabase
        .from("user_profiles")
        .upsert(
          {
            user_id: userId,
            plan_type: "premium",
            premium_until: premiumUntil.toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (profileErr) {
        throw profileErr;
      }
    }

    const { error: purchaseErr } = await supabase.from("purchases").insert({
      user_id: userId,
      purchase_type: purchaseType,
      product_code: product.code,
      amount,
      currency: product.currency ?? "EUR",
      credits_added: creditsToAdd,
      stripe_session_id: stripeSessionId,
      stripe_payment_intent:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
    });

    if (purchaseErr) {
      throw purchaseErr;
    }

    return res.status(200).json({ received: true });
  } catch (e: any) {
    console.error("stripe webhook handler error:", e);
    return res.status(500).json({ error: e?.message ?? "Webhook handler error" });
  }
}