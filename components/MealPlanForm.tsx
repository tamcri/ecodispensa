import { useState } from "react";
import type { MealPlanComplexity, MealPlanRequest } from "../types";

interface MealPlanFormProps {
  onSubmit: (payload: MealPlanRequest) => Promise<void> | void;
  loading: boolean;
}

export const MealPlanForm = ({ onSubmit, loading }: MealPlanFormProps) => {
  const [days, setDays] = useState<1 | 2 | 3 | 5 | 7>(3);
  const [lunch, setLunch] = useState(true);
  const [dinner, setDinner] = useState(true);
  const [people, setPeople] = useState(2);
  const [budget, setBudget] = useState<string>("");
  const [complexity, setComplexity] = useState<MealPlanComplexity>("mixed");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!lunch && !dinner) {
      alert("Seleziona almeno pranzo o cena.");
      return;
    }

    const parsedBudget = budget.trim() === "" ? null : Number(budget);

    if (parsedBudget !== null && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) {
      alert("Inserisci un budget valido.");
      return;
    }

    await onSubmit({
      days,
      meals: {
        lunch,
        dinner,
      },
      people: Math.max(1, Math.round(people)),
      budget: parsedBudget,
      complexity,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
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