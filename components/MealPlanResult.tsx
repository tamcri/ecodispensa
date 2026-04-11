import type { MealPlanResponse } from "../types";

interface MealPlanResultProps {
  result: MealPlanResponse;
  onAddMissingToShoppingList?: () => void;
  addingToShoppingList?: boolean;
}

export const MealPlanResult = ({
  result,
  onAddMissingToShoppingList,
  addingToShoppingList = false,
}: MealPlanResultProps) => {
  return (
    <div className="space-y-5">
      {(result.startDate || result.endDate) && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <div className="text-sm text-gray-500 mb-1">Periodo piano</div>
          <div className="text-lg font-bold text-gray-800">
            {result.startDate ?? "—"}
            {result.endDate ? ` → ${result.endDate}` : ""}
          </div>
        </div>
      )}

      {result.warning && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
          {result.warning}
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <div className="text-sm text-gray-500 mb-1">Budget minimo stimato</div>
        <div className="text-2xl font-bold text-gray-800">{result.estimatedMinBudget} €</div>
      </div>

      {result.plan.map((day) => (
        <div key={day.day} className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4">
          <h3 className="text-lg font-bold text-gray-800">Giorno {day.day}</h3>

          {day.meals.lunch && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold mb-1">Pranzo</div>
                  <h4 className="font-semibold text-gray-800">{day.meals.lunch.title}</h4>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>{day.meals.lunch.time}</div>
                  <div>{day.meals.lunch.difficulty}</div>
                </div>
              </div>

              {day.meals.lunch.description && (
                <p className="text-sm text-gray-600">{day.meals.lunch.description}</p>
              )}

              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Ingredienti usati</div>
                <ul className="space-y-1 text-sm text-gray-600">
                  {day.meals.lunch.ingredientsUsed.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      • {item.name} — {item.quantity} {item.unit}
                    </li>
                  ))}
                </ul>
              </div>

              {day.meals.lunch.missingIngredients.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">Da comprare</div>
                  <ul className="space-y-1 text-sm text-rose-700">
                    {day.meals.lunch.missingIngredients.map((item, index) => (
                      <li key={`${item.name}-${index}`}>
                        • {item.name} — {item.quantity} {item.unit}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Passaggi</div>
                <ol className="space-y-1 text-sm text-gray-600 list-decimal list-inside">
                  {day.meals.lunch.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {day.meals.dinner && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold mb-1">Cena</div>
                  <h4 className="font-semibold text-gray-800">{day.meals.dinner.title}</h4>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>{day.meals.dinner.time}</div>
                  <div>{day.meals.dinner.difficulty}</div>
                </div>
              </div>

              {day.meals.dinner.description && (
                <p className="text-sm text-gray-600">{day.meals.dinner.description}</p>
              )}

              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Ingredienti usati</div>
                <ul className="space-y-1 text-sm text-gray-600">
                  {day.meals.dinner.ingredientsUsed.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      • {item.name} — {item.quantity} {item.unit}
                    </li>
                  ))}
                </ul>
              </div>

              {day.meals.dinner.missingIngredients.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">Da comprare</div>
                  <ul className="space-y-1 text-sm text-rose-700">
                    {day.meals.dinner.missingIngredients.map((item, index) => (
                      <li key={`${item.name}-${index}`}>
                        • {item.name} — {item.quantity} {item.unit}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Passaggi</div>
                <ol className="space-y-1 text-sm text-gray-600 list-decimal list-inside">
                  {day.meals.dinner.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
        <h3 className="text-lg font-bold text-gray-800">Lista della spesa suggerita</h3>

        {result.shoppingListPreview.length > 0 ? (
          <ul className="space-y-1 text-sm text-gray-700">
            {result.shoppingListPreview.map((item, index) => (
              <li key={`${item.name}-${item.unit}-${index}`}>
                • {item.name} — {item.quantity} {item.unit}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Non risultano ingredienti mancanti.</p>
        )}

        {onAddMissingToShoppingList && result.shoppingListPreview.length > 0 && (
          <button
            type="button"
            onClick={onAddMissingToShoppingList}
            disabled={addingToShoppingList}
            className="w-full mt-2 rounded-xl bg-emerald-600 text-white py-3 font-semibold hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {addingToShoppingList ? "Aggiunta in corso..." : "Aggiungi mancanti alla lista spesa"}
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <h3 className="text-lg font-bold text-gray-800 mb-3">Copertura dispensa</h3>

        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium text-gray-700 mb-1">Ingredienti usati dalla dispensa</div>
            {result.pantryCoverage.usedPantryIngredients.length > 0 ? (
              <ul className="space-y-1 text-sm text-gray-600">
                {result.pantryCoverage.usedPantryIngredients.map((item, index) => (
                  <li key={`${item}-${index}`}>• {item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Nessun ingrediente dispensa rilevato.</p>
            )}
          </div>

          <div>
            <div className="text-sm font-medium text-gray-700 mb-1">Ingredienti mancanti</div>
            {result.pantryCoverage.missingPantryIngredients.length > 0 ? (
              <ul className="space-y-1 text-sm text-gray-600">
                {result.pantryCoverage.missingPantryIngredients.map((item, index) => (
                  <li key={`${item}-${index}`}>• {item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Nessun ingrediente mancante.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};