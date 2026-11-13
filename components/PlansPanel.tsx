import React, { useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";

export type PlanProduct = {
  code: string;
  type: "credits_pack" | "subscription" | "credits_topup";
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  credits_amount: number;
  min_quantity?: number | null;
  max_quantity?: number | null;
  quantity_step?: number | null;
};

const euro = (cents: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);

/** Mensile, Annuale e Ricarica libera. Con checkoutEnabled = false i pulsanti dicono "Disponibile a breve". */
export const PlansPanel = ({
  products,
  loading,
  checkoutEnabled,
  isSubscribed,
  onCheckout,
}: {
  products: PlanProduct[];
  loading: boolean;
  checkoutEnabled: boolean;
  isSubscribed: boolean;
  onCheckout: (code: string, quantity?: number) => Promise<void>;
}) => {
  const monthly = products.find((p) => p.code === "premium_monthly");
  const yearly = products.find((p) => p.code === "premium_yearly");
  const topup = products.find((p) => p.type === "credits_topup");

  const min = Number(topup?.min_quantity ?? 10);
  const max = Number(topup?.max_quantity ?? 200);
  const step = Number(topup?.quantity_step ?? 5);
  const [qty, setQty] = useState(20);
  const [busy, setBusy] = useState<string | null>(null);

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round((n - min) / step) * step + min));
  const qtySafe = clamp(qty);
  const topupCents = qtySafe * Number(topup?.price_cents ?? 30);
  const menus = Math.floor(qtySafe / 4);

  const buy = async (code: string, quantity?: number) => {
    if (!checkoutEnabled || busy) return;
    setBusy(code);
    try {
      await onCheckout(code, quantity);
    } finally {
      setBusy(null);
    }
  };

  const buyLabel = (code: string, label: string) =>
    busy === code ? <Loader2 size={16} className="animate-spin" /> : checkoutEnabled ? label : "Disponibile a breve";

  if (loading) return <p className="text-sm text-gray-500">Caricamento piani…</p>;

  // risparmio reale dell'annuale rispetto a 12 mensilità
  const savingPct =
    monthly && yearly ? Math.round((1 - yearly.price_cents / (monthly.price_cents * 12)) * 100) : null;

  return (
    <div className="flex flex-col gap-3">
      {!checkoutEnabled && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Durante il periodo di prova gli acquisti non sono ancora attivi: lo saranno dal 1° marzo 2027.
        </p>
      )}

      {monthly && (
        <div className="rounded-2xl border-2 border-emerald-500 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">Il più conveniente</p>
              <p className="mt-0.5 text-lg font-extrabold text-gray-900">Mensile</p>
              <p className="text-sm text-gray-600">
                {euro(monthly.price_cents)} al mese · {monthly.credits_amount} crediti ogni mese
              </p>
            </div>
            <p className="text-right text-xs text-gray-500">≈ {euro(Math.round(monthly.price_cents / monthly.credits_amount))} a credito</p>
          </div>
          <p className="mt-2 text-xs text-gray-500">Per esempio 4 menu settimanali e 36 richieste di ricette.</p>
          <button
            type="button"
            disabled={!checkoutEnabled || !!busy || isSubscribed}
            onClick={() => buy(monthly.code)}
            className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50"
          >
            {isSubscribed ? "Hai già un abbonamento attivo" : buyLabel(monthly.code, `Abbonati a ${euro(monthly.price_cents)}/mese`)}
          </button>
        </div>
      )}

      {yearly && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-extrabold text-gray-900">Annuale</p>
              <p className="text-sm text-gray-600">
                {euro(yearly.price_cents)} all’anno · circa {euro(Math.round(yearly.price_cents / 12))} al mese
              </p>
            </div>
            {savingPct !== null && savingPct > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Risparmi il {savingPct}%</span>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500">{yearly.credits_amount} crediti ogni mese per 12 mesi, pagati una volta sola.</p>
          <button
            type="button"
            disabled={!checkoutEnabled || !!busy || isSubscribed}
            onClick={() => buy(yearly.code)}
            className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-gray-900 text-sm font-bold text-white disabled:opacity-50"
          >
            {isSubscribed ? "Hai già un abbonamento attivo" : buyLabel(yearly.code, `Abbonati a ${euro(yearly.price_cents)}/anno`)}
          </button>
        </div>
      )}

      {topup && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-lg font-extrabold text-gray-900">Ricarica crediti</p>
          <p className="text-sm text-gray-600">
            Scegli quanti crediti: {euro(topup.price_cents)} l’uno, non scadono.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Meno crediti"
              onClick={() => setQty(clamp(qtySafe - step))}
              disabled={qtySafe <= min}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-800 disabled:opacity-40"
            >
              <Minus size={18} />
            </button>
            <div className="text-center">
              <p className="text-2xl font-extrabold text-gray-900">{qtySafe} crediti</p>
              <p className="text-xs text-gray-500">
                {menus > 0 ? `bastano per ${menus} menu settimanal${menus === 1 ? "e" : "i"}` : `${qtySafe * 4} richieste di ricette`}
              </p>
            </div>
            <button
              type="button"
              aria-label="Più crediti"
              onClick={() => setQty(clamp(qtySafe + step))}
              disabled={qtySafe >= max}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-800 disabled:opacity-40"
            >
              <Plus size={18} />
            </button>
          </div>
          {monthly && topupCents > monthly.price_cents && (
            <p className="mt-2 text-xs font-semibold text-emerald-700">
              Con il Mensile a {euro(monthly.price_cents)} hai {monthly.credits_amount} crediti ogni mese: conviene di più.
            </p>
          )}
          <button
            type="button"
            disabled={!checkoutEnabled || !!busy}
            onClick={() => buy(topup.code, qtySafe)}
            className="mt-3 flex h-11 w-full items-center justify-center rounded-xl border border-emerald-600 text-sm font-bold text-emerald-700 disabled:opacity-50"
          >
            {buyLabel(topup.code, `Carica ${qtySafe} crediti · ${euro(topupCents)}`)}
          </button>
        </div>
      )}
    </div>
  );
};
