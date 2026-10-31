import React, { useMemo, useState } from 'react';
import { PantryItem, Category } from '../types';
import { daysUntil, expiryLabel, expiryTone, EXPIRY_TONE_CLASS, getCategoryTheme } from '../constants';
import { Camera, Plus, Search, Trash2 } from 'lucide-react';
import { identifyItemFromImage } from '../services/api';
import { AnalyzingOverlay, CameraCapture, Monogram, ScreenHeader, Sheet } from './ui';

interface PantryViewProps {
  items: PantryItem[];
  onAdd: (item: Omit<PantryItem, 'id' | 'addedAt'>) => void;
  onUpdate: (id: string, updates: Partial<PantryItem>) => void;
  onRemove: (id: string) => void;
}

type FormState = { name: string; quantity: number; unit: string; category: Category; expiryDate: string };

const emptyForm = (): FormState => ({
  name: '',
  quantity: 1,
  unit: 'pz',
  category: Category.FRUIT_VEG,
  expiryDate: '',
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

  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);

  const [showCamera, setShowCamera] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onAdd({ ...form, name: form.name.trim(), expiryDate: form.expiryDate || undefined });
    setForm(emptyForm());
    setAddOpen(false);
  };

  const openEdit = (item: PantryItem) => {
    setEditing(item);
    setEditForm({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      expiryDate: item.expiryDate ?? '',
    });
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    onUpdate(editing.id, {
      quantity: editForm.quantity,
      unit: editForm.unit,
      category: editForm.category,
      // null (non undefined) così una scadenza cancellata viene salvata davvero
      expiryDate: (editForm.expiryDate || null) as any,
    });
    setEditing(null);
  };

  const removeEditing = () => {
    if (!editing) return;
    onRemove(editing.id);
    setEditing(null);
  };

  const handleCapture = async (dataUrl: string) => {
    setShowCamera(false);
    setIsAnalyzing(true);
    setNotice(null);
    try {
      const result = await identifyItemFromImage(dataUrl);
      const next = emptyForm();
      if (result?.name) {
        setForm({
          ...next,
          name: result.name,
          category: (result.category as Category) || next.category,
          quantity: result.quantity || next.quantity,
          unit: result.unit || next.unit,
          expiryDate: result.expiryDate || '',
        });
      } else {
        setForm(next);
        setNotice('Non ho riconosciuto il prodotto: inseriscilo a mano.');
      }
      setAddOpen(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

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
  const visible = enriched.filter(
    ({ item }) =>
      (filterCategory === 'ALL' || item.category === filterCategory) && (!q || item.name.toLowerCase().includes(q))
  );

  const subtitle =
    items.length === 0
      ? 'Ancora vuota'
      : `${items.length} ${items.length === 1 ? 'prodotto' : 'prodotti'}${
          urgentCount ? ` · ${urgentCount} da usare presto` : ''
        }`;

  const formFields = (state: FormState, set: (s: FormState) => void, withName: boolean) => (
    <div className="flex flex-col gap-4">
      {withName && (
        <div>
          <label className={labelClass} htmlFor="pantry-name">Cosa hai comprato?</label>
          <input
            id="pantry-name"
            type="text"
            placeholder="Es. Latte, Pasta, Mele…"
            className={fieldClass}
            value={state.name}
            onChange={(e) => set({ ...state, name: e.target.value })}
            required
            autoFocus={!state.name}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="pantry-qty">Quantità</label>
          <div className="flex gap-2">
            <input
              id="pantry-qty"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className={`${fieldClass} min-w-0 flex-1 px-3`}
              value={state.quantity}
              onChange={(e) => set({ ...state, quantity: Number(e.target.value) })}
            />
            <select
              aria-label="Unità"
              className={`${fieldClass} w-[68px] px-2`}
              value={state.unit}
              onChange={(e) => set({ ...state, unit: e.target.value })}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="pantry-exp">Scadenza</label>
          <input
            id="pantry-exp"
            type="date"
            className={`${fieldClass} px-3`}
            value={state.expiryDate}
            onChange={(e) => set({ ...state, expiryDate: e.target.value })}
          />
        </div>
      </div>
      <div>
        <span className={labelClass}>Categoria</span>
        <div className="flex flex-wrap gap-2">
          {(Object.values(Category) as Category[]).map((c) => {
            const active = state.category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => set({ ...state, category: c })}
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
    </div>
  );

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
            Fotografa
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
        </>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-4xl bg-white px-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mint text-emerald-700">
            <Plus size={28} />
          </span>
          <p className="font-display text-xl font-bold text-ink">La dispensa è vuota</p>
          <p className="text-sm text-muted">Aggiungi i tuoi prodotti a mano o fotografali: li riconosco io.</p>
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
              <span className={`self-start rounded-full px-2.5 py-1 text-xs font-bold ${EXPIRY_TONE_CLASS[expiryTone(days)]}`}>
                {expiryLabel(days)}
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setForm(emptyForm());
          setNotice(null);
          setAddOpen(true);
        }}
        className="fixed z-40 flex h-[54px] items-center gap-2 rounded-full bg-emerald-600 pl-4 pr-5 text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(30,138,78,0.35)] active:scale-95"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 100px)', right: 'max(1.25rem, calc((100vw - 28rem) / 2 + 1.25rem))' }}
      >
        <Plus size={22} strokeWidth={2.4} />
        Aggiungi
      </button>

      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Nuovo prodotto"
        footer={
          <button
            type="submit"
            form="pantry-add-form"
            className="h-[52px] w-full rounded-2xl bg-emerald-600 text-[15px] font-bold text-white"
          >
            Salva in dispensa
          </button>
        }
      >
        <form id="pantry-add-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          {notice && <p className="rounded-2xl bg-peach px-4 py-3 text-sm font-semibold text-[#8A3B0C]">{notice}</p>}
          {formFields(form, setForm, true)}
        </form>
      </Sheet>

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
          <div className="flex gap-3">
            <button
              type="button"
              onClick={removeEditing}
              className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#FBE0E3] px-4 text-[15px] font-bold text-[#9B2335]"
            >
              <Trash2 size={18} /> Elimina
            </button>
            <button
              type="submit"
              form="pantry-edit-form"
              className="h-[52px] flex-1 rounded-2xl bg-emerald-600 text-[15px] font-bold text-white"
            >
              Salva
            </button>
          </div>
        }
      >
        <form id="pantry-edit-form" onSubmit={saveEdit}>
          {formFields(editForm, setEditForm, false)}
        </form>
      </Sheet>

      <CameraCapture open={showCamera} onClose={() => setShowCamera(false)} onCapture={handleCapture} />
      <AnalyzingOverlay open={isAnalyzing} label="Riconosco il prodotto…" />
    </div>
  );
};
