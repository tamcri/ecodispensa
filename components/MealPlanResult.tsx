import { useMemo, useState } from "react";
import type { MealPlanResponse } from "../types";
import { ChevronDown, ChevronRight } from "lucide-react";

interface MealPlanResultProps {
  result: MealPlanResponse;
  onAddMissingToShoppingList?: () => void;
  addingToShoppingList?: boolean;
  shoppingListAlreadyAdded?: boolean;
}

function formatDisplayDate(value?: string | null) {
  if (!value) return null;

  const ddmmyyyy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) return value;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    return `${dd}-${mm}-${yyyy}`;
  }

  return value;
}

function isPantryBasicIngredient(name: string) {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");

  const pantryBasics = [
    "sale",
    "pepe",
    "olio",
    "olio extravergine",
    "olio extravergine di oliva",
    "olio evo",
    "aceto",
    "basilico",
    "prezzemolo",
    "rosmarino",
    "salvia",
    "origano",
    "paprika",
    "curcuma",
    "cannella",
    "noce moscata",
  ];

  return pantryBasics.some(
    (basic) =>
      normalized === basic ||
      normalized.startsWith(`${basic} `) ||
      normalized.includes(` ${basic} `)
  );
}

function isQuantityAsNeeded(item: { name: string; quantity: number; unit: string }) {
  const normalizedUnit = String(item.unit ?? "").trim().toLowerCase();
  return normalizedUnit === "qb" || normalizedUnit === "q.b." || normalizedUnit === "q.b";
}

function formatIngredient(item: { name: string; quantity: number; unit: string }) {
  if (
    isQuantityAsNeeded(item) ||
    (isPantryBasicIngredient(item.name) && String(item.unit).toLowerCase() === "pz")
  ) {
    return `${item.name} — Q.B.`;
  }

  return `${item.name} — ${item.quantity} ${item.unit}`;
}

function getDayEstimatedCalories(day: MealPlanResponse["plan"][number]): number | null {
  if (typeof day.estimatedDailyCalories === "number" && day.estimatedDailyCalories > 0) {
    return Math.round(day.estimatedDailyCalories);
  }

  const meals = [day.meals.lunch, day.meals.dinner].filter(Boolean);
  if (meals.length === 0) return null;

  const calories = meals.map((meal) => meal?.estimatedCalories);
  if (calories.some((value) => typeof value !== "number" || value <= 0)) {
    return null;
  }

  const fruitCalories =
    typeof day.fruitSupplement?.estimatedCalories === "number" &&
    day.fruitSupplement.estimatedCalories > 0
      ? day.fruitSupplement.estimatedCalories
      : 0;

  return Math.round(
    calories.reduce((total, value) => total + Number(value ?? 0), fruitCalories)
  );
}

