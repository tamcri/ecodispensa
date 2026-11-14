import React, { useMemo, useRef, useState } from 'react';
import { PantryItem, Category } from '../types';
import { daysUntil, expiryLabel, expiryTone, EXPIRY_TONE_CLASS, getCategoryTheme } from '../constants';
import { Archive, CalendarClock, Camera, Check, Lightbulb, Plus, ScanText, Search, Trash2 } from 'lucide-react';
import { identifyItemFromImage, lookupBarcode, readExpiryFromImage } from '../services/api';
import { AnalyzingOverlay, CameraCapture, Monogram, QuantityInput, ScreenHeader, Sheet } from './ui';
import { findFoodGuide, guideSummary, suggestedExpiry } from '../foodGuide';
import { Outcome } from '../services/household';

interface PantryViewProps {
  items: PantryItem[];
  onAdd: (item: Omit<PantryItem, 'id' | 'addedAt'>) => void;
  onUpdate: (id: string, updates: Partial<PantryItem>) => void;
  onRemove: (id: string, outcome?: Outcome | null) => void;
}

type FormState = {
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  expiryDate: string;
  barcode?: string | null;
  longLife: boolean;
};

const emptyForm = (): FormState => ({
  name: '',
  quantity: 1,
  unit: 'pz',
  category: Category.FRUIT_VEG,
  expiryDate: '',
  barcode: null,
  longLife: false,
});

const UNITS = ['pz', 'kg', 'g', 'l'];

const fieldClass =
  'h-12 w-full rounded-2xl border-0 bg-white px-4 text-[15px] text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-emerald-500';
const labelClass = 'mb-1.5 block text-xs font-bold text-muted';

