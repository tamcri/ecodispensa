import React from "react";
import { BarChart, CheckCircle2, Clock, ShoppingCart } from "lucide-react";
import { Recipe } from "../types";

export const RecipeContent = ({ recipe }: { recipe: Recipe }) => (
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
    </div>

    {recipe.description && <p className="text-[15px] leading-relaxed text-[#3D4840]">{recipe.description}</p>}

    <div className="flex flex-col gap-4">
      <div>
        <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
          <CheckCircle2 size={14} /> Dalla tua dispensa
        </h4>
        <div className="flex flex-wrap gap-2">
          {(recipe.ingredientsUsed ?? []).map((ing, i) => (
            <span key={`${ing.name}-${i}`} className="rounded-xl bg-mint px-3 py-1.5 text-sm text-[#155A34]">
              {(ing.quantity || ing.unit) && (
                <span className="font-bold">
                  {ing.quantity} {ing.unit}{" "}
                </span>
              )}
              {ing.name}
            </span>
          ))}
          {(recipe.ingredientsUsed ?? []).length === 0 && (
            <span className="text-sm italic text-muted">Nessun ingrediente dalla dispensa.</span>
          )}
        </div>
      </div>

      <div>
        <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#C2410C]">
          <ShoppingCart size={14} /> Da comprare
        </h4>
        <div className="flex flex-wrap gap-2">
          {(recipe.missingIngredients ?? []).map((ing: any, i) => (
            <span key={`${String(ing)}-${i}`} className="rounded-xl bg-peach px-3 py-1.5 text-sm text-[#8A3B0C]">
              {typeof ing === "string" ? ing : ing?.name ?? String(ing)}
            </span>
          ))}
          {(recipe.missingIngredients ?? []).length === 0 && (
            <span className="text-sm italic text-muted">Hai tutto il necessario!</span>
          )}
        </div>
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
              <p className="text-[15px] leading-relaxed text-[#3D4840]">{step}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm italic text-muted">{recipe.description}</p>
      )}
    </div>
  </div>
);
