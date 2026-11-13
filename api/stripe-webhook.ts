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

function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
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
    // Disdetta programmata, riattivazione o fine dell'abbonamento
    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as any;
      if (sub?.metadata?.app && sub.metadata.app !== "ecodispensa") {
        return res.status(200).json({ received: true, ignored: true });
      }
      const ended = event.type === "customer.subscription.deleted" || sub.status === "canceled" || sub.status === "unpaid";
      const { error: stateErr } = await supabase.rpc("admin_set_subscription_state", {
        p_subscription_id: sub.id,
        p_cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        p_ended: ended,
      });
      if (stateErr) throw stateErr;
      return res.status(200).json({ received: true });
    }

    // Rinnovo automatico dell'abbonamento (ogni mese o ogni anno)
    if (event.type === "invoice.paid") {
      const invoice = event.data.object as any;
      if (invoice.billing_reason !== "subscription_cycle") {
        return res.status(200).json({ received: true, ignored: true });
      }
      const meta =
        invoice.parent?.subscription_details?.metadata ?? invoice.subscription_details?.metadata ?? {};
      const userId = meta.user_id;
      const productCode = meta.product_code;
      if (!userId || !productCode || (meta.app && meta.app !== "ecodispensa")) {
        return res.status(200).json({ received: true, ignored: true, reason: "missing metadata" });
      }

      const { data: seen } = await supabase.from("purchases").select("id").eq("stripe_session_id", invoice.id).maybeSingle();
      if (seen) return res.status(200).json({ received: true, duplicate: true });

      const { data: product } = await supabase
        .from("billing_products")
        .select("code,price_cents,currency,interval_months")
        .eq("code", productCode)
        .maybeSingle();
      if (!product) return res.status(200).json({ received: true, ignored: true, reason: "unknown product" });

      const periodEnd = invoice.lines?.data?.[0]?.period?.end;
      const until = periodEnd ? new Date(periodEnd * 1000) : addMonths(new Date(), Number(product.interval_months ?? 1));
      // un giorno di margine per i ritardi di pagamento
      until.setDate(until.getDate() + 1);

      const subscriptionId =
        invoice.parent?.subscription_details?.subscription ?? invoice.subscription ?? null;
      const { error: subErr } = await supabase.rpc("admin_activate_subscription", {
        p_user_id: userId,
        p_product_code: product.code,
        p_until: until.toISOString(),
        p_new_period: false,
        p_customer_id: typeof invoice.customer === "string" ? invoice.customer : null,
        p_subscription_id: typeof subscriptionId === "string" ? subscriptionId : null,
      });
      if (subErr) throw subErr;

      const { error: purchaseErr } = await supabase.from("purchases").insert({
        user_id: userId,
        purchase_type: "subscription_renewal",
        product_code: product.code,
        amount: Number(invoice.amount_paid ?? product.price_cents ?? 0) / 100,
        currency: String(invoice.currency ?? product.currency ?? "EUR").toUpperCase(),
        credits_added: 0,
        stripe_session_id: invoice.id,
        stripe_payment_intent: null,
      });
      if (purchaseErr) throw purchaseErr;
      return res.status(200).json({ received: true });
    }

    if (event.type !== "checkout.session.completed") {
      return res.status(200).json({ received: true, ignored: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    const stripeSessionId = session.id;
    const userId = session.metadata?.user_id || session.client_reference_id;
    const productCode = session.metadata?.product_code;

    // Nello stesso account Stripe ci sono anche altri progetti: i loro pagamenti si ignorano
    if (!userId || !productCode) {
      return res.status(200).json({ received: true, ignored: true, reason: "not an EcoDispensa checkout" });
    }

    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      return res.status(200).json({ received: true, ignored: true, reason: "not paid" });
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
      .select("code,type,name,price_cents,currency,credits_amount,interval_months")
      .eq("code", productCode)
      .eq("is_active", true)
      .maybeSingle();

    if (productErr) {
      throw productErr;
    }

    if (!product) {
      return res.status(200).json({ received: true, ignored: true, reason: "unknown product" });
    }

    const purchaseType = product.type;
    let creditsToAdd = purchaseType === "credits_pack" ? Number(product.credits_amount ?? 0) : 0;
    let amount = Number(product.price_cents ?? 0) / 100;

    if (purchaseType === "credits_topup") {
      // crediti scelti dall'utente: controlla che l'importo pagato corrisponda davvero
      const units = Math.round(Number(session.metadata?.credits ?? 0));
      const expectedCents = units * Number(product.price_cents ?? 0);
      if (!Number.isFinite(units) || units <= 0 || session.amount_total !== expectedCents) {
        console.error("Top-up amount mismatch", { units, amount_total: session.amount_total, expectedCents });
        return res.status(200).json({ received: true, ignored: true, reason: "amount mismatch" });
      }
      creditsToAdd = units * Number(product.credits_amount ?? 1);
      amount = expectedCents / 100;
    }

    if ((purchaseType === "credits_pack" || purchaseType === "credits_topup") && creditsToAdd > 0) {
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
      // 25 crediti subito, poi ogni mese si azzerano e tornano a 25 finché l'abbonamento è attivo
      const until = addMonths(new Date(), Number(product.interval_months ?? 1));
      until.setDate(until.getDate() + 1);
      const { error: subErr } = await supabase.rpc("admin_activate_subscription", {
        p_user_id: userId,
        p_product_code: product.code,
        p_until: until.toISOString(),
        p_new_period: true,
        p_customer_id: typeof session.customer === "string" ? session.customer : null,
        p_subscription_id: typeof session.subscription === "string" ? session.subscription : null,
      });

      if (subErr) {
        throw subErr;
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