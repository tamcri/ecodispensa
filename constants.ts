import { Category } from "./types";

export const CATEGORY_COLORS: Record<Category, string> = {
  [Category.FRUIT_VEG]: 'bg-green-100 text-green-800 border-green-200',
  [Category.DAIRY]: 'bg-blue-100 text-blue-800 border-blue-200',
  [Category.MEAT_FISH]: 'bg-red-100 text-red-800 border-red-200',
  [Category.PANTRY]: 'bg-amber-100 text-amber-800 border-amber-200',
  [Category.FROZEN]: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  [Category.HOUSEHOLD]: 'bg-gray-100 text-gray-800 border-gray-200',
  [Category.OTHER]: 'bg-purple-100 text-purple-800 border-purple-200',
};

export const CATEGORY_EMOJIS: Record<Category, string> = {
    [Category.FRUIT_VEG]: '🥦',
    [Category.DAIRY]: '🧀',
    [Category.MEAT_FISH]: '🥩',
    [Category.PANTRY]: '🍝',
    [Category.FROZEN]: '❄️',
    [Category.HOUSEHOLD]: '🧻',
    [Category.OTHER]: '📦',
  };

// Stile del nuovo layout: ogni categoria ha un colore riconoscibile.
// tile = riquadro con l'iniziale del prodotto, chip = filtro, dot = pallino nelle liste.
export const CATEGORY_THEME: Record<Category, { tile: string; chip: string; dot: string; soft: string }> = {
  [Category.FRUIT_VEG]: { tile: 'bg-[#DCF0E2] text-[#1E6B3E]', chip: 'bg-[#DCF0E2] text-[#1E5A35]', dot: 'bg-[#1E8A4E]', soft: 'bg-[#DCF0E2]' },
  [Category.DAIRY]: { tile: 'bg-[#DCEBFA] text-[#1D4E89]', chip: 'bg-[#DCEBFA] text-[#1D4E89]', dot: 'bg-[#2F6FB5]', soft: 'bg-[#DCEBFA]' },
  [Category.MEAT_FISH]: { tile: 'bg-[#FBE0E3] text-[#9B2335]', chip: 'bg-[#FBE0E3] text-[#9B2335]', dot: 'bg-[#C23A4E]', soft: 'bg-[#FBE0E3]' },
  [Category.PANTRY]: { tile: 'bg-[#F8EDCF] text-[#7A4F00]', chip: 'bg-[#F8EDCF] text-[#7A4F00]', dot: 'bg-[#C9930A]', soft: 'bg-[#F8EDCF]' },
  [Category.FROZEN]: { tile: 'bg-[#D9F2F4] text-[#0E6670]', chip: 'bg-[#D9F2F4] text-[#0E6670]', dot: 'bg-[#1A9AA6]', soft: 'bg-[#D9F2F4]' },
  [Category.HOUSEHOLD]: { tile: 'bg-[#ECEDE8] text-[#4A524C]', chip: 'bg-[#ECEDE8] text-[#4A524C]', dot: 'bg-[#7A837D]', soft: 'bg-[#ECEDE8]' },
  [Category.OTHER]: { tile: 'bg-[#ECE4FA] text-[#5B3E96]', chip: 'bg-[#ECE4FA] text-[#5B3E96]', dot: 'bg-[#7B5CC0]', soft: 'bg-[#ECE4FA]' },
};

// Colori di sfondo a rotazione per le ricette senza foto
export const RECIPE_TINTS = ['bg-[#FFE9A8]', 'bg-[#DCEBFA]', 'bg-[#DCF0E2]', 'bg-[#FBE0E3]', 'bg-[#FFE6D3]', 'bg-[#ECE4FA]'];

export const getCategoryTheme = (category: string) =>
  CATEGORY_THEME[category as Category] ?? CATEGORY_THEME[Category.OTHER];

export const getInitial = (name: string) => (name.trim().charAt(0) || '?').toUpperCase();

// Giorni alla scadenza (null se non c'è data). 0 = oggi, negativo = scaduto.
export const daysUntil = (dateStr?: string | null) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
};

export const expiryLabel = (days: number | null) => {
  if (days === null) return 'Nessuna scadenza';
  if (days < 0) return days === -1 ? 'Scaduto ieri' : `Scaduto da ${-days} giorni`;
  if (days === 0) return 'Scade oggi';
  if (days === 1) return 'Scade domani';
  if (days <= 30) return `Tra ${days} giorni`;
  const months = Math.round(days / 30);
  return months <= 1 ? 'Tra un mese' : `Tra ${months} mesi`;
};

export type ExpiryTone = 'expired' | 'urgent' | 'ok' | 'none';

export const expiryTone = (days: number | null): ExpiryTone => {
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= 3) return 'urgent';
  return 'ok';
};

export const EXPIRY_TONE_CLASS: Record<ExpiryTone, string> = {
  expired: 'bg-[#FBE0E3] text-[#9B2335]',
  urgent: 'bg-[#FFE6D3] text-[#9A3412]',
  ok: 'bg-[#DCF0E2] text-[#1E5A35]',
  none: 'bg-[#ECEDE8] text-[#4A524C]',
};
