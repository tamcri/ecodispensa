import React from "react";
import { BarChart, CheckCircle2, Clock, ListChecks, ShoppingCart, Users } from "lucide-react";
import { Recipe } from "../types";
import { pantryName, recipeIngredientRows, shoppingName } from "../services/recipeIngredients";

export const RecipeContent = ({
  recipe,
  missingAction,
}: {
  recipe: Recipe;
  /** Pulsante sotto "Da comprare", es. "Aggiungi alla lista della spesa" */
  missingAction?: React.ReactNode;
}) => {
  const rows = recipeIngredientRows(recipe);
  const servings = Number(recipe.servings) > 0 ? Number(recipe.servings) : null;
  return (
  <div className="flex flex-col gap-6">
    <div className="flex flex-wrap gap-2 text-[13px] font-bold text-ink">
      {recipe.time && (
        <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5">
          <Clock size={15} /> {recipe.time}
        </span>
      )}
      {recipe.difficulty && (
        <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5">
          <BarChart size={15} /> {recipe.difficulty}
        </span>
      )}
      {servings && (
        <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5">
          <Users size={15} /> {servings === 1 ? "1 persona" : `${servings} persone`}
        </span>
      )}
    </div>

    {recipe.description && <p className="text-[15px] leading-relaxed text-[#3D4A3B]">{recipe.description}</p>}

    {rows.length > 0 && (
      <div>
        <h4 className="mb-3 flex items-center gap-2 font-display text-xl font-bold text-ink">
          <ListChecks size={20} className="text-emerald-700" /> Ingredienti
          {servings && (
            <span className="font-sans text-sm font-semibold text-muted">
              · per {servings === 1 ? "1 persona" : `${servings} persone`}
            </span>
          )}
        </h4>
        <ul className="flex flex-col divide-y divide-black/5 rounded-2xl bg-white px-4">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className="flex items-baseline gap-3 py-2.5 text-[15px]">
              <span className="w-24 shrink-0 font-bold text-ink">{r.amount}</span>
              <span className="flex-1 text-[#3D4A3B]">{r.name}</span>
            </li>
          ))}
        </ul>
      </div>
    )}

    <div className="flex flex-col gap-4">
      <div>
        <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
          <CheckCircle2 size={14} /> Dalla tua dispensa
        </h4>
        <div className="flex flex-wrap gap-2">
          {(recipe.ingredientsUsed ?? []).map((ing, i) => (
            <span key={`${ing.name}-${i}`} className="rounded-xl bg-mint px-3 py-1.5 text-sm text-[#2F4A2C]">
              {pantryName(ing)}
            </span>
          ))}
          {(recipe.ingredientsUsed ?? []).length === 0 && (
            <span className="text-sm italic text-muted">Nessun ingrediente dalla dispensa.</span>
          )}
        </div>
      </div>

      <div>
        <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#8E3418]">
          <ShoppingCart size={14} /> Da comprare
        </h4>
        <div className="flex flex-wrap gap-2">
          {(recipe.missingIngredients ?? []).map((ing: any, i) => (
            <span key={`${String(ing)}-${i}`} className="rounded-xl bg-peach px-3 py-1.5 text-sm text-[#8E3418]">
              {shoppingName(ing)}
            </span>
          ))}
          {(recipe.missingIngredients ?? []).length === 0 && (
            <span className="text-sm italic text-muted">Hai tutto il necessario!</span>
          )}
        </div>
        {(recipe.missingIngredients ?? []).length > 0 && missingAction && <div className="mt-3">{missingAction}</div>}
      </div>
    </div>

    <div>
      <h4 className="mb-3 font-display text-xl font-bold text-ink">Preparazione</h4>
      {recipe.steps && recipe.steps.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {recipe.steps.map((step, idx) => (
            <li key={idx} className="flex gap-3 rounded-2xl bg-white p-3.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lemon font-display text-sm font-extrabold text-ink">
                {idx + 1}
              </span>
              <p className="text-[15px] leading-relaxed text-[#3D4A3B]">{step}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm italic text-muted">{recipe.description}</p>
      )}
    </div>
  </div>
  );
};
