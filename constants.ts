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
