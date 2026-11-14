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
  currentPlanCode = null,
  cancelAtPeriodEnd = false,
  activeUntilLabel = null,
  onSwitchToYearly,
  isGift = false,
}: {
  products: PlanProduct[];
  loading: boolean;
  checkoutEnabled: boolean;
  isSubscribed: boolean;
  onCheckout: (code: string, quantity?: number) => Promise<void>;
  currentPlanCode?: string | null;
  cancelAtPeriodEnd?: boolean;
  activeUntilLabel?: string | null;
  onSwitchToYearly?: () => Promise<void>;
  /** Abbonamento attivato con un codice: nessun rinnovo, niente da disdire */
  isGift?: boolean;
}) => {
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const isCurrentYearly = isSubscribed && currentPlanCode === "premium_yearly";
  const isCurrentMonthly = isSubscribed && !isCurrentYearly;
  const untilText = activeUntilLabel ?? "la fine del periodo pagato";
  const currentStatus = isGift
    ? `Attivato con un codice: valido fino al ${untilText}, senza rinnovo automatico.`
    : cancelAtPeriodEnd
    ? `Disdetto: resta attivo fino al ${untilText}. Per continuare premi «Riattiva il rinnovo» nel tuo piano qui sopra.`
    : `Rinnovo automatico il ${untilText}.`;
  const monthly = products.find((p) => p.code === "premium_monthly");
  const yearly = products.find((p) => p.code === "premium_yearly");
  const topup = products.find((p) => p.type === "credits_topup");

  const min = Number(topup?.min_quantity ?? 10);
  const max = Number(topup?.max_quantity ?? 200);
  const step = Number(topup?.quantity_step ?? 5);
  const [qty, setQty] = useState(20);
  const [busy, setBusy] = useState<string | null>(null);
  const [waiver, setWaiver] = useState(false);

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round((n - min) / step) * step + min));
  const qtySafe = clamp(qty);
  const topupCents = qtySafe * Number(topup?.price_cents ?? 30);
  const menus = Math.floor(qtySafe / 4);

  const buy = async (code: string, quantity?: number) => {
    if (!checkoutEnabled || busy || !waiver) return;
    setBusy(code);
    try {
      await onCheckout(code, quantity);
    } finally {
      setBusy(null);
    }
  };

  const buyLabel = (code: string, label: string) =>
    busy === code ? <Loader2 size={16} className="animate-spin" /> : checkoutEnabled ? label : "Disponibile a breve";

  if (loading) return <p className="text-sm text-muted">Caricamento piani…</p>;

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

      {checkoutEnabled && (
        <label className="flex items-start gap-2 rounded-xl bg-white p-3 text-xs text-ink">
          <input
            type="checkbox"
            checked={waiver}
            onChange={(e) => setWaiver(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
          />
          <span>
            Voglio iniziare subito: so che, usando i crediti, rinuncio al diritto di recesso di 14 giorni. So che l'abbonamento
            si rinnova in automatico finché non lo disdico, e che dopo la disdetta resta attivo fino alla fine del periodo pagato.
          </span>
        </label>
      )}

      {monthly && (
        <div className="rounded-2xl border-2 border-emerald-500 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">Il più conveniente</p>
              <p className="mt-0.5 text-lg font-extrabold text-ink">Mensile</p>
              <p className="text-sm text-muted">
                {euro(monthly.price_cents)} al mese · {monthly.credits_amount} crediti ogni mese
              </p>
            </div>
            <p className="text-right text-xs text-muted">≈ {euro(Math.round(monthly.price_cents / monthly.credits_amount))} a credito</p>
          </div>
          <p className="mt-2 text-xs text-muted">Per esempio 4 menu settimanali e 36 richieste di ricette.</p>
          {isCurrentMonthly ? (
            <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
              È il tuo piano attuale. {currentStatus}
            </p>
          ) : isCurrentYearly ? (
            <p className="mt-3 rounded-xl bg-white p-3 text-sm text-ink">
              Hai l’Annuale. Per passare al Mensile: disdici l’Annuale e, alla scadenza del {untilText}, scegli il Mensile.
            </p>
          ) : (
            <>
              <button
                type="button"
                disabled={!checkoutEnabled || !waiver || !!busy}
                onClick={() => buy(monthly.code)}
                className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50"
              >
                {buyLabel(monthly.code, `Abbonati a ${euro(monthly.price_cents)}/mese`)}
              </button>
              <p className="mt-2 text-center text-xs text-muted">
                <b>Si rinnova in automatico ogni mese</b> ({euro(monthly.price_cents)}) · disdici quando vuoi dal Profilo
              </p>
            </>
          )}
        </div>
      )}

      {yearly && (
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-extrabold text-ink">Annuale</p>
              <p className="text-sm text-muted">
                {euro(yearly.price_cents)} all’anno · circa {euro(Math.round(yearly.price_cents / 12))} al mese
              </p>
            </div>
            {savingPct !== null && savingPct > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Risparmi il {savingPct}%</span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">{yearly.credits_amount} crediti ogni mese per 12 mesi, con un unico pagamento all’anno.</p>
          {isCurrentYearly ? (
            <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
              È il tuo piano attuale. {currentStatus}
            </p>
          ) : isCurrentMonthly ? (
            !confirmSwitch ? (
              <button
                type="button"
                disabled={!checkoutEnabled || !onSwitchToYearly || !!busy}
                onClick={() => setConfirmSwitch(true)}
                className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-forest text-sm font-bold text-white disabled:opacity-50"
              >
                {checkoutEnabled ? "Passa all’Annuale" : "Disponibile a breve"}
              </button>
            ) : (
              <div className="mt-3 rounded-xl border border-black/10 bg-white p-3 text-sm text-ink">
                <p className="font-bold text-ink">Passare all’Annuale?</p>
                <p className="mt-1">
                  Paghi subito {euro(yearly.price_cents)} <b>meno i giorni del mese in corso che non hai ancora usato</b>: la
                  differenza la calcola Stripe sulla carta che hai già usato. L’anno parte da oggi, i crediti del mese restano e il
                  rinnovo diventa annuale ({euro(yearly.price_cents)} ogni anno, disdici quando vuoi).
                </p>
                {!waiver && <p className="mt-2 text-xs font-semibold text-amber-700">Spunta prima la casella in alto.</p>}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmSwitch(false)}
                    className="h-10 rounded-xl bg-white font-bold text-ink ring-1 ring-black/10"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    disabled={!waiver || !!busy || !onSwitchToYearly}
                    onClick={async () => {
                      if (!onSwitchToYearly) return;
                      setBusy("switch");
                      try {
                        await onSwitchToYearly();
                        setConfirmSwitch(false);
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="flex h-10 items-center justify-center rounded-xl bg-forest font-bold text-white disabled:opacity-50"
                  >
                    {busy === "switch" ? <Loader2 size={16} className="animate-spin" /> : "Sì, passa"}
                  </button>
                </div>
              </div>
            )
          ) : (
            <>
              <button
                type="button"
                disabled={!checkoutEnabled || !waiver || !!busy}
                onClick={() => buy(yearly.code)}
                className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-forest text-sm font-bold text-white disabled:opacity-50"
              >
                {buyLabel(yearly.code, `Abbonati a ${euro(yearly.price_cents)}/anno`)}
              </button>
              <p className="mt-2 text-center text-xs text-muted">
                <b>Si rinnova in automatico ogni anno</b> ({euro(yearly.price_cents)}) · disdici quando vuoi dal Profilo
              </p>
            </>
          )}
        </div>
      )}

      {topup && (
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <p className="text-lg font-extrabold text-ink">Ricarica crediti</p>
          <p className="text-sm text-muted">
            Scegli quanti crediti: {euro(topup.price_cents)} l’uno, non scadono.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Meno crediti"
              onClick={() => setQty(clamp(qtySafe - step))}
              disabled={qtySafe <= min}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone text-ink disabled:opacity-40"
            >
              <Minus size={18} />
            </button>
            <div className="text-center">
              <p className="text-2xl font-extrabold text-ink">{qtySafe} crediti</p>
              <p className="text-xs text-muted">
                {menus > 0 ? `bastano per ${menus} menu settimanal${menus === 1 ? "e" : "i"}` : `${qtySafe * 4} richieste di ricette`}
              </p>
            </div>
            <button
              type="button"
              aria-label="Più crediti"
              onClick={() => setQty(clamp(qtySafe + step))}
              disabled={qtySafe >= max}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone text-ink disabled:opacity-40"
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
            disabled={!checkoutEnabled || !waiver || !!busy}
            onClick={() => buy(topup.code, qtySafe)}
            className="mt-3 flex h-11 w-full items-center justify-center rounded-xl border border-emerald-600 text-sm font-bold text-emerald-700 disabled:opacity-50"
          >
            {buyLabel(topup.code, `Carica ${qtySafe} crediti · ${euro(topupCents)}`)}
          </button>
          <p className="mt-2 text-center text-xs text-muted">Pagamento unico, nessun rinnovo.</p>
        </div>
      )}
    </div>
  );
};
