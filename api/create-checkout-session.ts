import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { canUserCheckout } from "./_lib/billing";

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

    const { productCode, quantity, action, withdrawalWaiver } = req.body ?? {};

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: "Invalid session" });
    }
    const user = userData.user;

    // --- Disdetta / riattivazione del rinnovo (stessa funzione, per restare nel limite di Vercel) ---
    if (action === "cancel_subscription" || action === "resume_subscription") {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("stripe_subscription_id, plan_type, premium_until")
        .eq("user_id", user.id)
        .maybeSingle();

      const stripe = new Stripe(stripeSecretKey);
      let subscriptionId: string | null = profile?.stripe_subscription_id ?? null;

      // abbonamenti nati prima che salvassimo l'id: lo cerchiamo su Stripe
      if (!subscriptionId) {
        const found = await stripe.subscriptions
          .search({ query: `metadata['user_id']:'${user.id}' AND status:'active'`, limit: 1 })
          .catch(() => null);
        subscriptionId = found?.data?.[0]?.id ?? null;
      }
      if (!subscriptionId) {
        return res.status(404).json({ error: "NO_SUBSCRIPTION", message: "Non trovo un abbonamento attivo da disdire." });
      }

      const current = await stripe.subscriptions.retrieve(subscriptionId);
      if (current.metadata?.user_id && current.metadata.user_id !== user.id) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Abbonamento non tuo." });
      }

      const cancel = action === "cancel_subscription";
      const updated = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: cancel });

      // stato salvato dal server (l'utente non può scriverlo da solo)
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey) {
        const admin = createClient(supabaseUrl, serviceKey);
        await admin.rpc("admin_set_subscription_state", {
          p_subscription_id: subscriptionId,
          p_cancel_at_period_end: Boolean((updated as any).cancel_at_period_end),
          p_ended: false,
        });
        await admin
          .from("user_profiles")
          .update({ stripe_subscription_id: subscriptionId })
          .eq("user_id", user.id)
          .is("stripe_subscription_id", null);
      }

      return res.status(200).json({
        ok: true,
        cancelAtPeriodEnd: Boolean((updated as any).cancel_at_period_end),
        activeUntil: profile?.premium_until ?? null,
      });
    }

    if (!productCode || typeof productCode !== "string") {
      return res.status(400).json({ error: "Missing productCode" });
    }

    // Servizio digitale usato subito: serve la rinuncia esplicita ai 14 giorni di recesso
    if (withdrawalWaiver !== true) {
      return res.status(400).json({
        error: "WITHDRAWAL_WAIVER_REQUIRED",
        message: "Per continuare conferma di voler iniziare subito.",
      });
    }

    if (!canUserCheckout(user.id)) {
      return res.status(403).json({
        error: "CHECKOUT_NOT_AVAILABLE",
        message: "Gli acquisti saranno disponibili a breve.",
      });
    }

    const { data: product, error: productErr } = await supabase
      .from("billing_products")
      .select("code,type,name,price_cents,stripe_price_id,min_quantity,max_quantity,quantity_step")
      .eq("code", productCode)
      .eq("is_active", true)
      .maybeSingle();

    if (productErr) return res.status(500).json({ error: "Errore nel leggere i prodotti." });
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (!product.stripe_price_id) return res.status(400).json({ error: "Product missing stripe_price_id" });

    // Ricarica libera: numero di crediti scelto dall'utente, controllato qui sul server
    let units = 1;
    if (product.type === "credits_topup") {
      const min = Number(product.min_quantity ?? 10);
      const max = Number(product.max_quantity ?? 200);
      const step = Number(product.quantity_step ?? 1);
      units = Math.round(Number(quantity));
      if (!Number.isFinite(units) || units < min || units > max || (units - min) % step !== 0) {
        return res.status(400).json({
          error: "INVALID_QUANTITY",
          message: `Puoi caricare da ${min} a ${max} crediti, a scatti di ${step}.`,
        });
      }
    }

    const stripe = new Stripe(stripeSecretKey);
    const mode = product.type === "subscription" ? "subscription" : "payment";

    const metadata = {
      app: "ecodispensa",
      user_id: user.id,
      product_code: product.code,
      product_type: product.type,
      credits: product.type === "credits_topup" ? String(units) : "0",
      withdrawal_waiver_at: new Date().toISOString(),
    };

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: product.stripe_price_id, quantity: units }],
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
      client_reference_id: user.id,
      // niente customer_email: l'email dell'account è fittizia, Stripe la chiede al momento del pagamento
      metadata,
      subscription_data: mode === "subscription" ? { metadata } : undefined,
      payment_intent_data: mode === "payment" ? { metadata } : undefined,
      custom_text: {
        submit: {
          message:
            "Hai chiesto di iniziare subito: usando i crediti rinunci al diritto di recesso di 14 giorni. " +
            (mode === "subscription"
              ? "Puoi disdire quando vuoi dal Profilo: l'abbonamento resta attivo fino alla fine del periodo pagato."
              : "I crediti caricati non scadono."),
        },
      },
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