export const MealPlanResult = ({
  result,
  onAddMissingToShoppingList,
  addingToShoppingList = false,
  shoppingListAlreadyAdded = false,
}: MealPlanResultProps) => {
  const [isPlanOpen, setIsPlanOpen] = useState(true);
  const [openDays, setOpenDays] = useState<Record<number, boolean>>({});

  const formattedStartDate = formatDisplayDate(result.startDate ?? result.startDateIso);
  const formattedEndDate = formatDisplayDate(result.endDate ?? result.endDateIso);

  const totalMeals = useMemo(() => {
    return result.plan.reduce((count, day) => {
      let total = count;
      if (day.meals.lunch) total += 1;
      if (day.meals.dinner) total += 1;
      return total;
    }, 0);
  }, [result.plan]);

  const hasCalorieEstimates = useMemo(
    () =>
      result.plan.some(
        (day) =>
          getDayEstimatedCalories(day) !== null ||
          typeof day.meals.lunch?.estimatedCalories === "number" ||
          typeof day.meals.dinner?.estimatedCalories === "number"
      ),
    [result.plan]
  );

  const toggleDay = (dayNumber: number) => {
    setOpenDays((prev) => ({
      ...prev,
      [dayNumber]: !prev[dayNumber],
    }));
  };

  const isDayOpen = (dayNumber: number) => openDays[dayNumber] ?? dayNumber === 1;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-gray-500 mb-1">Piano attivo</div>
            <div className="text-lg font-bold text-gray-800">
              {formattedStartDate ?? "—"}
              {formattedEndDate ? ` → ${formattedEndDate}` : ""}
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {result.plan.length} giorni • {totalMeals} pasti
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPlanOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {isPlanOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {isPlanOpen ? "Riduci" : "Apri"}
          </button>
        </div>
      </div>

      {result.warning && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
          {result.warning}
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <div className="text-sm text-gray-500 mb-1">Budget minimo stimato</div>
        <div className="text-2xl font-bold text-gray-800">{result.estimatedMinBudget} €</div>
      </div>

      {hasCalorieEstimates && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide font-bold text-amber-700 mb-1">
                Calorie V2 · Premium
              </div>
              <div className="text-sm text-amber-900">
                {typeof result.dailyCalorieTarget === "number"
                  ? `Obiettivo indicativo: ~${Math.round(result.dailyCalorieTarget)} kcal al giorno per persona.`
                  : "Stima calorie per persona disponibile nel piano."}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-amber-800/80 mt-2">
            Stime indicative, non costituiscono indicazione medica o nutrizionale. Il totale giornaliero include i pasti pianificati e l'eventuale frutta integrativa.
          </p>
        </div>
      )}

      {isPlanOpen && (
        <>
          <div className="space-y-4">
            {result.plan.map((day) => {
              const dayOpen = isDayOpen(day.day);
              const dayCalories = getDayEstimatedCalories(day);

              return (
                <div key={day.day} className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleDay(day.day)}
                    className="w-full flex items-center justify-between gap-4 px-4 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">Giorno {day.day}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {[
                          day.meals.lunch ? "Pranzo" : null,
                          day.meals.dinner ? "Cena" : null,
                          day.fruitSupplement ? "Frutta" : null,
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                        {dayCalories !== null ? ` • ~${dayCalories} kcal/persona` : ""}
                      </p>
                    </div>

                    <div className="text-gray-500">
                      {dayOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                  </button>

                  {dayOpen && (
                    <div className="px-4 pb-4 space-y-4">
                      {day.meals.lunch && (
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold mb-1">
                                Pranzo
                              </div>
                              <h4 className="font-semibold text-gray-800">{day.meals.lunch.title}</h4>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              <div>{day.meals.lunch.time}</div>
                              <div>{day.meals.lunch.difficulty}</div>
                              {typeof day.meals.lunch.estimatedCalories === "number" && (
                                <div className="mt-1 font-semibold text-amber-700">
                                  ~{Math.round(day.meals.lunch.estimatedCalories)} kcal/persona
                                </div>
                              )}
                            </div>
                          </div>

                          {day.meals.lunch.description && (
                            <p className="text-sm text-gray-600">{day.meals.lunch.description}</p>
                          )}

                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-2">Dalla dispensa</div>
                            <ul className="space-y-1 text-sm text-gray-600">
                              {day.meals.lunch.ingredientsUsed.map((item, index) => (
                                <li key={`${item.name}-${index}`}>
                                  • {formatIngredient(item)}
                                </li>
                              ))}
                            </ul>
                            {day.meals.lunch.ingredientsUsed.length === 0 && (
                              <p className="text-sm text-gray-400 italic">
                                Nessun ingrediente disponibile dalla dispensa.
                              </p>
                            )}
                          </div>

                          {day.meals.lunch.missingIngredients.length > 0 && (
                            <div>
                              <div className="text-sm font-medium text-gray-700 mb-2">Da acquistare</div>
                              <ul className="space-y-1 text-sm text-rose-700">
                                {day.meals.lunch.missingIngredients.map((item, index) => (
                                  <li key={`${item.name}-${index}`}>
                                    • {formatIngredient(item)}
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
                              <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold mb-1">
                                Cena
                              </div>
                              <h4 className="font-semibold text-gray-800">{day.meals.dinner.title}</h4>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              <div>{day.meals.dinner.time}</div>
                              <div>{day.meals.dinner.difficulty}</div>
                              {typeof day.meals.dinner.estimatedCalories === "number" && (
                                <div className="mt-1 font-semibold text-amber-700">
                                  ~{Math.round(day.meals.dinner.estimatedCalories)} kcal/persona
                                </div>
                              )}
                            </div>
                          </div>

                          {day.meals.dinner.description && (
                            <p className="text-sm text-gray-600">{day.meals.dinner.description}</p>
                          )}

                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-2">Dalla dispensa</div>
                            <ul className="space-y-1 text-sm text-gray-600">
                              {day.meals.dinner.ingredientsUsed.map((item, index) => (
                                <li key={`${item.name}-${index}`}>
                                  • {formatIngredient(item)}
                                </li>
                              ))}
                            </ul>
                            {day.meals.dinner.ingredientsUsed.length === 0 && (
                              <p className="text-sm text-gray-400 italic">
                                Nessun ingrediente disponibile dalla dispensa.
                              </p>
                            )}
                          </div>

                          {day.meals.dinner.missingIngredients.length > 0 && (
                            <div>
                              <div className="text-sm font-medium text-gray-700 mb-2">Da acquistare</div>
                              <ul className="space-y-1 text-sm text-rose-700">
                                {day.meals.dinner.missingIngredients.map((item, index) => (
                                  <li key={`${item.name}-${index}`}>
                                    • {formatIngredient(item)}
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

                      {day.fruitSupplement && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold mb-1">
                                Frutta
                              </div>
                              <h4 className="font-semibold text-gray-800 capitalize">
                                {day.fruitSupplement.name}
                              </h4>
                              <p className="text-sm text-gray-600 mt-1">
                                {day.fruitSupplement.quantityPerPerson} {day.fruitSupplement.unit}/persona
                              </p>
                            </div>

                            <div className="text-right text-xs text-gray-500">
                              <div className="font-semibold text-amber-700">
                                ~{Math.round(day.fruitSupplement.estimatedCalories)} kcal/persona
                              </div>
                            </div>
                          </div>

                          <p className="text-xs text-emerald-800/80 mt-2">
                            Complemento di frutta fresca previsto per la giornata.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!shoppingListAlreadyAdded && (
            <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
              <h3 className="text-lg font-bold text-gray-800">Lista della spesa suggerita</h3>

              {result.shoppingListPreview.length > 0 ? (
                <ul className="space-y-1 text-sm text-gray-700">
                  {result.shoppingListPreview.map((item, index) => (
                    <li key={`${item.name}-${item.unit}-${index}`}>
                      • {formatIngredient(item)}
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
          )}

          {shoppingListAlreadyAdded && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 text-sm">
              Ingredienti mancanti già aggiunti alla lista della spesa.
            </div>
          )}

          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Copertura dispensa</h3>

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
          </div>
        </>
      )}
    </div>
  );
};