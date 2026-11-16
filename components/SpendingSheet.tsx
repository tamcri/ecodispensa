import React, { useEffect, useState } from 'react';
import { ChevronDown, Loader2, Mic, Receipt, Trash2 } from 'lucide-react';
import { Sheet } from './ui';
import { Spending, deleteReceipt, fetchReceiptLines, fetchSpending, formatEuro, formatEuroShort } from '../services/spending';

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MONTHS_LONG = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

const monthShort = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
const dateIt = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

type Lines = Awaited<ReturnType<typeof fetchReceiptLines>>;

/** Le mie spese: quanto spendi, dove va la spesa e quanto cibo finisce nel bidone, in euro */
export const SpendingSheet = ({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged?: () => void }) => {
  const [data, setData] = useState<Spending | null>(null);
  const [loading, setLoading] = useState(false);
  const [openReceipt, setOpenReceipt] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, Lines>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setData(await fetchSpending());
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    setOpenReceipt(null);
    setConfirmDelete(null);
    load();
  }, [open]);

  const toggleReceipt = async (id: string) => {
    setConfirmDelete(null);
    if (openReceipt === id) {
      setOpenReceipt(null);
      return;
    }
    setOpenReceipt(id);
    if (!lines[id]) {
      const l = await fetchReceiptLines(id);
      setLines((prev) => ({ ...prev, [id]: l }));
    }
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    if (await deleteReceipt(id)) {
      setOpenReceipt(null);
      await load();
      onChanged?.();
    }
  };

  const now = new Date();
  const monthName = MONTHS_LONG[now.getMonth()];
  const max = Math.max(1, ...(data?.months ?? []).map((m) => m.total));
  const catMax = Math.max(1, ...(data?.by_category ?? []).map((c) => c.total));
  const diff = data && data.prev_month_total > 0 ? Math.round(((data.month_total - data.prev_month_total) / data.prev_month_total) * 100) : null;
  const empty = data && data.receipts.length === 0 && data.priced_lines === 0 && data.wasted_value === 0;

  return (
    <Sheet open={open} onClose={onClose} title="Le mie spese">
      {loading && !data ? (
        <Loader2 size={24} className="mx-auto my-10 animate-spin text-muted" />
      ) : !data ? (
        <p className="py-8 text-center text-sm text-muted">Non riesco a caricare le spese. Riprova tra poco.</p>
      ) : empty ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-white px-5 py-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mint text-forest">
            <Receipt size={26} />
          </span>
          <p className="font-display text-lg font-bold text-ink">Ancora nessuna spesa</p>
          <p className="text-sm text-muted">
            In Dispensa fotografa lo scontrino: prendo prezzi, negozio e totale. Se carichi la spesa a voce, puoi scrivere i
            prezzi nella schermata di conferma o dopo, toccando il prodotto.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-4">
          <div className="rounded-3xl bg-forest p-5 text-white">
            <p className="text-[13px] text-[#CFDCC6]">Speso a {monthName.toLowerCase()}</p>
            <p className="font-display text-4xl font-extrabold text-honey">{formatEuro(data.month_total)}</p>
            <p className="mt-1 text-[13px] text-[#CFDCC6]">
              {diff === null
                ? 'Conta gli scontrini e i prodotti con il prezzo.'
                : diff === 0
                ? 'Come il mese scorso.'
                : `${diff > 0 ? '+' : ''}${diff}% rispetto al mese scorso (${formatEuroShort(data.prev_month_total)}), finora.`}
            </p>
          </div>

          <div className="rounded-3xl bg-peach p-4">
            <p className="text-[13px] font-bold text-[#8E3418]">Cibo buttato a {monthName.toLowerCase()}</p>
            <p className="font-display text-3xl font-extrabold text-[#8E3418]">{formatEuro(data.wasted_value)}</p>
            <p className="mt-1 text-[13px] leading-snug text-[#6E2A14]">
              {data.wasted_count === 0
                ? 'Niente nel bidone questo mese. Bravissimi!'
                : data.wasted_unpriced > 0
                ? `${data.wasted_count === 1 ? '1 prodotto buttato' : `${data.wasted_count} prodotti buttati`}; ${
                    data.wasted_unpriced === 1 ? '1 non aveva il prezzo e non è contato' : `${data.wasted_unpriced} non avevano il prezzo e non sono contati`
                  }.`
                : `${data.wasted_count === 1 ? '1 prodotto buttato' : `${data.wasted_count} prodotti buttati`}.`}
            </p>
          </div>

          <section className="rounded-3xl bg-white p-4">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">Ultimi 6 mesi</h4>
            <div className="flex h-36 items-end gap-2" role="img" aria-label="Spesa degli ultimi 6 mesi">
              {data.months.map((m, i) => {
                const current = i === data.months.length - 1;
                return (
                  <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-[10px] font-semibold text-muted">{m.total > 0 ? formatEuroShort(Math.round(m.total / 100) * 100) : ''}</span>
                    <div
                      className={`w-full max-w-[36px] rounded-t-lg ${current ? 'bg-emerald-600' : 'bg-[#C9D6BF]'}`}
                      style={{ height: `${m.total > 0 ? Math.max(4, (m.total / max) * 100) : 2}%` }}
                    />
                    <span className={`text-[11px] ${current ? 'font-bold text-ink' : 'text-muted'}`}>{monthShort(m.month)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {data.by_category.length > 0 && (
            <section className="rounded-3xl bg-white p-4">
              <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">Per reparto, questo mese</h4>
              <div className="flex flex-col gap-2.5">
                {data.by_category.map((c) => (
                  <div key={c.category}>
                    <div className="mb-1 flex justify-between text-[13px]">
                      <span className="font-semibold text-ink">{c.category}</span>
                      <span className="text-muted">{formatEuro(c.total)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-stone">
                      <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${Math.max(3, (c.total / catMax) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">Solo i prodotti con il prezzo: sconti e buste non sono divisi per reparto.</p>
            </section>
          )}

          {data.top_wasted.length > 0 && (
            <section className="rounded-3xl bg-white p-4">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">Cosa butti di più (3 mesi)</h4>
              {data.top_wasted.map((w) => (
                <div key={w.name} className="flex items-center justify-between border-b border-[#F1EBDD] py-2 text-sm last:border-b-0">
                  <span className="font-semibold text-ink">
                    {w.name} <span className="font-normal text-muted">· {w.n === 1 ? '1 volta' : `${w.n} volte`}</span>
                  </span>
                  <span className="font-bold text-[#8E3418]">{formatEuro(w.total)}</span>
                </div>
              ))}
            </section>
          )}

          {data.receipts.length > 0 && (
            <section className="flex flex-col gap-2">
              <h4 className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">Ultime spese</h4>
              {data.receipts.map((r) => (
                <div key={r.id} className="rounded-2xl bg-white">
                  <button
                    type="button"
                    onClick={() => toggleReceipt(r.id)}
                    aria-expanded={openReceipt === r.id}
                    className="flex w-full items-center gap-3 p-3 text-left"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint text-forest">
                      {r.source === 'voice' ? <Mic size={18} /> : <Receipt size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-ink">{r.store || (r.source === 'voice' ? 'Spesa a voce' : 'Spesa')}</span>
                      <span className="block text-xs text-muted">
                        {dateIt(r.date)} · {r.items === 1 ? '1 prodotto' : `${r.items} prodotti`}
                      </span>
                    </span>
                    <span className="font-bold text-ink">{formatEuro(r.total)}</span>
                    <ChevronDown size={18} className={`shrink-0 text-muted transition ${openReceipt === r.id ? 'rotate-180' : ''}`} />
                  </button>
                  {openReceipt === r.id && (
                    <div className="border-t border-[#F1EBDD] px-3 pb-3 pt-2">
                      {!lines[r.id] ? (
                        <Loader2 size={18} className="mx-auto my-2 animate-spin text-muted" />
                      ) : (
                        lines[r.id].map((l, i) => (
                          <div key={i} className="flex justify-between py-1 text-[13px]">
                            <span className="truncate pr-3 text-ink">{l.name}</span>
                            <span className="shrink-0 text-muted">{formatEuro(l.price_cents)}</span>
                          </div>
                        ))
                      )}
                      {confirmDelete === r.id ? (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => remove(r.id)}
                            className="h-10 flex-1 rounded-xl bg-[#8E3418] text-xs font-bold text-white"
                          >
                            Sì, elimina la spesa
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(null)} className="h-10 rounded-xl bg-ground px-3 text-xs font-bold text-ink">
                            Annulla
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(r.id)}
                          className="mt-2 flex h-9 items-center gap-1.5 text-xs font-bold text-[#8E3418]"
                        >
                          <Trash2 size={14} /> Elimina questa spesa (i prodotti restano in dispensa)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
};