export const PantryView: React.FC<PantryViewProps> = ({ items, onAdd, onUpdate, onRemove }) => {
  const [filterCategory, setFilterCategory] = useState<Category | 'ALL'>('ALL');
  const [query, setQuery] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  // Campi toccati a mano: non li sovrascrivo con i suggerimenti
  const [touched, setTouched] = useState<{ category: boolean; expiry: boolean }>({ category: false, expiry: false });
  const [addedCount, setAddedCount] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [showCamera, setShowCamera] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Salvataggio senza scadenza: chiedo conferma una volta (null = nessuna domanda aperta)
  const [missingDateAsk, setMissingDateAsk] = useState<{ keepOpen: boolean } | null>(null);
  // Fotocamera per leggere la data stampata: per il nuovo prodotto o per quello in modifica
  const [dateCameraFor, setDateCameraFor] = useState<'add' | 'edit' | null>(null);
  const [dateNotice, setDateNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);

  const guide = useMemo(() => findFoodGuide(form.name), [form.name]);
  const expiryIsEstimate =
    !!form.expiryDate && !touched.expiry && form.expiryDate === suggestedExpiry(form.name, form.category);

  /** Aggiorna il nome e propone categoria e scadenza se l'utente non le ha già scelte. */
  const setName = (name: string) => {
    const g = findFoodGuide(name);
    setForm((prev) => {
      const category = !touched.category && g ? g.category : prev.category;
      return {
        ...prev,
        name,
        category,
        expiryDate: !touched.expiry && !prev.longLife && !prev.barcode ? suggestedExpiry(name, category) ?? '' : prev.expiryDate,
      };
    });
  };

  const openAdd = () => {
    setForm(emptyForm());
    setTouched({ category: false, expiry: false });
    setNotice(null);
    setDateNotice(null);
    setMissingDateAsk(null);
    setAddedCount(0);
    setAddOpen(true);
  };

  /**
   * Salva il prodotto. Se manca la scadenza (e non è a lunga conservazione) chiedo prima:
   * senza data l'app non può avvisare. `force` = l'utente ha scelto "Salva senza data".
   */
  const save = (keepOpen: boolean, force = false, override?: Partial<FormState>) => {
    const f = { ...form, ...override };
    if (!f.name.trim()) return;
    if (!f.expiryDate && !f.longLife && !force) {
      setMissingDateAsk({ keepOpen });
      return;
    }
    setMissingDateAsk(null);
    onAdd({
      name: f.name.trim(),
      quantity: f.quantity,
      unit: f.unit,
      category: f.category,
      expiryDate: f.longLife ? undefined : f.expiryDate || undefined,
      barcode: f.barcode ?? null,
      longLife: f.longLife,
    });
    if (keepOpen) {
      setAddedCount((n) => n + 1);
      setForm(emptyForm());
      setTouched({ category: false, expiry: false });
      setNotice(null);
      setDateNotice(null);
      window.setTimeout(() => nameRef.current?.focus(), 50);
    } else {
      setAddOpen(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save(false);
  };

  const openEdit = (item: PantryItem) => {
    setEditing(item);
    setConfirmRemove(false);
    setEditForm({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      expiryDate: item.expiryDate ?? '',
      longLife: !!item.longLife,
    });
    setDateNotice(null);
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    onUpdate(editing.id, {
      quantity: editForm.quantity,
      unit: editForm.unit,
      category: editForm.category,
      // null (non undefined) così una scadenza cancellata viene salvata davvero
      expiryDate: (editForm.longLife ? null : editForm.expiryDate || null) as any,
      longLife: editForm.longLife,
    });
    setEditing(null);
  };

  const finishEditing = (outcome: Outcome | null) => {
    if (!editing) return;
    onRemove(editing.id, outcome);
    setEditing(null);
  };

  // --- Fotocamera: codice a barre o foto ---
  const prefill = (next: Partial<FormState>, message: string | null) => {
    const base = emptyForm();
    const name = next.name ?? '';
    const g = findFoodGuide(name);
    setForm({
      ...base,
      ...next,
      name,
      category: (next.category as Category) || g?.category || base.category,
      // i prodotti confezionati hanno la data stampata: niente stima
      expiryDate:
        next.expiryDate ||
        (next.barcode ? '' : suggestedExpiry(name, (next.category as Category) || g?.category || base.category)) ||
        '',
    });
    setTouched({ category: !!next.category, expiry: !!next.expiryDate });
    setNotice(message);
    setDateNotice(null);
    setMissingDateAsk(null);
    setAddOpen(true);
  };

  const handleBarcode = async (code: string) => {
    setShowCamera(false);
    setIsAnalyzing('Cerco il prodotto…');
    try {
      // Già in dispensa con lo stesso codice? Riuso nome e categoria e lo segnalo
      const same = items.find((i) => i.barcode === code);
      const already = same
        ? `Ne hai già ${same.quantity} ${same.unit}${same.expiryDate ? `, ${expiryLabel(daysUntil(same.expiryDate)).toLowerCase()}` : ''}. Salvando ne aggiungi un'altra confezione. `
        : '';
      if (same) {
        prefill(
          { name: same.name, quantity: same.quantity, unit: same.unit, category: same.category, barcode: code },
          `${already}Inserisci la data di scadenza, oppure fotografala con il tasto qui sotto.`
        );
        return;
      }
      const p = await lookupBarcode(code);
      if (p) {
        prefill(
          { name: p.name, quantity: p.quantity, unit: p.unit, category: p.category as Category, barcode: code },
          'Inserisci la data di scadenza, oppure fotografala con il tasto qui sotto.'
        );
      } else {
        prefill(
          { barcode: code },
          `Non trovo questo codice nell'archivio prodotti: scrivi il nome, la prossima volta lo riconosco io.`
        );
      }
    } finally {
      setIsAnalyzing(null);
    }
  };

  const handleCapture = async (dataUrl: string) => {
    setShowCamera(false);
    setIsAnalyzing('Riconosco il prodotto…');
    try {
      const result = await identifyItemFromImage(dataUrl);
      if (result?.name) {
        prefill(
          {
            name: result.name,
            category: result.category as Category,
            quantity: result.quantity || 1,
            unit: result.unit || 'pz',
            // per i freschi preferisco la stima della guida, più prudente
            expiryDate: findFoodGuide(result.name)?.fresh
              ? suggestedExpiry(result.name) ?? ''
              : result.expiryDate || suggestedExpiry(result.name, result.category as Category) || '',
          },
          null
        );
      } else {
        prefill({}, 'Non ho riconosciuto il prodotto: inseriscilo a mano.');
      }
    } finally {
      setIsAnalyzing(null);
    }
  };

  /** Legge la data stampata dalla foto e la mette nel campo scadenza. */
  const handleDateCapture = async (dataUrl: string) => {
    const target = dateCameraFor;
    setDateCameraFor(null);
    if (!target) return;
    if (target === 'add') setAddOpen(true);
    setIsAnalyzing('Leggo la data…');
    try {
      const read = await readExpiryFromImage(dataUrl);
      if (!read) {
        setDateNotice({ ok: false, text: 'Non riesco a leggere la data: riprova più vicino, con più luce, oppure scrivila a mano.' });
        return;
      }
      const kindText =
        read.kind === 'preferibilmente'
          ? ' È un "preferibilmente entro": dopo quella data il prodotto spesso è ancora buono, controlla aspetto e odore.'
          : '';
      const shown = new Date(read.expiryDate + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
      setDateNotice({ ok: true, text: `Ho letto: ${shown}. Controlla che sia giusta.${kindText}` });
      if (target === 'add') {
        setTouched((t) => ({ ...t, expiry: true }));
        setForm((f) => ({ ...f, expiryDate: read.expiryDate, longLife: false }));
        setMissingDateAsk(null);
      } else {
        setEditForm((f) => ({ ...f, expiryDate: read.expiryDate, longLife: false }));
      }
    } finally {
      setIsAnalyzing(null);
    }
  };

  const openDateCamera = (target: 'add' | 'edit') => {
    setDateNotice(null);
    if (target === 'add') setAddOpen(false);
    setDateCameraFor(target);
  };

  /** Prodotti senza scadenza e non segnati come lunga conservazione: l'app non può avvisare. */
  const missingDateCount = items.filter((i) => !i.expiryDate && !i.longLife).length;

  const enriched = useMemo(
    () =>
      items
        .map((item) => ({ item, days: daysUntil(item.expiryDate) }))
        .sort((a, b) => {
          if (a.days === null && b.days === null) return 0;
          if (a.days === null) return 1;
          if (b.days === null) return -1;
          return a.days - b.days;
        }),
    [items]
  );

  const urgentCount = enriched.filter((x) => x.days !== null && x.days <= 3).length;

  const presentCategories = useMemo(
    () => (Object.values(Category) as Category[]).filter((c) => items.some((i) => i.category === c)),
    [items]
  );

  const q = query.trim().toLowerCase();
  const showOnlyMissing = onlyMissing && missingDateCount > 0;
  const visible = enriched.filter(
    ({ item }) =>
      (filterCategory === 'ALL' || item.category === filterCategory) &&
      (!q || item.name.toLowerCase().includes(q)) &&
      (!showOnlyMissing || (!item.expiryDate && !item.longLife))
  );

  const subtitle =
    items.length === 0
      ? 'Ancora vuota'
      : `${items.length} ${items.length === 1 ? 'prodotto' : 'prodotti'}${
          urgentCount ? ` · ${urgentCount} da usare presto` : ''
        }`;

  const editGuide = editing ? findFoodGuide(editing.name) : null;

  const categoryPicker = (state: FormState, onPick: (c: Category) => void) => (
    <div>
      <span className={labelClass}>Categoria</span>
      <div className="flex flex-wrap gap-2">
        {(Object.values(Category) as Category[]).map((c) => {
          const active = state.category === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onPick(c)}
              className={`h-10 rounded-full px-3.5 text-[13px] font-bold transition-colors ${
                active ? 'bg-ink text-white' : getCategoryTheme(c).chip
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );

  const qtyFields = (state: FormState, set: (s: FormState) => void, idPrefix: string) => (
    <QuantityInput
      id={`${idPrefix}-qty`}
      value={state.quantity}
      unit={state.unit}
      onChange={(q) => set({ ...state, quantity: q })}
      onUnitChange={(u) => set({ ...state, unit: u })}
    />
  );

  const readDateButton = (target: 'add' | 'edit') => (
    <button
      type="button"
      onClick={() => openDateCamera(target)}
      aria-label="Fotografa la data di scadenza"
      className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-ink px-3.5 text-[13px] font-bold text-white"
    >
      <ScanText size={18} className="text-lemon" /> Leggi
    </button>
  );

  const longLifeBox = (onUndo: () => void) => (
    <div className="flex h-12 items-center justify-between rounded-2xl bg-white px-4 ring-1 ring-black/5">
      <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Archive size={18} className="text-muted" /> Lunga conservazione
      </span>
      <button type="button" onClick={onUndo} className="text-[13px] font-bold text-emerald-700">
        Metti una data
      </button>
    </div>
  );

  const noExpiryLink = (onPick: () => void) => (
    <button type="button" onClick={onPick} className="mt-2 text-[13px] font-semibold text-muted underline underline-offset-2">
      Non ha una scadenza (sale, olio, spezie…)
    </button>
  );

  const dateNoticeBox = dateNotice ? (
    <p
      className={`mt-2 rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug ${
        dateNotice.ok ? 'bg-mint text-[#1E5A35]' : 'bg-peach text-[#8A3B0C]'
      }`}
    >
      {dateNotice.text}
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader
        title="Dispensa"
        subtitle={subtitle}
        right={
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            className="flex h-12 items-center gap-2 rounded-2xl bg-ink pl-3.5 pr-4 text-sm font-bold text-white"
          >
            <Camera size={20} className="text-lemon" />
            Scansiona
          </button>
        }
      />

      {items.length > 0 && (
        <>
          <label className="flex h-12 items-center gap-2.5 rounded-2xl bg-white px-4 text-muted">
            <Search size={20} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca in dispensa"
              aria-label="Cerca in dispensa"
              className="flex-1 bg-transparent text-[15px] text-ink outline-none"
            />
          </label>

          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 no-scrollbar">
            <button
              type="button"
              onClick={() => setFilterCategory('ALL')}
              className={`h-10 shrink-0 rounded-full px-4 text-[13px] font-bold ${
                filterCategory === 'ALL' ? 'bg-ink text-white' : 'bg-white text-ink'
              }`}
            >
              Tutti
            </button>
            {presentCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFilterCategory(c)}
                className={`h-10 shrink-0 rounded-full px-4 text-[13px] font-bold ${
                  filterCategory === c ? 'bg-ink text-white' : getCategoryTheme(c).chip
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {missingDateCount > 0 && (
            <button
              type="button"
              onClick={() => setOnlyMissing((v) => !v)}
              className="flex items-center gap-3 rounded-2xl bg-peach px-4 py-3 text-left"
            >
              <CalendarClock size={22} className="shrink-0 text-[#9A3412]" />
              <span className="flex-1 text-[13px] leading-snug text-[#8A3B0C]">
                <span className="font-bold">
                  {missingDateCount === 1 ? '1 prodotto senza scadenza' : `${missingDateCount} prodotti senza scadenza`}
                </span>
                : senza data non posso avvisarti. {showOnlyMissing ? 'Tocca per vedere tutto.' : 'Tocca per vederli e aggiungerla.'}
              </span>
            </button>
          )}
        </>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-4xl bg-white px-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mint text-emerald-700">
            <Plus size={28} />
          </span>
          <p className="font-display text-xl font-bold text-ink">La dispensa è vuota</p>
          <p className="text-sm text-muted">
            Scansiona il codice a barre delle confezioni, fotografa frutta e verdura o scrivi il nome: al resto penso io.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Nessun prodotto trovato.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {visible.map(({ item, days }) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openEdit(item)}
              className="flex min-w-0 flex-col gap-2.5 rounded-[22px] bg-white p-3.5 text-left transition-transform active:scale-[0.98]"
            >
              <span className="flex items-center justify-between gap-2">
                <Monogram name={item.name} category={item.category} />
                <span className="truncate text-[13px] font-bold text-[#3D4840]">
                  {item.quantity} {item.unit}
                </span>
              </span>
              <span className="line-clamp-2 text-base font-bold leading-tight text-ink">{item.name}</span>
              {item.longLife ? (
                <span className={`self-start rounded-full px-2.5 py-1 text-xs font-bold ${EXPIRY_TONE_CLASS.none}`}>
                  Lunga conservazione
                </span>
              ) : days === null ? (
                <span className="self-start rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#9A3412] ring-1 ring-[#F3C9A8]">
                  Manca la scadenza
                </span>
              ) : (
                <span className={`self-start rounded-full px-2.5 py-1 text-xs font-bold ${EXPIRY_TONE_CLASS[expiryTone(days)]}`}>
                  {expiryLabel(days)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={openAdd}
        className="fixed z-40 flex h-[54px] items-center gap-2 rounded-full bg-emerald-600 pl-4 pr-5 text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(30,138,78,0.35)] active:scale-95"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 100px)', right: 'max(1.25rem, calc((100vw - 28rem) / 2 + 1.25rem))' }}
      >
        <Plus size={22} strokeWidth={2.4} />
        Aggiungi
      </button>

      {/* ---------- Nuovo prodotto ---------- */}
      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={addedCount > 0 ? `Nuovo prodotto · ${addedCount} aggiunti` : 'Nuovo prodotto'}
        footer={
          missingDateAsk ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-center text-sm font-semibold text-ink">
                Manca la scadenza: senza data non posso avvisarti prima che vada a male.
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMissingDateAsk(null);
                    openDateCamera('add');
                  }}
                  className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-bold text-white"
                >
                  <ScanText size={18} className="text-lemon" /> Fotografa la data
                </button>
                <button
                  type="button"
                  onClick={() => save(missingDateAsk.keepOpen, false, { longLife: true, expiryDate: '' })}
                  className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-bold text-ink ring-1 ring-black/10"
                >
                  <Archive size={18} /> Non scade
                </button>
              </div>
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => setMissingDateAsk(null)}
                  className="h-10 text-[13px] font-bold text-emerald-700"
                >
                  La scrivo io
                </button>
                <button
                  type="button"
                  onClick={() => save(missingDateAsk.keepOpen, true)}
                  className="h-10 text-[13px] font-semibold text-muted underline underline-offset-2"
                >
                  Salva senza data
                </button>
              </div>
            </div>
          ) : (
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => save(true)}
              disabled={!form.name.trim()}
              className="h-[52px] flex-1 rounded-2xl bg-white text-[15px] font-bold text-ink ring-1 ring-black/10 disabled:opacity-40"
            >
              Salva e aggiungi altro
            </button>
            <button
              type="submit"
              form="pantry-add-form"
              disabled={!form.name.trim()}
              className="h-[52px] flex-1 rounded-2xl bg-emerald-600 text-[15px] font-bold text-white disabled:opacity-40"
            >
              Salva
            </button>
          </div>
          )
        }
      >
        <form id="pantry-add-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          {notice && <p className="rounded-2xl bg-peach px-4 py-3 text-sm font-semibold text-[#8A3B0C]">{notice}</p>}

          <div>
            <label className={labelClass} htmlFor="pantry-name">Cosa hai comprato?</label>
            <div className="flex gap-2">
              <input
                ref={nameRef}
                id="pantry-name"
                type="text"
                placeholder="Es. zucchine, latte, pane…"
                className={`${fieldClass} min-w-0 flex-1`}
                value={form.name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus={!form.name}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => {
                  setAddOpen(false);
                  setShowCamera(true);
                }}
                aria-label="Scansiona con la fotocamera"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-lemon"
              >
                <Camera size={20} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {qtyFields(form, setForm, 'pantry')}
            <div>
              <label className={labelClass} htmlFor="pantry-exp">
                Scadenza {expiryIsEstimate && <span className="font-semibold text-emerald-700">· stimata</span>}
              </label>
              {form.longLife ? (
                longLifeBox(() => setForm({ ...form, longLife: false }))
              ) : (
                <div className="flex gap-2">
                  <input
                    id="pantry-exp"
                    type="date"
                    className={`${fieldClass} min-w-0 flex-1 px-3 ${expiryIsEstimate ? 'ring-emerald-300' : ''}`}
                    value={form.expiryDate}
                    onChange={(e) => {
                      setTouched((t) => ({ ...t, expiry: true }));
                      setForm({ ...form, expiryDate: e.target.value });
                      if (e.target.value) setMissingDateAsk(null);
                    }}
                  />
                  {readDateButton('add')}
                </div>
              )}
              {!form.longLife &&
                noExpiryLink(() => {
                  setForm({ ...form, longLife: true, expiryDate: '' });
                  setMissingDateAsk(null);
                  setDateNotice(null);
                })}
              {dateNoticeBox}
            </div>
          </div>

          {guide && (
            <div className="flex gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-black/5">
              <Lightbulb size={18} className="mt-0.5 shrink-0 text-[#C9930A]" />
              <p className="text-[13px] leading-snug text-[#3D4840]">
                {guide.fresh ? (
                  <>
                    <span className="font-bold text-ink">Di solito dura {guideSummary(guide)}.</span>{' '}
                  </>
                ) : (
                  <span className="font-bold text-ink">Controlla la data sulla confezione. </span>
                )}
                {guide.tip}
              </p>
            </div>
          )}

          {categoryPicker(form, (c) => {
            setTouched((t) => ({ ...t, category: true }));
            setForm({
              ...form,
              category: c,
              // se la data era solo una stima, la ricalcolo per la nuova categoria
              expiryDate:
                !touched.expiry && !form.longLife && !form.barcode ? suggestedExpiry(form.name, c) ?? '' : form.expiryDate,
            });
          })}
        </form>
      </Sheet>

      {/* ---------- Prodotto esistente ---------- */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={
          editing ? (
            <span className="flex items-center gap-3">
              <Monogram name={editing.name} category={editing.category} size="sm" />
              <span className="truncate">{editing.name}</span>
            </span>
          ) : null
        }
        footer={
          confirmRemove ? (
            <div className="flex flex-col gap-2">
              <p className="text-center text-sm font-semibold text-muted">Com'è finito questo prodotto?</p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => finishEditing('consumed')}
                  className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-mint text-[15px] font-bold text-[#155A34]"
                >
                  <Check size={18} /> L'ho usato
                </button>
                <button
                  type="button"
                  onClick={() => finishEditing('wasted')}
                  className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#FBE0E3] text-[15px] font-bold text-[#9B2335]"
                >
                  <Trash2 size={18} /> L'ho buttato
                </button>
              </div>
              <button
                type="button"
                onClick={() => finishEditing(null)}
                className="h-10 text-[13px] font-semibold text-muted underline underline-offset-2"
              >
                Era un errore, eliminalo e basta
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="h-[52px] rounded-2xl bg-white px-4 text-[15px] font-bold text-ink ring-1 ring-black/10"
              >
                Finito
              </button>
              <button
                type="submit"
                form="pantry-edit-form"
                className="h-[52px] flex-1 rounded-2xl bg-emerald-600 text-[15px] font-bold text-white"
              >
                Salva modifiche
              </button>
            </div>
          )
        }
      >
        <form id="pantry-edit-form" onSubmit={saveEdit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            {qtyFields(editForm, setEditForm, 'edit')}
            <div>
              <label className={labelClass} htmlFor="edit-exp">Scadenza</label>
              {editForm.longLife ? (
                longLifeBox(() => setEditForm({ ...editForm, longLife: false }))
              ) : (
                <div className="flex gap-2">
                  <input
                    id="edit-exp"
                    type="date"
                    className={`${fieldClass} min-w-0 flex-1 px-3`}
                    value={editForm.expiryDate}
                    onChange={(e) => setEditForm({ ...editForm, expiryDate: e.target.value })}
                  />
                  {readDateButton('edit')}
                </div>
              )}
              {!editForm.longLife &&
                noExpiryLink(() => {
                  setEditForm({ ...editForm, longLife: true, expiryDate: '' });
                  setDateNotice(null);
                })}
              {dateNoticeBox}
            </div>
          </div>
          {editGuide && (
            <div className="flex gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-black/5">
              <Lightbulb size={18} className="mt-0.5 shrink-0 text-[#C9930A]" />
              <p className="text-[13px] leading-snug text-[#3D4840]">{editGuide.tip}</p>
            </div>
          )}
          {categoryPicker(editForm, (c) => setEditForm({ ...editForm, category: c }))}
        </form>
      </Sheet>

      <CameraCapture
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCapture}
        onBarcode={handleBarcode}
      />
      <CameraCapture
        open={!!dateCameraFor}
        onClose={() => {
          const t = dateCameraFor;
          setDateCameraFor(null);
          if (t === 'add') setAddOpen(true);
        }}
        onCapture={handleDateCapture}
      />
      <AnalyzingOverlay open={!!isAnalyzing} label={isAnalyzing ?? ''} />
    </div>
  );
};
