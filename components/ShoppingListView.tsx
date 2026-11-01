import React, { useMemo, useState } from 'react';
import { ShoppingItem, Category, PantryItem } from '../types';
import { daysUntil, expiryLabel, getCategoryTheme } from '../constants';
import { Camera, Check, Info, Plus, Refrigerator, Trash2 } from 'lucide-react';
import { identifyItemFromImage, lookupBarcode } from '../services/api';
import { findFoodGuide, sameProduct, suggestedExpiry } from '../foodGuide';
import { AnalyzingOverlay, CameraCapture, ScreenHeader, Sheet } from './ui';

interface ShoppingListViewProps {
  items: ShoppingItem[];
  pantryItems?: PantryItem[];
  onAdd: (name: string, category: Category, quantity?: number | null, unit?: string | null) => void;
  onToggle: (id: string) => void;
  onClearCompleted: () => void;
  onMoveToPantry: (itemsToAdd: Omit<PantryItem, 'id' | 'addedAt'>[], shoppingIdsToRemove: string[]) => void;
}

type MoveRow = {
  originalId: string;
  name: string;
  category: Category;
  quantity: number;
  unit: string;
  expiryDate: string;
  estimated: boolean;
};

const fieldClass =
  'h-11 w-full rounded-xl border-0 bg-white px-3 text-[15px] text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-emerald-500';

