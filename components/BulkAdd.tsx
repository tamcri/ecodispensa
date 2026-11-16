import React, { useEffect, useRef, useState } from 'react';
import { Archive, Check, Mic, MicOff, Sparkles } from 'lucide-react';
import { Category, PantryItem } from '../types';
import { ShoppingItemRead } from '../services/api';
import { dateInDays, findFoodGuide, suggestedExpiry } from '../foodGuide';
import { Sheet } from './ui';

/** Un prodotto trovato nello scontrino o nell'elenco, pronto da confermare */
export type BulkRow = {
  key: string;
  selected: boolean;
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  expiryDate: string;
  longLife: boolean;
};

const CATEGORIES = Object.values(Category) as string[];

/**
 * Trasforma quello che ha letto l'intelligenza artificiale in righe per la dispensa,
 * con la scadenza stimata: prima la nostra guida dei freschi, poi la durata tipica indicata.
 */
export function toBulkRows(read: ShoppingItemRead[]): BulkRow[] {
  return read.map((r, i) => {
    const g = findFoodGuide(r.name);
    const category = (CATEGORIES.includes(r.category) ? r.category : g?.category ?? Category.OTHER) as Category;
    const longLife = r.storage === 'long_life' || category === Category.HOUSEHOLD;
    let expiryDate = '';
    if (!longLife) {
      if (g?.fresh) expiryDate = dateInDays(g.days);
      else if (r.storage === 'fresh') expiryDate = suggestedExpiry(r.name, category) ?? dateInDays(r.shelfDays > 0 ? r.shelfDays : 5);
      else expiryDate = dateInDays(r.shelfDays > 0 ? r.shelfDays : g?.days ?? 7);
    }
    return {
      key: `${i}-${r.name}`,
      selected: true,
      name: r.name,
      quantity: r.quantity > 0 ? r.quantity : 1,
      unit: r.unit || 'pz',
      category,
      expiryDate,
      longLife,
    };
  });
}

const qtyLabel = (q: number, unit: string) => {
  const n = Number.isInteger(q) ? String(q) : String(q).replace('.', ',');
  return `${n} ${unit}`;
};

