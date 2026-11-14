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
  [Category.FRUIT_VEG]: { tile: 'bg-[#E3EBDB] text-[#2F4A2C]', chip: 'bg-[#E3EBDB] text-[#2F4A2C]', dot: 'bg-[#4F6B4A]', soft: 'bg-[#E3EBDB]' },
  [Category.DAIRY]: { tile: 'bg-[#E4ECF5] text-[#2B4A6B]', chip: 'bg-[#E4ECF5] text-[#2B4A6B]', dot: 'bg-[#4A6E93]', soft: 'bg-[#E4ECF5]' },
  [Category.MEAT_FISH]: { tile: 'bg-[#F8DDD2] text-[#8E3418]', chip: 'bg-[#F8DDD2] text-[#8E3418]', dot: 'bg-[#C0603B]', soft: 'bg-[#F8DDD2]' },
  [Category.PANTRY]: { tile: 'bg-[#FBEBC4] text-[#6E5208]', chip: 'bg-[#FBEBC4] text-[#6E5208]', dot: 'bg-[#C9930A]', soft: 'bg-[#FBEBC4]' },
  [Category.FROZEN]: { tile: 'bg-[#E2EEF0] text-[#245159]', chip: 'bg-[#E2EEF0] text-[#245159]', dot: 'bg-[#3F8590]', soft: 'bg-[#E2EEF0]' },
  [Category.HOUSEHOLD]: { tile: 'bg-[#EEE9E0] text-[#5A5246]', chip: 'bg-[#EEE9E0] text-[#5A5246]', dot: 'bg-[#8A8172]', soft: 'bg-[#EEE9E0]' },
  [Category.OTHER]: { tile: 'bg-[#EDE7F3] text-[#4F3B6B]', chip: 'bg-[#EDE7F3] text-[#4F3B6B]', dot: 'bg-[#7A64A0]', soft: 'bg-[#EDE7F3]' },
};

// Colori di sfondo a rotazione per le ricette senza foto
export const RECIPE_TINTS = ['bg-[#FBEBC4]', 'bg-[#E3EBDB]', 'bg-[#F8DDD2]', 'bg-[#E4ECF5]', 'bg-[#EEE9E0]', 'bg-[#EDE7F3]'];

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

export type ExpiryTone = 'expired' | 'urgent' | 'soon' | 'ok' | 'none';

/** Cinque colori fissi in tutta l'app: scaduto, oggi/domani, questa settimana, tranquillo, senza data. */
export const expiryTone = (days: number | null): ExpiryTone => {
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= 1) return 'urgent';
  if (days <= 7) return 'soon';
  return 'ok';
};

export const EXPIRY_TONE_CLASS: Record<ExpiryTone, string> = {
  expired: 'bg-[#F3D3D3] text-[#8A1F2B]',
  urgent: 'bg-[#F8DDD2] text-[#8E3418]',
  soon: 'bg-[#FBEBC4] text-[#6E5208]',
  ok: 'bg-[#E3EBDB] text-[#2F4A2C]',
  none: 'bg-white text-[#8E3418] ring-1 ring-[#EBC3B0]',
};
