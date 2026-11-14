import React, { useMemo, useState } from 'react';
import { ShoppingItem, Category, PantryItem } from '../types';
import { daysUntil, expiryLabel, getCategoryTheme } from '../constants';
import { Camera, Check, Info, Plus, Refrigerator, Trash2 } from 'lucide-react';
import { identifyItemFromImage, lookupBarcode } from '../services/api';
import { findFoodGuide, sameProduct, suggestedExpiry } from '../foodGuide';
import { AnalyzingOverlay, CameraCapture, QuantityInput, ScreenHeader, Sheet } from './ui';

interface ShoppingListViewProps {
  items: ShoppingItem[];
  pantryItems?: PantryItem[];
  onAdd: (
    name: string,
    category: Category,
    quantity?: number | null,
    unit?: string | null,
    opts?: { barcode?: string | null; checked?: boolean }
  ) => void;
  onToggle: (id: string) => void;
  onScanCheck?: (id: string, barcode: string | null) => void;
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
  barcode?: string | null;
};

type ScanResult =
  | { kind: 'inList'; item: ShoppingItem }
  | { kind: 'inCart'; item: ShoppingItem }
  | {
      kind: 'inPantry';
      name: string;
      category: Category;
      quantity: number | null;
      unit: string | null;
      barcode: string;
      matches: PantryItem[];
    }
  | { kind: 'added'; name: string }
  | { kind: 'unknown' };

const fieldClass =
  'h-11 w-full rounded-xl border-0 bg-white px-3 text-[15px] text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-emerald-500';