/** Elenco da confermare: si tolgono i prodotti sbagliati, si correggono nomi e date, poi si aggiunge tutto. */
export const BulkReviewSheet = ({
  rows,
  source,
  onChange,
  onClose,
  onConfirm,
}: {
  rows: BulkRow[] | null;
  source: 'receipt' | 'voice';
  onChange: (rows: BulkRow[]) => void;
  onClose: () => void;
  onConfirm: (items: Array<Omit<PantryItem, 'id' | 'addedAt'>>) => void;
}) => {
  const list = rows ?? [];
  const selected = list.filter((r) => r.selected && r.name.trim());
  const update = (key: string, patch: Partial<BulkRow>) => onChange(list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const confirm = () =>
    onConfirm(
      selected.map((r) => ({
        name: r.name.trim(),
        quantity: r.quantity,
        unit: r.unit,
        category: r.category,
        expiryDate: r.longLife ? undefined : r.expiryDate || undefined,
        barcode: null,
        longLife: r.longLife,
      }))
    );

  return (
    <Sheet
      open={rows !== null}
      onClose={onClose}
      title={list.length === 1 ? 'Ho trovato 1 prodotto' : `Ho trovato ${list.length} prodotti`}
      footer={
        <button
          type="button"
          onClick={confirm}
          disabled={selected.length === 0}
          className="h-[52px] w-full rounded-2xl bg-emerald-600 text-[15px] font-bold text-white disabled:opacity-40"
        >
          {selected.length === 1 ? 'Aggiungi 1 prodotto in dispensa' : `Aggiungi ${selected.length} prodotti in dispensa`}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="rounded-2xl bg-mint px-3.5 py-2.5 text-[13px] leading-snug text-forest">
          {source === 'receipt' ? 'Controlla i nomi letti dallo scontrino. ' : ''}
          Le scadenze sono stimate: correggile qui o più tardi dalla dispensa. Per i confezionati vale la data stampata.
          Togli la spunta a quello che non vuoi aggiungere.
        </p>

        {list.map((r) => (
          <div
            key={r.key}
            className={`flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-black/5 ${r.selected ? '' : 'opacity-50'}`}
          >
            <button
              type="button"
              onClick={() => update(r.key, { selected: !r.selected })}
              aria-pressed={r.selected}
              aria-label={r.selected ? `Togli ${r.name}` : `Aggiungi ${r.name}`}
              className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                r.selected ? 'bg-emerald-600 text-white' : 'bg-stone text-transparent'
              }`}
            >
              <Check size={16} strokeWidth={3} />
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <label className="sr-only" htmlFor={`bulk-name-${r.key}`}>
                Nome del prodotto
              </label>
              <input
                id={`bulk-name-${r.key}`}
                type="text"
                value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value })}
                className="h-10 w-full rounded-xl bg-ground px-3 text-[15px] font-semibold text-ink outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                <span>
                  {qtyLabel(r.quantity, r.unit)} · {r.category}
                </span>
                <span className="ml-auto">
                  {r.longLife ? (
                    <button
                      type="button"
                      onClick={() => update(r.key, { longLife: false, expiryDate: dateInDays(7) })}
                      className="flex h-9 items-center gap-1.5 rounded-xl bg-ground px-3 font-semibold text-ink"
                    >
                      <Archive size={15} className="text-muted" /> Lunga conservazione
                    </button>
                  ) : (
                    <>
                      <label className="sr-only" htmlFor={`bulk-exp-${r.key}`}>
                        Scadenza di {r.name}
                      </label>
                      <input
                        id={`bulk-exp-${r.key}`}
                        type="date"
                        value={r.expiryDate}
                        onChange={(e) => update(r.key, { expiryDate: e.target.value })}
                        className="h-9 rounded-xl bg-ground px-2.5 text-[13px] text-ink outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
};

/** Riconoscimento vocale del browser (Chrome, Safari): null se non c'è */
const getRecognition = (): any => {
  const W = window as any;
  const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!Ctor) return null;
  try {
    const rec = new Ctor();
    rec.lang = 'it-IT';
    rec.continuous = true;
    rec.interimResults = true;
    return rec;
  } catch {
    return null;
  }
};

/** Dettare o scrivere la spesa: "ho comprato latte, sei uova, un chilo di mele e il pane" */
export const VoiceSheet = ({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) => {
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [canListen, setCanListen] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    setText('');
    setInterim('');
    setMicError(null);
    const W = window as any;
    setCanListen(!!(W.SpeechRecognition || W.webkitSpeechRecognition));
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        /* già fermo */
      }
      recRef.current = null;
      setListening(false);
    };
  }, [open]);

  const stop = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* già fermo */
    }
    setListening(false);
    setInterim('');
  };

  const start = () => {
    const rec = getRecognition();
    if (!rec) {
      setCanListen(false);
      return;
    }
    setMicError(null);
    rec.onresult = (e: any) => {
      let finalText = '';
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript ?? '';
        if (e.results[i].isFinal) finalText += t;
        else partial += t;
      }
      if (finalText) setText((prev) => (prev ? `${prev.trim()}, ${finalText.trim()}` : finalText.trim()));
      setInterim(partial);
    };
    rec.onerror = (e: any) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        setMicError('Il microfono è bloccato: permettilo nelle impostazioni del browser, oppure usa il microfono della tastiera.');
      } else if (e?.error !== 'no-speech' && e?.error !== 'aborted') {
        setMicError('Non ti ho sentito bene: riprova, oppure scrivi qui sotto.');
      }
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
    };
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setMicError('Non riesco ad avviare il microfono: scrivi qui sotto o usa il microfono della tastiera.');
    }
  };

  const ready = text.trim().length >= 2;

  return (
    <Sheet
      open={open}
      onClose={() => {
        stop();
        onClose();
      }}
      title="Dimmi cosa hai comprato"
      footer={
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            stop();
            onSubmit(text.trim());
          }}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[15px] font-bold text-white disabled:opacity-40"
        >
          <Sparkles size={18} /> Trova i prodotti
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {canListen && (
          <div className="flex flex-col items-center gap-2 py-2">
            <button
              type="button"
              onClick={listening ? stop : start}
              aria-label={listening ? 'Ferma il microfono' : 'Parla'}
              className={`flex h-20 w-20 items-center justify-center rounded-full text-white ${
                listening ? 'animate-pulse bg-tangerine' : 'bg-forest'
              }`}
            >
              {listening ? <MicOff size={32} /> : <Mic size={32} />}
            </button>
            <p className="text-center text-[13px] text-muted">
              {listening ? 'Ti ascolto… tocca di nuovo quando hai finito' : 'Tocca e di\' tutta la spesa, anche di seguito'}
            </p>
          </div>
        )}

        <div>
          <label htmlFor="voice-text" className="mb-1.5 block text-xs font-bold text-muted">
            {canListen ? 'Oppure scrivila' : 'Scrivi la spesa (o usa il microfono della tastiera per dettarla)'}
          </label>
          <textarea
            id="voice-text"
            rows={5}
            value={interim ? `${text}${text ? ', ' : ''}${interim}` : text}
            onChange={(e) => {
              if (!listening) setText(e.target.value);
            }}
            readOnly={listening}
            placeholder="Es. latte, sei uova, un chilo di mele, il pane e due vasetti di yogurt"
            className="w-full rounded-2xl bg-white p-4 text-[15px] leading-relaxed text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {micError && <p className="rounded-2xl bg-peach px-3.5 py-2.5 text-[13px] text-[#8E3418]">{micError}</p>}
      </div>
    </Sheet>
  );
};
