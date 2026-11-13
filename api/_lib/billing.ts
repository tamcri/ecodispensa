/**
 * Regole comuni per i pagamenti.
 * Finché Stripe usa le chiavi di prova (sk_test_ / sandbox) l'acquisto è permesso solo
 * agli utenti indicati in STRIPE_TEST_USER_IDS: così nessuno può ottenere crediti
 * "pagando" con le carte finte di Stripe.
 */
export function isStripeTestKey(key: string | undefined): boolean {
  return !key || key.startsWith("sk_test_") || key.startsWith("rk_test_");
}

export function canUserCheckout(userId: string): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return false;
  if (!isStripeTestKey(key)) return true;
  const allowed = (process.env.STRIPE_TEST_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(userId);
}
