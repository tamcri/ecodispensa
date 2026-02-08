
export enum Category {
  FRUIT_VEG = 'Ortofrutta',
  DAIRY = 'Latticini',
  MEAT_FISH = 'Carne & Pesce',
  PANTRY = 'Dispensa',
  FROZEN = 'Surgelati',
  HOUSEHOLD = 'Casa',
  OTHER = 'Altro'
}

export interface PantryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expiryDate?: string; // ISO string YYYY-MM-DD
  category: Category;
  addedAt: number;
}

export interface ShoppingItem {
  id: string;
  name: string;
  isChecked: boolean;
  category: Category;
}

export interface IngredientUsage {
  name: string;
  quantity: number;
  unit: string;
}

export interface Recipe {
  title: string;
  difficulty: string;
  time: string;
  description: string;
  ingredientsUsed: IngredientUsage[];
  missingIngredients: string[];
  steps: string[];
}

export type ViewState = 'pantry' | 'shopping' | 'chef';
