import { useEffect, useMemo, useState } from "react";
import { Search, Star, Trash2 } from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { fetchSavedRecipes, RecipeMeta, SavedRecipe } from "../services/api";
import { ScreenHeader, Spinner } from "./ui";
import { tintFor } from "./RecipePhoto";
import { RecipeDetailSheet } from "./RecipeDetailSheet";
import { Category, CookResult, IngredientUsage, Recipe } from "../types";
import { Course, normalizeCourse } from "../api/_lib/course";

type StatusFilter = "all" | "planned" | "cooked";
type CourseFilter = "all" | Course;

const COURSE_ORDER: Array<[Course, string]> = [
  ["primo", "Primi"],
  ["secondo", "Secondi"],
  ["contorno", "Contorni"],
  ["dolce", "Dolci"],
  ["altro", "Altro"],
];

/** Portata salvata, oppure indovinata dal titolo per le ricette più vecchie */
const courseOf = (r: SavedRecipe): Course => normalizeCourse(r.course ?? r.recipe_json?.course, r.title);

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
    return <span className="shrink-0 rounded-full bg-mint px-2.5 py-1 text-[11px] font-bold text-forest">In programma</span>;
  }
  if (r.status === "cooked") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-forest px-2.5 py-1 text-[11px] font-bold text-white">
        {r.rating ? (
          <>
            <Star size={11} className="fill-[#E9B949] text-[#E9B949]" /> {r.rating}
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
  const [status, setStatus] = useState<StatusFilter>("all");
  const [course, setCourse] = useState<CourseFilter>("all");
  const [query, setQuery] = useState("");
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

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      sorted.filter(
        (r) =>
          (status === "all" || r.status === status) &&
          (course === "all" || courseOf(r) === course) &&
          (!q || r.title.toLowerCase().includes(q))
      ),
    [sorted, status, course, q]
  );

  // Raggruppate per portata, nell'ordine Primi, Secondi, Contorni, Dolci, Altro
  const groups = useMemo(
    () =>
      COURSE_ORDER.map(([id, label]) => ({ id, label, rows: visible.filter((r) => courseOf(r) === id) })).filter(
        (g) => g.rows.length > 0
      ),
    [visible]
  );

  const presentCourses = COURSE_ORDER.filter(([id]) => recipes.some((r) => courseOf(r) === id));
  const cookedCount = recipes.filter((r) => r.status === "cooked").length;

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

  const plannedCount = recipes.filter((r) => r.status === "planned").length;

  const chip = (on: boolean) =>
    `h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold ${on ? "bg-forest text-white" : "bg-white text-ink"}`;
  const small = (on: boolean) =>
    `h-8 shrink-0 rounded-full px-3 text-xs font-bold ${on ? "bg-mint text-forest" : "text-muted"}`;

  return (
    <div className="flex flex-col gap-3.5">
      <ScreenHeader
        title="Ricette"
        subtitle={
          loading
            ? " "
            : `${recipes.length === 1 ? "1 ricetta salvata" : `${recipes.length} ricette salvate`}${
                plannedCount ? ` · ${plannedCount} in programma` : ""
              }`
        }
      />

      {recipes.length > 0 && (
        <>
          <label className="flex h-12 items-center gap-2.5 rounded-2xl bg-white px-4 text-muted">
            <Search size={20} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca tra le tue ricette"
              aria-label="Cerca tra le tue ricette"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none"
            />
          </label>

          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 no-scrollbar">
            <button type="button" onClick={() => setCourse("all")} className={chip(course === "all")}>
              Tutte
            </button>
            {presentCourses.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setCourse(id)} className={chip(course === id)}>
                {label}
              </button>
            ))}
          </div>

          <div className="-mt-1 flex gap-1">
            <button type="button" onClick={() => setStatus("all")} className={small(status === "all")}>
              Tutte
            </button>
            {plannedCount > 0 && (
              <button type="button" onClick={() => setStatus("planned")} className={small(status === "planned")}>
                In programma · {plannedCount}
              </button>
            )}
            {cookedCount > 0 && (
              <button type="button" onClick={() => setStatus("cooked")} className={small(status === "cooked")}>
                Cucinate · {cookedCount}
              </button>
            )}
          </div>
        </>
      )}

      {loading ? (
        <Spinner label="Apro il ricettario…" />
      ) : recipes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-4xl bg-white px-6 py-10 text-center">
          <p className="font-display text-xl font-bold text-ink">Ancora nessuna ricetta</p>
          <p className="text-sm text-muted">Le ricette che EcoChef ti propone vengono salvate qui in automatico.</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Nessuna ricetta trovata.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <section key={g.id} className="flex flex-col gap-2">
              <h2 className="flex items-center justify-between px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">
                <span>{g.label}</span>
                <span>{g.rows.length}</span>
              </h2>
              {g.rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className="flex min-w-0 items-center gap-3 rounded-[18px] bg-white px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
                >
                  {r.image_url ? (
                    <img src={r.image_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" loading="lazy" />
                  ) : (
                    <span className={`h-11 w-11 shrink-0 rounded-xl ${tintFor(r.title)}`} aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-ink">{r.title}</span>
                    <span className="block truncate text-xs text-muted">{metaLine(r)}</span>
                  </span>
                  <StatusBadge r={r} />
                </button>
              ))}
            </section>
          ))}
        </div>
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
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-[#F3D3D3] text-[#8A1F2B]"
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
