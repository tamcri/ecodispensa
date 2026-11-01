import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Play, Trash2, Utensils } from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { fetchSavedRecipes, SavedRecipe } from "../services/api";
import { ScreenHeader, Sheet, Spinner } from "./ui";
import { RecipePhoto, tintFor } from "./RecipePhoto";
import { RecipeContent } from "./ChefView";
import { IngredientUsage, Recipe } from "../types";

type SourceFilter = "all" | "suggest" | "search" | "meal_plan";

const FILTERS: Array<[SourceFilter, string]> = [
  ["all", "Tutte"],
  ["suggest", "Dalla dispensa"],
  ["search", "Cercate"],
  ["meal_plan", "Dai menu"],
];

function toRecipe(r: SavedRecipe): Recipe {
  const j = r.recipe_json ?? {};
  return {
    title: j.title ?? r.title,
    difficulty: j.difficulty ?? r.difficulty ?? "",
    time: j.time ?? r.time ?? "",
    description: j.description ?? "",
    ingredientsUsed: Array.isArray(j.ingredientsUsed) ? j.ingredientsUsed : [],
    missingIngredients: Array.isArray(j.missingIngredients) ? j.missingIngredients : [],
    steps: Array.isArray(j.steps) ? j.steps : [],
  };
}

const meta = (r: SavedRecipe) => [r.time, r.difficulty].filter(Boolean).join(" · ");

export function RecipeBookView({
  onCreditsChange,
  onCook,
  initialRecipeId,
  onInitialRecipeShown,
}: {
  onCreditsChange?: (credits: number) => void;
  onCook?: (ingredients: IngredientUsage[]) => void;
  initialRecipeId?: string | null;
  onInitialRecipeShown?: () => void;
}) {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cookedId, setCookedId] = useState<string | null>(null);

  useEffect(() => {
    fetchSavedRecipes()
      .then(setRecipes)
      .catch((e) => console.error("load recipes error:", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && initialRecipeId) {
      setSelectedId(initialRecipeId);
      onInitialRecipeShown?.();
    }
  }, [loading, initialRecipeId]);

  const visible = useMemo(
    () => (filter === "all" ? recipes : recipes.filter((r) => r.source === filter)),
    [recipes, filter]
  );

  const selected = recipes.find((r) => r.id === selectedId) ?? null;

  const setImage = (id: string, url: string) =>
    setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, image_url: url } : r)));

  const closeDetail = () => {
    setSelectedId(null);
    setConfirmDelete(false);
  };

  const deleteSelected = async () => {
    if (!selected) return;
    const id = selected.id;
    const { error } = await supabase.from("recipes_saved").delete().eq("id", id);
    if (error) {
      console.error("delete recipe error:", error);
      alert("Non sono riuscito a eliminare la ricetta.");
      return;
    }
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    closeDetail();
  };

  const [hero, ...rest] = visible;

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader
        title="Ricettario"
        subtitle={loading ? " " : recipes.length === 1 ? "1 ricetta salvata" : `${recipes.length} ricette salvate`}
      />

      {recipes.length > 0 && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 no-scrollbar">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`h-10 shrink-0 rounded-full px-4 text-[13px] font-bold ${
                filter === id ? "bg-ink text-white" : "bg-white text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <Spinner label="Apro il ricettario…" />
      ) : recipes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-4xl bg-white px-6 py-10 text-center">
          <p className="font-display text-xl font-bold text-ink">Ancora nessuna ricetta</p>
          <p className="text-sm text-muted">Le ricette che EcoChef ti propone vengono salvate qui in automatico.</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Nessuna ricetta in questo gruppo.</p>
      ) : (
        <>
          {hero && (
            <button
              type="button"
              onClick={() => setSelectedId(hero.id)}
              className="flex flex-col gap-2.5 rounded-4xl bg-forest p-2.5 pb-5 text-left text-white"
            >
              {hero.image_url ? (
                <img src={hero.image_url} alt="" className="h-40 w-full rounded-3xl object-cover" />
              ) : (
                <span className={`flex h-32 items-end rounded-3xl px-4 pb-2 font-display text-6xl font-extrabold text-ink/20 ${tintFor(hero.title)}`}>
                  {(hero.title.trim()[0] ?? "?").toUpperCase()}
                </span>
              )}
              <span className="flex flex-col gap-2 px-2.5">
                <span className="self-start rounded-full bg-lemon px-2.5 py-1 text-xs font-bold text-ink">Ultima salvata</span>
                <span className="font-display text-[26px] font-extrabold leading-[1.1]">{hero.title}</span>
                <span className="text-[13px] text-[#BFE3CB]">{meta(hero)}</span>
                <span className="mt-1 inline-flex h-11 items-center gap-2 self-start rounded-2xl bg-white px-4 text-sm font-bold text-ink">
                  <Play size={16} fill="currentColor" /> Apri la ricetta
                </span>
              </span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            {rest.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className="flex flex-col overflow-hidden rounded-[22px] bg-white text-left transition-transform active:scale-[0.98]"
              >
                {r.image_url ? (
                  <img src={r.image_url} alt="" className="h-24 w-full object-cover" loading="lazy" />
                ) : (
                  <span className={`flex h-24 items-end px-3 pb-1.5 font-display text-[44px] font-extrabold leading-none text-ink/20 ${tintFor(r.title)}`}>
                    {(r.title.trim()[0] ?? "?").toUpperCase()}
                  </span>
                )}
                <span className="flex flex-col gap-1.5 p-3">
                  <span className="line-clamp-2 text-[15px] font-bold leading-tight text-ink">{r.title}</span>
                  <span className="text-xs text-muted">{meta(r)}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <Sheet
        open={!!selected}
        onClose={closeDetail}
        title={null}
        footer={
          selected ? (
            confirmDelete ? (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="h-[52px] flex-1 rounded-2xl bg-white text-[15px] font-bold text-ink"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="h-[52px] flex-1 rounded-2xl bg-[#C23A4E] text-[15px] font-bold text-white"
                >
                  Elimina ricetta
                </button>
              </div>
            ) : (
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Elimina dal ricettario"
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-[#FBE0E3] text-[#9B2335]"
                >
                  <Trash2 size={20} />
                </button>
                {onCook &&
                  (cookedId === selected.id ? (
                    <div className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-lemon font-bold text-ink animate-pop">
                      <CheckCircle2 size={20} /> Dispensa aggiornata
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onCook(toRecipe(selected).ingredientsUsed);
                        setCookedId(selected.id);
                      }}
                      className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[15px] font-bold text-white"
                    >
                      <Utensils size={20} /> L'ho cucinato!
                    </button>
                  ))}
              </div>
            )
          ) : null
        }
      >
        {selected && (
          <div className="flex flex-col gap-5">
            <RecipePhoto
              recipeId={selected.id}
              imageUrl={selected.image_url}
              title={selected.title}
              onChange={(url) => setImage(selected.id, url)}
              onCreditsChange={onCreditsChange}
              className="h-56"
            />
            <h2 className="font-display text-[26px] font-extrabold leading-tight text-ink">{selected.title}</h2>
            <RecipeContent recipe={toRecipe(selected)} />
          </div>
        )}
      </Sheet>
    </div>
  );
}
