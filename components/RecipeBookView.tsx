import { useEffect, useMemo, useState } from "react";
import { Play, Star, Trash2 } from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { fetchSavedRecipes, RecipeMeta, SavedRecipe } from "../services/api";
import { ScreenHeader, Spinner } from "./ui";
import { tintFor } from "./RecipePhoto";
import { RecipeDetailSheet } from "./RecipeDetailSheet";
import { Category, CookResult, IngredientUsage, Recipe } from "../types";

type Filter = "all" | "planned" | "cooked" | "suggest" | "search" | "meal_plan" | "shared";

const FILTERS: Array<[Filter, string]> = [
  ["all", "Tutte"],
  ["planned", "Da cucinare"],
  ["cooked", "Cucinate"],
  ["suggest", "Dalla dispensa"],
  ["search", "Cercate"],
  ["meal_plan", "Dai menu"],
  ["shared", "Sfide e regali"],
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

const metaLine = (r: SavedRecipe) => [r.time, r.difficulty].filter(Boolean).join(" · ");

const metaOf = (r: SavedRecipe): RecipeMeta => ({
  imageUrl: r.image_url ?? null,
  status: (r.status as RecipeMeta["status"]) ?? "saved",
  rating: r.rating ?? null,
});

const StatusBadge = ({ r }: { r: SavedRecipe }) => {
  if (r.status === "planned") {
    return <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold text-[#155A34]">In programma</span>;
  }
  if (r.status === "cooked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-lemon">
        {r.rating ? (
          <>
            <Star size={11} className="fill-lemon" /> {r.rating}
          </>
        ) : (
          "Cucinata"
        )}
      </span>
    );
  }
  return null;
};

export function RecipeBookView({
  onCook,
  onAddShoppingItems,
  initialRecipeId,
  onInitialRecipeShown,
}: {
  onCreditsChange?: (credits: number) => void;
  onCook?: (ingredients: IngredientUsage[]) => Promise<CookResult | void> | void;
  onAddShoppingItems?: (
    items: Array<{ name: string; category: Category; quantity?: number | null; unit?: string | null }>
  ) => Promise<void>;
  initialRecipeId?: string | null;
  onInitialRecipeShown?: () => void;
}) {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    fetchSavedRecipes()
      .then(setRecipes)
      .catch((e) => console.error("load recipes error:", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && initialRecipeId) {
      // una ricetta appena accettata potrebbe non essere ancora in lista
      if (!recipes.some((r) => r.id === initialRecipeId)) {
        fetchSavedRecipes()
          .then((all) => {
            setRecipes(all);
            setSelectedId(initialRecipeId);
          })
          .catch(() => undefined);
      } else {
        setSelectedId(initialRecipeId);
      }
      onInitialRecipeShown?.();
    }
  }, [loading, initialRecipeId]);

  // le ricette in programma vengono prima: sono quelle da fare
  const sorted = useMemo(
    () => [...recipes].sort((a, b) => Number(b.status === "planned") - Number(a.status === "planned")),
    [recipes]
  );

  const visible = useMemo(() => {
    if (filter === "all") return sorted;
    if (filter === "planned" || filter === "cooked") return sorted.filter((r) => r.status === filter);
    return sorted.filter((r) => r.source === filter);
  }, [sorted, filter]);

  const available = FILTERS.filter(([id]) => {
    if (id === "all") return true;
    if (id === "planned" || id === "cooked") return recipes.some((r) => r.status === id);
    return recipes.some((r) => r.source === id);
  });

  const selected = recipes.find((r) => r.id === selectedId) ?? null;

  const applyMeta = (id: string, p: Partial<RecipeMeta>) =>
    setRecipes((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              ...(p.imageUrl !== undefined ? { image_url: p.imageUrl } : {}),
              ...(p.status !== undefined ? { status: p.status } : {}),
              ...(p.rating !== undefined ? { rating: p.rating } : {}),
            }
          : r
      )
    );

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
  const plannedCount = recipes.filter((r) => r.status === "planned").length;

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader
        title="Ricettario"
        subtitle={
          loading
            ? " "
            : `${recipes.length === 1 ? "1 ricetta salvata" : `${recipes.length} ricette salvate`}${
                plannedCount ? ` · ${plannedCount} da cucinare` : ""
              }`
        }
      />

      {recipes.length > 0 && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 no-scrollbar">
          {available.map(([id, label]) => (
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
              {hero.image_url && <img src={hero.image_url} alt="" className="h-40 w-full rounded-3xl object-cover" />}
              <span className={`flex flex-col gap-2 px-2.5 ${hero.image_url ? "" : "pt-2.5"}`}>
                <span className="self-start rounded-full bg-lemon px-2.5 py-1 text-xs font-bold text-ink">
                  {hero.status === "planned" ? "Da cucinare" : hero.status === "cooked" ? "Cucinata da te" : "Ultima salvata"}
                </span>
                <span className="font-display text-[26px] font-extrabold leading-[1.1]">{hero.title}</span>
                <span className="text-[13px] text-[#BFE3CB]">{metaLine(hero)}</span>
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
                  <span className={`h-2 w-full ${tintFor(r.title)}`} aria-hidden="true" />
                )}
                <span className="flex flex-1 flex-col gap-1.5 p-3">
                  <span className="line-clamp-3 text-[15px] font-bold leading-tight text-ink">{r.title}</span>
                  <span className="text-xs text-muted">{metaLine(r)}</span>
                  <span className="mt-auto pt-1">
                    <StatusBadge r={r} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <RecipeDetailSheet
        open={!!selected}
        onClose={closeDetail}
        recipe={selected ? toRecipe(selected) : null}
        recipeId={selected?.id ?? null}
        meta={selected ? metaOf(selected) : { imageUrl: null, status: "saved", rating: null }}
        onMetaChange={(p) => selected && applyMeta(selected.id, p)}
        onCook={onCook}
        onAddShoppingItems={onAddShoppingItems}
        footerLeft={
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label="Elimina dal ricettario"
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-[#FBE0E3] text-[#9B2335]"
          >
            <Trash2 size={20} />
          </button>
        }
        footerOverride={
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
          ) : undefined
        }
      />
    </div>
  );
}
