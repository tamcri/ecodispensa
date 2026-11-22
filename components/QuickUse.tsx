import React, { useState } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import { PantryItem, PantryUse } from '../types';
import { readPantryUsage } from '../services/api';
import { convertQuantity, formatQty, portionOf } from '../services/quantity';
import { AnalyzingOverlay, Monogram, Sheet } from './ui';
import { VoiceSheet } from './BulkAdd';

/** Quanto è stato usato: la quantità detta a voce oppure una parte del prodotto */
type Portion = 'said' | 0.25 | 0.5 | 0.75 | 1;

type Row = {
  item: PantryItem;
  /** quantità detta a voce, già nell'unità del prodotto (null se non c'era o non è convertibile) */
  said: number | null;
  portion: Portion;
  outcome: 'consumed' | 'wasted';
};

const PORTIONS: Array<{ v: Exclude<Portion, 'said'>; label: string }> = [
  { v: 0.25, label: '¼' },
  { v: 0.5, label: 'Metà' },
  { v: 0.75, label: '¾' },
  { v: 1, label: 'Tutto' },
];

const usedOf = (r: Row) => (r.portion === 'said' ? r.said ?? 0 : portionOf(r.item, r.portion));

/** "500 g → 200 g" oppure "Finito" */
export const afterLabel = (item: PantryItem, used: number) => {
  const left = Math.max(0, item.quantity - used);
  if (left <= 0.0001) return 'Finito';
  return `${formatQty(item.quantity, item.unit)} → ${formatQty(left, item.unit)}`;
};

/**
 * "Cosa hai usato?" a voce: l'utente dice cosa ha usato, finito o buttato,
 * l'AI lo confronta con la dispensa, l'utente controlla e conferma.
 */
