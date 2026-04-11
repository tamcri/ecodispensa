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
  quantity?: number | null;
  unit?: string | null;
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


// =========================
// 🆕 MEAL PLAN TYPES
// =========================

export type MealPlanComplexity = "easy" | "medium" | "hard" | "mixed";

export interface MealPlanRequest {
  days: 1 | 2 | 3 | 5 | 7;
  meals: {
    lunch: boolean;
    dinner: boolean;
  };
  people: number;
  budget: number | null;
  complexity: MealPlanComplexity;
  notes?: string;
}

export interface MealPlanMissingIngredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface MealPlanRecipe {
  title: string;
  difficulty: string;
  time: string;
  servings: number;
  description: string;
  ingredientsUsed: IngredientUsage[];
  missingIngredients: MealPlanMissingIngredient[];
  steps: string[];
}

export interface MealPlanDay {
  day: number;
  meals: {
    lunch?: MealPlanRecipe;
    dinner?: MealPlanRecipe;
  };
}

export interface MealPlanShoppingItem {
  name: string;
  quantity: number;
  unit: string;
}

export interface MealPlanResponse {
  warning: string | null;
  estimatedMinBudget: number;
  plan: MealPlanDay[];
  shoppingListPreview: MealPlanShoppingItem[];
  pantryCoverage: {
    usedPantryIngredients: string[];
    missingPantryIngredients: string[];
  };
  remainingCredits: number | null;
}
