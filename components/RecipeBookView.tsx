import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { BookOpen, Clock, ChefHat, CheckCircle2, ShoppingBag } from "lucide-react";

type SavedRecipe = {
  id: string;
  title: string;
  difficulty: string | null;
  time: string | null;
  source: string;
  created_at: string;
  recipe_json: any;
};

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function formatSource(source: string) {
  if (source === "search") return "Cerca Ricetta";
  if (source === "suggest") return "Dispensa Anti-Spreco";
  if (source === "meal_plan") return "Piano Pasti";
  return source;
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT");
}

export function RecipeBookView() {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SavedRecipe | null>(null);

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    try {
      setLoading(true);

      const token = await getAccessToken();

      if (!token) {
        setLoading(false);
        return;
      }

      const r = await fetch("/api/saved-recipes", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const body = await r.json();

      if (!r.ok) {
        throw new Error(body?.error ?? "LOAD_RECIPES_FAILED");
      }

      setRecipes(body.recipes ?? []);
    } catch (e) {
      console.error("load recipes error:", e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 text-center">
        <p className="text-gray-500">Caricamento ricettario...</p>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl p-5">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BookOpen size={20} />
            Ricettario
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            Le tue ricette salvate automaticamente.
          </p>
        </div>

        {recipes.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center">
            <p className="text-gray-500">Nessuna ricetta salvata.</p>
          </div>
        )}

        {recipes.map((recipe) => (
          <button
            key={recipe.id}
            onClick={() => setSelected(recipe)}
            className="w-full bg-white rounded-2xl p-5 text-left border border-gray-100 hover:border-emerald-300 transition-colors"
            type="button"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-lg text-gray-900">{recipe.title}</h3>

                <p className="text-xs text-gray-400 mt-1">
                  {formatSource(recipe.source)} • {formatDate(recipe.created_at)}
                </p>
              </div>
            </div>

            <div className="flex gap-4 text-sm text-gray-500 mt-3">
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {recipe.time ?? "-"}
              </span>

              <span className="flex items-center gap-1">
                <ChefHat size={14} />
                {recipe.difficulty ?? "-"}
              </span>
            </div>
          </button>
        ))}
      </div>
    );
  }

  const recipe = selected.recipe_json;
  const ingredientsUsed = Array.isArray(recipe?.ingredientsUsed) ? recipe.ingredientsUsed : [];
  const missingIngredients = Array.isArray(recipe?.missingIngredients) ? recipe.missingIngredients : [];
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];

  return (
    <div className="space-y-4">
      <button
        onClick={() => setSelected(null)}
        className="text-emerald-600 font-medium"
        type="button"
      >
        ← Torna al Ricettario
      </button>

      <div className="bg-white rounded-2xl p-6 space-y-6">
        <div>
          <p className="text-xs text-gray-400 mb-2">
            {formatSource(selected.source)} • {formatDate(selected.created_at)}
          </p>

          <h2 className="text-2xl font-bold mb-3 text-gray-900">
            {recipe.title}
          </h2>

          <div className="flex flex-wrap gap-2 text-sm text-gray-500 mb-4">
            <span className="flex items-center gap-1 bg-gray-50 px-3 py-1 rounded-lg">
              <Clock size={14} />
              {recipe.time ?? selected.time ?? "-"}
            </span>

            <span className="flex items-center gap-1 bg-gray-50 px-3 py-1 rounded-lg">
              <ChefHat size={14} />
              {recipe.difficulty ?? selected.difficulty ?? "-"}
            </span>
          </div>

          {recipe.description && (
            <p className="text-gray-600 leading-relaxed">
              {recipe.description}
            </p>
          )}
        </div>

        <div>
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            Ingredienti disponibili usati
          </h3>

          {ingredientsUsed.length > 0 ? (
            <ul className="space-y-2 text-sm text-gray-700">
              {ingredientsUsed.map((item: any, idx: number) => (
                <li key={`${item?.name ?? "ingredient"}-${idx}`}>
                  • {item?.quantity != null ? `${item.quantity} ` : ""}
                  {item?.unit ? `${item.unit} ` : ""}
                  {item?.name ?? String(item)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              Nessun ingrediente disponibile usato dalla dispensa.
            </p>
          )}
        </div>

        <div>
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <ShoppingBag size={16} className="text-orange-500" />
            Da comprare
          </h3>

          {missingIngredients.length > 0 ? (
            <ul className="space-y-2 text-sm text-gray-700">
              {missingIngredients.map((item: any, idx: number) => (
                <li key={`${String(item)}-${idx}`}>• {String(item)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              Hai già tutto il necessario.
            </p>
          )}
        </div>

        <div>
          <h3 className="font-bold mb-3">Preparazione guidata</h3>

          {steps.length > 0 ? (
            <ol className="space-y-4">
              {steps.map((step: string, idx: number) => (
                <li key={idx} className="flex gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                    {idx + 1}
                  </span>

                  <p className="text-gray-700 leading-relaxed">
                    {step}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-500">
              Preparazione dettagliata non disponibile.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}