export const VoiceUseFlow = ({
  open,
  onClose,
  items,
  onApply,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  items: PantryItem[];
  onApply: (uses: PantryUse[]) => Promise<boolean>;
  /** Messaggio finale da mostrare all'utente */
  onDone: (notice: { ok: boolean; text: string }) => void;
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notFound, setNotFound] = useState<string[]>([]);

  const onText = async (text: string) => {
    onClose();
    setBusy('Cerco in dispensa…');
    try {
      const list = items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit }));
      const read = await readPantryUsage(text, list);
      if (read === 'DAILY_LIMIT') {
        onDone({ ok: false, text: 'Hai raggiunto il limite di oggi per la voce. Riprova domani, oppure tocca il prodotto in dispensa.' });
        return;
      }
      if (!read) {
        onDone({ ok: false, text: 'Non sono riuscito a capire. Controlla la connessione e riprova.' });
        return;
      }
      const found: Row[] = read.items
        .map((u) => {
          const item = items[u.index];
          if (!item) return null;
          const said = u.mode === 'amount' ? convertQuantity(u.quantity, u.unit, item.unit) : null;
          let portion: Portion = 1;
          if (u.mode === 'amount') portion = said !== null && said > 0 ? 'said' : 1;
          if (u.mode === 'fraction') {
            // la parte più vicina tra ¼, metà, ¾ e tutto
            portion = PORTIONS.reduce((best, p) => (Math.abs(p.v - u.fraction) < Math.abs(best - u.fraction) ? p.v : best), 1 as 0.25 | 0.5 | 0.75 | 1);
          }
          return { item, said: said !== null && said > 0 ? Math.min(said, item.quantity) : null, portion, outcome: u.outcome };
        })
        .filter((r): r is Row => !!r);
      if (found.length === 0) {
        onDone({
          ok: false,
          text: read.notFound.length
            ? `Non trovo in dispensa: ${read.notFound.join(', ')}.`
            : 'Non ho capito quali prodotti hai usato: prova per esempio "ho usato 300 grammi di pasta e due uova".',
        });
        return;
      }
      setNotFound(read.notFound);
      setRows(found);
    } finally {
      setBusy(null);
    }
  };

  const set = (i: number, next: Partial<Row>) => setRows((prev) => prev && prev.map((r, k) => (k === i ? { ...r, ...next } : r)));

  const confirm = async () => {
    if (!rows) return;
    const uses = rows.map((r) => ({ id: r.item.id, used: usedOf(r), outcome: r.outcome })).filter((u) => u.used > 0);
    setRows(null);
    setBusy('Aggiorno la dispensa…');
    try {
      const ok = await onApply(uses);
      const n = uses.length;
      onDone(
        ok
          ? { ok: true, text: `Fatto: ${n === 1 ? '1 prodotto aggiornato' : `${n} prodotti aggiornati`} in dispensa.` }
          : { ok: false, text: 'Non sono riuscito a salvare. Riprova tra poco.' }
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <VoiceSheet
        open={open}
        onClose={onClose}
        onSubmit={onText}
        title="Cosa hai usato?"
        placeholder="Es. ho usato 300 grammi di pasta e due uova, il latte è finito, ho buttato l'insalata"
        submitLabel="Aggiorna la dispensa"
      />

      <Sheet
        open={!!rows}
        onClose={() => setRows(null)}
        title="Controlla e conferma"
        footer={
          <button
            type="button"
            onClick={confirm}
            disabled={!rows?.length}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[15px] font-bold text-white disabled:opacity-40"
          >
            <Check size={18} /> Aggiorna la dispensa
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          {rows?.map((r, i) => (
            <div key={r.item.id} className="flex flex-col gap-2.5 rounded-2xl bg-white p-3 ring-1 ring-black/5">
              <div className="flex items-center gap-3">
                <Monogram name={r.item.name} category={r.item.category} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{r.item.name}</span>
                  <span className={`block text-[13px] font-semibold ${r.outcome === 'wasted' ? 'text-[#8A1F2B]' : 'text-forest'}`}>
                    {r.outcome === 'wasted' && afterLabel(r.item, usedOf(r)) === 'Finito'
                      ? 'Buttato tutto'
                      : `${r.outcome === 'wasted' ? 'Buttato in parte: ' : ''}${afterLabel(r.item, usedOf(r))}`}
                  </span>
                </span>
                <button
                  type="button"
                  aria-pressed={r.outcome === 'wasted'}
                  onClick={() => set(i, { outcome: r.outcome === 'wasted' ? 'consumed' : 'wasted' })}
                  className={`flex h-9 shrink-0 items-center gap-1 rounded-xl px-2.5 text-[12px] font-bold ${
                    r.outcome === 'wasted' ? 'bg-[#F3D3D3] text-[#8A1F2B]' : 'bg-ground text-muted'
                  }`}
                >
                  <Trash2 size={14} /> Buttato
                </button>
                <button
                  type="button"
                  aria-label={`Togli ${r.item.name}`}
                  onClick={() => setRows((prev) => prev && prev.filter((_, k) => k !== i))}
                  className="-mr-1 flex h-9 w-8 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-ground"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.said !== null && (
                  <Chip on={r.portion === 'said'} onClick={() => set(i, { portion: 'said' })}>
                    {formatQty(r.said, r.item.unit)}
                  </Chip>
                )}
                {PORTIONS.map((p) => (
                  <Chip key={p.v} on={r.portion === p.v} onClick={() => set(i, { portion: p.v })}>
                    {p.label}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
          {notFound.length > 0 && (
            <p className="rounded-2xl bg-peach px-3.5 py-2.5 text-[13px] text-[#8E3418]">Non trovo in dispensa: {notFound.join(', ')}.</p>
          )}
        </div>
      </Sheet>

      <AnalyzingOverlay open={!!busy} label={busy ?? ''} />
    </>
  );
};

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={`h-9 min-w-[44px] rounded-xl px-3 text-[13px] font-bold ${on ? 'bg-forest text-white' : 'bg-ground text-ink'}`}
  >
    {children}
  </button>
);