export const ShoppingListView: React.FC<ShoppingListViewProps> = ({
  items,
  pantryItems = [],
  onAdd,
  onToggle,
  onClearCompleted,
  onMoveToPantry,
}) => {
  const [itemName, setItemName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>(Category.FRUIT_VEG);

  const [showCamera, setShowCamera] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [moveRows, setMoveRows] = useState<MoveRow[]>([]);

  const formatQuantity = (quantity?: number | null, unit?: string | null) => {
    if (!unit) return null;
    if (quantity == null) return unit;
    return `${quantity} ${unit}`;
  };

  // "Ce l'hai già": prodotti in dispensa con lo stesso nome
  const inPantry = (name: string) => pantryItems.filter((p) => sameProduct(name, p.name));
  const typedMatches = itemName.trim().length >= 3 ? inPantry(itemName) : [];

  const describe = (p: PantryItem) => {
    const days = daysUntil(p.expiryDate);
    const exp = days === null ? '' : ` · ${expiryLabel(days).toLowerCase()}`;
    return `${p.quantity} ${p.unit}${exp}`;
  };

  const handleNameChange = (value: string) => {
    setItemName(value);
    const g = findFoodGuide(value);
    if (g) setSelectedCategory(g.category);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;
    onAdd(itemName.trim(), selectedCategory);
    setItemName('');
  };

  const handleBarcode = async (code: string) => {
    setShowCamera(false);
    setIsAnalyzing(true);
    try {
      const p = await lookupBarcode(code);
      if (p) {
        setItemName(p.name);
        if (p.category) setSelectedCategory(p.category as Category);
      } else {
        alert('Non trovo questo codice a barre: scrivi il nome a mano.');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCapture = async (dataUrl: string) => {
    setShowCamera(false);
    setIsAnalyzing(true);
    try {
      const result = await identifyItemFromImage(dataUrl);
      if (result?.name) {
        setItemName(result.name);
        if (result.category) setSelectedCategory(result.category as Category);
      } else {
        alert('Non sono riuscito a riconoscere il prodotto. Scrivilo a mano.');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const completedItems = items.filter((i) => i.isChecked);
  const activeItems = items.filter((i) => !i.isChecked);
  const pct = items.length ? Math.round((completedItems.length / items.length) * 100) : 0;

  const groups = useMemo(() => {
    const map = new Map<string, ShoppingItem[]>();
    for (const item of activeItems) {
      const key = item.category || Category.OTHER;
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    const order = Object.values(Category) as string[];
    return [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [activeItems]);

  const openMove = () => {
    if (completedItems.length === 0) return;
    setMoveRows(
      completedItems.map((item) => ({
        originalId: item.id,
        name: item.name,
        category: item.category,
        quantity: item.quantity != null ? item.quantity : 1,
        unit: item.unit && ['pz', 'kg', 'g', 'l'].includes(item.unit) ? item.unit : 'pz',
        expiryDate: suggestedExpiry(item.name) ?? '',
        estimated: !!suggestedExpiry(item.name),
      }))
    );
    setIsMoveOpen(true);
  };

  const updateRow = (index: number, field: keyof MoveRow, value: any) => {
    setMoveRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, [field]: value, ...(field === 'expiryDate' ? { estimated: false } : {}) } : r))
    );
  };

  const confirmMove = () => {
    onMoveToPantry(
      moveRows.map((d) => ({
        name: d.name,
        category: d.category,
        quantity: d.quantity,
        unit: d.unit,
        expiryDate: d.expiryDate || undefined,
      })),
      moveRows.map((d) => d.originalId)
    );
    setIsMoveOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Spesa" />

      {items.length > 0 && (
        <section className="flex flex-col gap-2.5 rounded-3xl bg-tangerine px-[18px] py-4 text-ink">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-[22px] font-extrabold">
              {completedItems.length} di {items.length} nel carrello
            </span>
            <span className="text-[13px] font-bold">{pct}%</span>
          </div>
          <span className="block h-2.5 overflow-hidden rounded-full bg-ink/20">
            <span className="block h-2.5 rounded-full bg-ink transition-all duration-500" style={{ width: `${pct}%` }} />
          </span>
        </section>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={itemName}
            onChange={(e) => handleNameChange(e.target.value)}
            autoComplete="off"
            placeholder="Aggiungi prodotto…"
            aria-label="Aggiungi prodotto"
            className="h-[50px] min-w-0 flex-1 rounded-2xl bg-white px-4 text-[15px] text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            aria-label="Fotografa il prodotto per aggiungerlo"
            className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl bg-white text-ink"
          >
            <Camera size={22} />
          </button>
          <button
            type="submit"
            aria-label="Aggiungi"
            disabled={!itemName.trim()}
            className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white disabled:opacity-40"
          >
            <Plus size={22} strokeWidth={2.4} />
          </button>
        </div>
        {typedMatches.length > 0 && (
          <div className="flex gap-3 rounded-2xl bg-lemon/50 p-3.5 animate-fade-in" role="status">
            <Info size={18} className="mt-0.5 shrink-0 text-ink" />
            <div className="text-sm text-[#3D3A1F]">
              <p className="font-bold text-ink">Ce l'hai già in dispensa</p>
              {typedMatches.slice(0, 3).map((p) => (
                <p key={p.id}>
                  {p.name}: {describe(p)}
                </p>
              ))}
              <p className="mt-1 text-xs">Se ti serve comunque, aggiungilo con +.</p>
            </div>
          </div>
        )}
        {itemName.trim() && (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 no-scrollbar animate-fade-in">
            {(Object.values(Category) as Category[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedCategory(c)}
                className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold ${
                  selectedCategory === c ? 'bg-ink text-white' : getCategoryTheme(c).chip
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </form>

      {items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-4xl bg-white px-6 py-10 text-center">
          <p className="font-display text-xl font-bold text-ink">Lista vuota</p>
          <p className="text-sm text-muted">Aggiungi quello che ti serve, oppure fattelo suggerire da EcoChef.</p>
        </div>
      )}

      {groups.map(([category, groupItems]) => {
        const theme = getCategoryTheme(category);
        return (
          <div key={category} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${theme.dot}`} />
              <span className="text-[13px] font-bold uppercase tracking-wider text-muted">{category}</span>
            </div>
            <div className="rounded-[20px] bg-white px-3.5 py-1">
              {groupItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggle(item.id)}
                  className="flex min-h-[52px] w-full items-center gap-3 border-b border-black/5 text-left last:border-0"
                >
                  <span className="h-[26px] w-[26px] shrink-0 rounded-full border-2 border-[#C5CCC7]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{item.name}</span>
                    {inPantry(item.name)[0] && (
                      <span className="block truncate text-xs font-semibold text-[#8A3B0C]">
                        In dispensa: {describe(inPantry(item.name)[0])}
                      </span>
                    )}
                  </span>
                  {formatQuantity(item.quantity, item.unit) && (
                    <span className="shrink-0 text-[13px] text-muted">{formatQuantity(item.quantity, item.unit)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {completedItems.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold uppercase tracking-wider text-muted">
              Nel carrello ({completedItems.length})
            </span>
            <button
              type="button"
              onClick={onClearCompleted}
              className="flex h-9 items-center gap-1 rounded-full px-2 text-xs font-bold text-[#9B2335]"
            >
              <Trash2 size={14} /> Svuota
            </button>
          </div>
          <div className="rounded-[20px] bg-white/60 px-3.5 py-1">
            {completedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id)}
                className="flex min-h-[48px] w-full items-center gap-3 border-b border-black/5 text-left last:border-0"
              >
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white animate-pop">
                  <Check size={16} strokeWidth={3} />
                </span>
                <span className="flex-1 truncate text-[15px] text-[#8A948D] line-through">{item.name}</span>
                {formatQuantity(item.quantity, item.unit) && (
                  <span className="shrink-0 text-[13px] text-[#8A948D]">{formatQuantity(item.quantity, item.unit)}</span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openMove}
            className="mt-2 flex h-[54px] items-center justify-center gap-2 rounded-[18px] bg-emerald-600 text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(30,138,78,0.3)]"
          >
            <Refrigerator size={20} />
            Sposta {completedItems.length} {completedItems.length === 1 ? 'prodotto' : 'prodotti'} in dispensa
          </button>
        </div>
      )}

      <CameraCapture open={showCamera} onClose={() => setShowCamera(false)} onCapture={handleCapture} onBarcode={handleBarcode} />
      <AnalyzingOverlay open={isAnalyzing} label="Riconosco il prodotto…" />

      <Sheet
        open={isMoveOpen}
        onClose={() => setIsMoveOpen(false)}
        title="In dispensa"
        footer={
          <button
            type="button"
            onClick={confirmMove}
            className="h-[52px] w-full rounded-2xl bg-emerald-600 text-[15px] font-bold text-white"
          >
            Conferma
          </button>
        }
      >
        <p className="mb-4 text-sm text-muted">
          Per frutta, verdura e pane ho già stimato la scadenza; per le confezioni guarda la data stampata.
        </p>
        <div className="flex flex-col gap-3">
          {moveRows.map((row, idx) => (
            <div key={row.originalId} className="rounded-[20px] bg-white p-3.5">
              <p className="mb-2.5 font-bold text-ink">{row.name}</p>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    aria-label={`Quantità di ${row.name}`}
                    className={`${fieldClass} min-w-0 flex-1 bg-ground`}
                    value={row.quantity}
                    onChange={(e) => updateRow(idx, 'quantity', Number(e.target.value))}
                  />
                  <select
                    aria-label={`Unità di ${row.name}`}
                    className={`${fieldClass} w-[62px] bg-ground px-1.5`}
                    value={row.unit}
                    onChange={(e) => updateRow(idx, 'unit', e.target.value)}
                  >
                    {['pz', 'kg', 'g', 'l'].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="date"
                    aria-label={`Scadenza di ${row.name}`}
                    className={`${fieldClass} bg-ground`}
                    value={row.expiryDate}
                    onChange={(e) => updateRow(idx, 'expiryDate', e.target.value)}
                  />
                  {row.estimated && <span className="mt-1 block text-[11px] font-bold text-emerald-700">Scadenza stimata</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
};