export const ShoppingListView: React.FC<ShoppingListViewProps> = ({
  items,
  pantryItems = [],
  onAdd,
  onToggle,
  onScanCheck,
  onClearCompleted,
  onMoveToPantry,
}) => {
  const [itemName, setItemName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>(Category.FRUIT_VEG);

  const [showCamera, setShowCamera] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  // codice scansionato ma sconosciuto: lo collego al prossimo prodotto scritto a mano
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);

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
    onAdd(itemName.trim(), selectedCategory, null, null, { barcode: pendingBarcode });
    setItemName('');
    setPendingBarcode(null);
  };

  /**
   * Scansione nella Spesa:
   * 1. è in lista → lo metto nel carrello;
   * 2. è già nel carrello → lo dico;
   * 3. è già in dispensa → avviso con quantità e scadenza, decidi tu;
   * 4. altrimenti → lo aggiungo direttamente al carrello.
   * Il confronto usa prima il codice a barre (esatto), poi il nome.
   */
  const handleBarcode = async (code: string) => {
    setShowCamera(false);
    setIsAnalyzing(true);
    try {
      const listByCode = items.find((i) => i.barcode === code);
      const pantryByCode = pantryItems.filter((p) => p.barcode === code);

      let name = listByCode?.name ?? pantryByCode[0]?.name ?? '';
      let category: Category = (listByCode?.category ?? pantryByCode[0]?.category ?? Category.PANTRY) as Category;
      let quantity: number | null = pantryByCode[0]?.quantity ?? null;
      let unit: string | null = pantryByCode[0]?.unit ?? null;

      if (!name) {
        const p = await lookupBarcode(code);
        if (!p) {
          setPendingBarcode(code);
          setScanResult({ kind: 'unknown' });
          return;
        }
        name = p.name;
        category = p.category as Category;
        quantity = p.quantity;
        unit = p.unit;
      }

      const listMatch = listByCode ?? items.find((i) => sameProduct(name, i.name));
      if (listMatch && !listMatch.isChecked) {
        onScanCheck ? onScanCheck(listMatch.id, code) : onToggle(listMatch.id);
        setScanResult({ kind: 'inList', item: listMatch });
        return;
      }
      if (listMatch && listMatch.isChecked) {
        setScanResult({ kind: 'inCart', item: listMatch });
        return;
      }

      const matches = pantryByCode.length ? pantryByCode : pantryItems.filter((p) => sameProduct(name, p.name));
      if (matches.length) {
        setScanResult({ kind: 'inPantry', name, category, quantity, unit, barcode: code, matches });
        return;
      }

      onAdd(name, category, quantity, unit, { barcode: code, checked: true });
      setScanResult({ kind: 'added', name });
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
        // le confezioni scansionate hanno la data stampata: niente stima
        expiryDate: item.barcode ? '' : suggestedExpiry(item.name, item.category) ?? '',
        estimated: !item.barcode && !!suggestedExpiry(item.name, item.category),
        barcode: item.barcode ?? null,
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
        barcode: d.barcode ?? null,
      })),
      moveRows.map((d) => d.originalId)
    );
    setIsMoveOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader
        title="Spesa"
        subtitle={
          items.length > 0
            ? `${items.length - completedItems.length} da prendere · ${completedItems.length} nel carrello`
            : 'La lista è vuota'
        }
      />

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
          <div className="flex gap-3 rounded-2xl bg-honey p-3.5 animate-fade-in" role="status">
            <Info size={18} className="mt-0.5 shrink-0 text-[#6E5208]" />
            <div className="text-sm text-[#4A3A08]">
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
                  selectedCategory === c ? 'bg-forest text-white' : getCategoryTheme(c).chip
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
                  <span className="h-[26px] w-[26px] shrink-0 rounded-full border-2 border-emerald-400 bg-white" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{item.name}</span>
                    {inPantry(item.name)[0] && (
                      <span className="block truncate text-xs font-semibold text-[#6E5208]">
                        Ce l'hai già: {describe(inPantry(item.name)[0])}
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
              className="flex h-9 items-center gap-1 rounded-full px-2 text-xs font-bold text-[#8A1F2B]"
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
            className="mt-2 flex h-[54px] items-center justify-center gap-2 rounded-[18px] bg-emerald-600 text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(79,107,74,0.3)]"
          >
            <Refrigerator size={20} />
            Metti {completedItems.length === 1 ? "l'unico preso" : `i ${completedItems.length} presi`} in dispensa
          </button>
        </div>
      )}

      <Sheet
        open={!!scanResult}
        onClose={() => setScanResult(null)}
        title={
          scanResult?.kind === 'inList'
            ? 'Trovato in lista'
            : scanResult?.kind === 'inCart'
            ? 'È già nel carrello'
            : scanResult?.kind === 'inPantry'
            ? 'Ce l\'hai già in dispensa'
            : scanResult?.kind === 'added'
            ? 'Aggiunto al carrello'
            : 'Prodotto non trovato'
        }
        footer={
          scanResult?.kind === 'inPantry' ? (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setScanResult(null)}
                className="h-[52px] rounded-2xl bg-emerald-600 text-[15px] font-bold text-white"
              >
                Non lo compro
              </button>
              <button
                type="button"
                onClick={() => {
                  const r = scanResult;
                  onAdd(r.name, r.category, r.quantity, r.unit, { barcode: r.barcode, checked: true });
                  setScanResult(null);
                }}
                className="h-[52px] rounded-2xl bg-white text-[15px] font-bold text-ink ring-1 ring-black/10"
              >
                Mi serve comunque
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {scanResult?.kind === 'inList' ? (
                <button
                  type="button"
                  onClick={() => {
                    onToggle(scanResult.item.id);
                    setScanResult(null);
                  }}
                  className="h-[52px] rounded-2xl bg-white text-[15px] font-bold text-ink ring-1 ring-black/10"
                >
                  Annulla
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => {
                  setScanResult(null);
                  if (scanResult?.kind !== 'unknown') setShowCamera(true);
                }}
                className={`h-[52px] rounded-2xl bg-forest text-[15px] font-bold text-white ${scanResult?.kind === 'inList' ? '' : 'col-span-2'}`}
              >
                {scanResult?.kind === 'unknown' ? 'Lo scrivo io' : 'Scansiona il prossimo'}
              </button>
            </div>
          )
        }
      >
        {scanResult?.kind === 'inList' && (
          <p className="text-[15px] text-[#3D4A3B]">
            <span className="font-bold text-ink">{scanResult.item.name}</span> era nella tua lista: l'ho messo nel carrello.
          </p>
        )}
        {scanResult?.kind === 'inCart' && (
          <p className="text-[15px] text-[#3D4A3B]">
            <span className="font-bold text-ink">{scanResult.item.name}</span> l'hai già preso: è tra i prodotti nel carrello.
          </p>
        )}
        {scanResult?.kind === 'added' && (
          <p className="text-[15px] text-[#3D4A3B]">
            <span className="font-bold text-ink">{scanResult.name}</span> non era in lista: l'ho aggiunto tra i prodotti nel carrello.
          </p>
        )}
        {scanResult?.kind === 'unknown' && (
          <p className="text-[15px] text-[#3D4A3B]">
            Non trovo questo codice nell'archivio prodotti. Scrivi il nome nel campo "Aggiungi prodotto": la prossima volta lo riconosco io.
          </p>
        )}
        {scanResult?.kind === 'inPantry' && (
          <div className="flex flex-col gap-3">
            <p className="text-[15px] text-[#3D4A3B]">
              Forse non ti serve: di <span className="font-bold text-ink">{scanResult.name}</span> hai già
            </p>
            {scanResult.matches.slice(0, 3).map((m) => {
              const days = daysUntil(m.expiryDate);
              const urgent = days !== null && days <= 3;
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-black/5">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{m.name}</p>
                    <p className="text-sm text-muted">
                      {m.quantity} {m.unit}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      urgent ? 'bg-peach text-[#8E3418]' : 'bg-mint text-[#2F4A2C]'
                    }`}
                  >
                    {expiryLabel(days)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Sheet>

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
              <div className="flex flex-col gap-3">
                <QuantityInput
                  id={`move-qty-${idx}`}
                  label={`Quantità di ${row.name}`}
                  compact
                  value={row.quantity}
                  unit={row.unit}
                  onChange={(q) => updateRow(idx, 'quantity', q)}
                  onUnitChange={(u) => updateRow(idx, 'unit', u)}
                />
                <div>
                  <label htmlFor={`move-exp-${idx}`} className="mb-1 block text-xs font-bold text-muted">
                    Scadenza {row.estimated && <span className="text-emerald-700">· stimata</span>}
                  </label>
                  <input
                    id={`move-exp-${idx}`}
                    type="date"
                    className={`${fieldClass} bg-ground`}
                    value={row.expiryDate}
                    onChange={(e) => updateRow(idx, 'expiryDate', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
};
