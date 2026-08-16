import { useEffect, useMemo, useState } from "react";
import type { MealPlanComplexity, MealPlanRequest } from "../types";

interface MealPlanFormProps {
  onSubmit: (payload: MealPlanRequest) => Promise<void> | void;
  loading: boolean;
  initialValues?: Partial<MealPlanRequest>;
  isPremiumActive?: boolean;
  premiumStatusLoading?: boolean;
}

function formatTodayISO() {
  const today = new Date();
  const yyyy = String(today.getFullYear());
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoToDisplay(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, yyyy, mm, dd] = match;
  return `${dd}-${mm}-${yyyy}`;
}

function displayToISO(value: string): string | null {
  const match = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;

  const [, dd, mm, yyyy] = match;
  const iso = `${yyyy}-${mm}-${dd}`;
  const date = new Date(`${iso}T00:00:00`);

  if (Number.isNaN(date.getTime())) return null;

  if (
    date.getUTCFullYear() !== Number(yyyy) ||
    date.getUTCMonth() + 1 !== Number(mm) ||
    date.getUTCDate() !== Number(dd)
  ) {
    return null;
  }

  return iso;
}

export const MealPlanForm = ({
  onSubmit,
  loading,
  initialValues,
  isPremiumActive = false,
  premiumStatusLoading = false,
}: MealPlanFormProps) => {
  const resolvedInitialValues = useMemo(() => {
    const initialStartDateIso =
      initialValues?.startDate && displayToISO(initialValues.startDate)
        ? displayToISO(initialValues.startDate)!
        : formatTodayISO();

    return {
      startDateIso: initialStartDateIso,
      days: initialValues?.days ?? 3,
      meals: {
        lunch: initialValues?.meals?.lunch ?? true,
        dinner: initialValues?.meals?.dinner ?? true,
      },
      people: initialValues?.people ?? 2,
      budget: initialValues?.budget == null ? "" : String(initialValues.budget),
      complexity: initialValues?.complexity ?? "mixed",
      dailyCalorieTarget:
        initialValues?.dailyCalorieTarget == null
          ? ""
          : String(initialValues.dailyCalorieTarget),
      notes: initialValues?.notes ?? "",
    };
  }, [initialValues]);

  const [startDateIso, setStartDateIso] = useState(resolvedInitialValues.startDateIso);
  const [days, setDays] = useState<1 | 2 | 3 | 5 | 7>(resolvedInitialValues.days as 1 | 2 | 3 | 5 | 7);
  const [lunch, setLunch] = useState(resolvedInitialValues.meals.lunch);
  const [dinner, setDinner] = useState(resolvedInitialValues.meals.dinner);
  const [people, setPeople] = useState(resolvedInitialValues.people);
  const [budget, setBudget] = useState<string>(resolvedInitialValues.budget);
  const [complexity, setComplexity] = useState<MealPlanComplexity>(
    resolvedInitialValues.complexity as MealPlanComplexity
  );
  const [planStyle, setPlanStyle] = useState<
  "balanced" | "light" | "protein" | "budget" | "vegetarian" | "antiwaste"
>("balanced");
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState<string>(
    resolvedInitialValues.dailyCalorieTarget
  );
  const [notes, setNotes] = useState(resolvedInitialValues.notes);

  useEffect(() => {
    setStartDateIso(resolvedInitialValues.startDateIso);
    setDays(resolvedInitialValues.days as 1 | 2 | 3 | 5 | 7);
    setLunch(resolvedInitialValues.meals.lunch);
    setDinner(resolvedInitialValues.meals.dinner);
    setPeople(resolvedInitialValues.people);
    setBudget(resolvedInitialValues.budget);
    setComplexity(resolvedInitialValues.complexity as MealPlanComplexity);
    setPlanStyle("balanced");
    setDailyCalorieTarget(resolvedInitialValues.dailyCalorieTarget);
    setNotes(resolvedInitialValues.notes);
  }, [resolvedInitialValues]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!startDateIso) {
      alert("Seleziona una data di inizio.");
      return;
    }

    if (!lunch && !dinner) {
      alert("Seleziona almeno pranzo o cena.");
      return;
    }

    const parsedBudget = budget.trim() === "" ? null : Number(budget);

    if (parsedBudget !== null && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) {
      alert("Inserisci un budget valido.");
      return;
    }

    const parsedDailyCalorieTarget =
      isPremiumActive && dailyCalorieTarget.trim() !== ""
        ? Math.round(Number(dailyCalorieTarget))
        : null;

    if (
      parsedDailyCalorieTarget !== null &&
      (!Number.isFinite(parsedDailyCalorieTarget) ||
        parsedDailyCalorieTarget < 1000 ||
        parsedDailyCalorieTarget > 4000)
    ) {
      alert("Inserisci un obiettivo calorie compreso tra 1000 e 4000 kcal.");
      return;
    }

    await onSubmit({
      startDate: isoToDisplay(startDateIso),
      days,
      meals: {
        lunch,
        dinner,
      },
      people: Math.max(1, Math.round(people)),
      budget: parsedBudget,
      complexity,
      style: planStyle,
      dailyCalorieTarget: parsedDailyCalorieTarget,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
        <div>
          <label htmlFor="meal-plan-start-date" className="block text-sm font-medium text-gray-700 mb-2">
            Data inizio
          </label>
          <input
            id="meal-plan-start-date"
            type="date"
            value={startDateIso}
            onChange={(e) => setStartDateIso(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-emerald-400 bg-white"
          />
          <p className="text-xs text-gray-500 mt-2">
            Data selezionata: {startDateIso ? isoToDisplay(startDateIso) : "—"}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Durata piano</label>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 5, 7].map((value) => {
              const typedValue = value as 1 | 2 | 3 | 5 | 7;
              const active = days === typedValue;

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDays(typedValue)}
                  className={`py-2 rounded-xl text-sm font-medium border transition-colors ${
                    active
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300"
                  }`}
                >
                  {value}g
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Pasti da pianificare</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setLunch((prev) => !prev)}
              className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                lunch
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-white text-gray-700 border-gray-200"
              }`}
            >
              Pranzo
            </button>
            <button
              type="button"
              onClick={() => setDinner((prev) => !prev)}
              className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                dinner
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-white text-gray-700 border-gray-200"
              }`}
            >
              Cena
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="meal-plan-people" className="block text-sm font-medium text-gray-700 mb-2">
              Persone
            </label>
            <input
              id="meal-plan-people"
              type="number"
              min={1}
              step={1}
              value={people}
              onChange={(e) => setPeople(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-emerald-400"
            />
          </div>

          <div>
            <label htmlFor="meal-plan-budget" className="block text-sm font-medium text-gray-700 mb-2">
              Budget (€)
            </label>
            <input
              id="meal-plan-budget"
              type="number"
              min={0}
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Opzionale"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        <div>
          <label htmlFor="meal-plan-complexity" className="block text-sm font-medium text-gray-700 mb-2">
            Complessità
          </label>
          <select
            id="meal-plan-complexity"
            value={complexity}
            onChange={(e) => setComplexity(e.target.value as MealPlanComplexity)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-emerald-400 bg-white"
          >
            <option value="easy">Facile</option>
            <option value="medium">Media</option>
            <option value="hard">Alta</option>
            <option value="mixed">Mista</option>
          </select>
        </div>

        <div>
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Stile del piano
  </label>

  <select
    value={planStyle}
    onChange={(e) =>
      setPlanStyle(
        e.target.value as
          | "balanced"
          | "light"
          | "protein"
          | "budget"
          | "vegetarian"
          | "antiwaste"
      )
    }
    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-emerald-400 bg-white"
  >
    <option value="balanced">⚖️ Equilibrato</option>
    <option value="light">🥗 Leggero</option>
    <option value="protein">💪 Proteico</option>
    <option value="budget">💰 Economico</option>
    <option value="vegetarian">🌱 Vegetariano</option>
    <option value="antiwaste">♻️ Anti-spreco</option>
  </select>

  <p className="text-xs text-gray-500 mt-2">
    Determina la priorità principale del piano alimentare.
  </p>
</div>

        <div className={`rounded-xl border p-4 ${
          isPremiumActive
            ? "border-amber-200 bg-amber-50/60"
            : "border-gray-200 bg-gray-50"
        }`}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label
              htmlFor="meal-plan-daily-calories"
              className="block text-sm font-medium text-gray-700"
            >
              Obiettivo calorie giornaliere
            </label>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
              Premium
            </span>
          </div>

          <input
            id="meal-plan-daily-calories"
            type="number"
            min={1000}
            max={4000}
            step={50}
            value={dailyCalorieTarget}
            onChange={(e) => setDailyCalorieTarget(e.target.value)}
            disabled={!isPremiumActive || premiumStatusLoading}
            placeholder={premiumStatusLoading ? "Verifica piano..." : "Es. 1800"}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-emerald-400 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
          />

          <p className="text-xs text-gray-500 mt-2">
            {premiumStatusLoading
              ? "Sto verificando il tuo piano."
              : isPremiumActive
                ? "Opzionale. EcoDispensa userà il valore come riferimento e mostrerà una stima kcal per pasto e per giorno."
                : "Disponibile con il piano Premium."}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Valori indicativi, non costituiscono indicazione medica o nutrizionale. Il totale considera solo i pasti pianificati in EcoDispensa.
          </p>
        </div>

        <div>
          <label htmlFor="meal-plan-notes" className="block text-sm font-medium text-gray-700 mb-2">
            Note
          </label>
          <textarea
            id="meal-plan-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Es. preferisco piatti mediterranei, pochi utensili, ricette rapide..."
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-emerald-400 resize-none"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-2xl bg-emerald-600 text-white py-3.5 font-semibold hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Generazione piano..." : "Genera Piano Pasti"}
      </button>
    </form>
  );
};