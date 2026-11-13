import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  PantryItem,
  Recipe,
  IngredientUsage,
  MealPlanRequest,
  MealPlanResponse,
  Category,
  CookResult,
} from "../types";
import { RecipeMeta } from "../services/api";
import { supabase } from "../services/supabaseClient";
import { MealPlanForm } from "./MealPlanForm";
import { MealPlanResult } from "./MealPlanResult";
import {
  Clock,
  BarChart,
  Loader2,
  Sparkles,
  AlertTriangle,
  Search,
  ChevronRight,
  CheckCircle2,
  Utensils,
  CalendarDays,
} from "lucide-react";
import { CreditsBadge, ScreenHeader, Sheet, Spinner } from "./ui";
import { tintFor } from "./RecipePhoto";
import { RecipeContent } from "./RecipeContent";
import { RecipeDetailSheet } from "./RecipeDetailSheet";

interface ChefViewProps {
  items: PantryItem[];
  onCook?: (ingredients: IngredientUsage[]) => Promise<CookResult | void> | void;
  onAddShoppingItems?: (
    items: Array<{
      name: string;
      category: Category;
      quantity?: number | null;
      unit?: string | null;
    }>
  ) => Promise<void>;
  onCreditsChange?: (credits: number) => void;
}

type ChefMode = "suggest" | "search" | "mealPlan";

type CreditsResponse = {
  eco_credits: number;
  updated_at: string | null;
};

type ApiRecipesResponse =
  | {
      recipes: Recipe[];
      remainingCredits?: number | null;
      cached?: boolean;
      deduped?: boolean;
      parse_error?: boolean;
      text?: string;
    }
  | {
      error: any;
      status?: number;
      hint?: string;
      remainingCredits?: number | null;
      refunded?: boolean;
      message?: string;
    };

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("getSession error:", error);
    return null;
  }
  return data.session?.access_token ?? null;
}

async function fetchCredits(): Promise<CreditsResponse> {
  const token = await getAccessToken();
  if (!token) throw new Error("SESSION_MISSING");

  const r = await fetch("/api/credits", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await r.json();
  if (!r.ok) {
    throw new Error(body?.error ?? "CREDITS_FETCH_FAILED");
  }
  return body as CreditsResponse;
}

async function fetchPremiumStatus(): Promise<boolean> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    throw new Error("SESSION_MISSING");
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select("plan_type, premium_until")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const premiumUntil = data?.premium_until
    ? new Date(String(data.premium_until))
    : null;

  return (
    data?.plan_type === "premium" &&
    premiumUntil !== null &&
    !Number.isNaN(premiumUntil.getTime()) &&
    premiumUntil.getTime() > Date.now()
  );
}

async function postRecipes(payload: any): Promise<{ status: number; body: ApiRecipesResponse }> {
  const token = await getAccessToken();
  if (!token) throw new Error("SESSION_MISSING");

  const r = await fetch("/api/recipes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = (await r.json()) as ApiRecipesResponse;
  return { status: r.status, body };
}

async function postMealPlan(payload: MealPlanRequest): Promise<{ status: number; body: any }> {
  const token = await getAccessToken();
  if (!token) throw new Error("SESSION_MISSING");

  const r = await fetch("/api/meal-plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await r.json();
  return { status: r.status, body };
}

async function saveRecipe(
  source: "suggest" | "search" | "meal_plan",
  recipe: Recipe
): Promise<string | null> {
  const token = await getAccessToken();

  if (!token) return null;

  try {
    const r = await fetch("/api/save-recipe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        source,
        recipe,
      }),
    });
    const body = await r.json().catch(() => null);
    return typeof body?.id === "string" ? body.id : null;
  } catch (e) {
    console.error("save recipe error:", e);
    return null;
  }
}

async function fetchActiveMealPlan(): Promise<MealPlanResponse | null> {
  const token = await getAccessToken();
  if (!token) throw new Error("SESSION_MISSING");

  const r = await fetch("/api/meal-plan-active", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await r.json();

  if (!r.ok) {
    throw new Error(body?.error || "ACTIVE_MEAL_PLAN_FETCH_FAILED");
  }

  if (!body?.plan) return null;

  return {
    id: body.plan.id,
    startDate: body.plan.startDate ?? null,
    startDateIso: body.plan.startDateIso ?? null,
    endDate: body.plan.endDate ?? null,
    endDateIso: body.plan.endDateIso ?? null,
    warning: body.plan.warning ?? null,
    estimatedMinBudget: Number(body.plan.estimatedMinBudget ?? 0),
    dailyCalorieTarget:
      body.plan.dailyCalorieTarget == null
        ? null
        : Number(body.plan.dailyCalorieTarget),
    plan: Array.isArray(body.plan.plan) ? body.plan.plan : [],
    shoppingListPreview: Array.isArray(body.plan.shoppingListPreview) ? body.plan.shoppingListPreview : [],
    pantryCoverage: body.plan.pantryCoverage ?? {
      usedPantryIngredients: [],
      missingPantryIngredients: [],
    },
    remainingCredits: null,
    status: body.plan.status,
    createdAt: body.plan.createdAt ?? null,
    updatedAt: body.plan.updatedAt ?? null,
  };
}

function getValidPantryItems(items: PantryItem[]) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return items.filter((i) => {
    if (!i.expiryDate) return true;
    const d = new Date(i.expiryDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime() >= now.getTime();
  });
}

function isMealPlanQuantityAsNeeded(name: string, unit?: string | null) {
  const normalizedName = name.trim().toLowerCase().replace(/\s+/g, " ");
  const normalizedUnit = String(unit ?? "").trim().toLowerCase();

  if (normalizedUnit === "qb" || normalizedUnit === "q.b." || normalizedUnit === "q.b") {
    return true;
  }

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

  return (
    normalizedUnit === "pz" &&
    pantryBasics.some(
      (basic) =>
        normalizedName === basic ||
        normalizedName.startsWith(`${basic} `) ||
        normalizedName.includes(` ${basic} `)
    )
  );
}

export const ChefView: React.FC<ChefViewProps> = ({ items, onCook, onAddShoppingItems, onCreditsChange }) => {
  const [mode, setMode] = useState<ChefMode>("suggest");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  const [ecoCredits, setEcoCredits] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [isPremiumActive, setIsPremiumActive] = useState(false);
  const [premiumStatusLoading, setPremiumStatusLoading] = useState(true);

  const [servings, setServings] = useState<number>(2);
  const [timeMinutes, setTimeMinutes] = useState<number>(25);

  const [mealPlanLoading, setMealPlanLoading] = useState(false);
  const [mealPlanError, setMealPlanError] = useState<string | null>(null);
  const [mealPlanResult, setMealPlanResult] = useState<MealPlanResponse | null>(null);
  const [addingMissing, setAddingMissing] = useState(false);
  const [loadingSavedMealPlan, setLoadingSavedMealPlan] = useState(false);
  const [hasFetchedSavedMealPlan, setHasFetchedSavedMealPlan] = useState(false);
  const [shoppingListAdded, setShoppingListAdded] = useState(false);

  // id delle ricette salvate (per indice) e foto dei piatti create in questa sessione
  const [savedIds, setSavedIds] = useState<Record<number, string>>({});
  const [metaById, setMetaById] = useState<Record<string, Partial<RecipeMeta>>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (ecoCredits !== null) onCreditsChange?.(ecoCredits);
  }, [ecoCredits]);

  const inCooldown = cooldownUntil !== null && Date.now() < cooldownUntil;
  const noCredits = !isPremiumActive && (ecoCredits ?? 0) <= 0;

  const { expiringItemsCount, expiredItemsCount } = useMemo(() => {
    let expiring = 0;
    let expired = 0;

    items.forEach((i) => {
      if (!i.expiryDate) return;

      const diff = new Date(i.expiryDate).getTime() - new Date().getTime();
      const days = Math.ceil(diff / (1000 * 3600 * 24));

      if (days < 0) {
        expired++;
      } else if (days <= 3) {
        expiring++;
      }
    });

    return {
      expiringItemsCount: expiring,
      expiredItemsCount: expired,
    };
  }, [items]);

  const refreshCredits = async () => {
    try {
      setCreditsLoading(true);
      const c = await fetchCredits();
      setEcoCredits(c.eco_credits ?? 0);
    } catch (e: any) {
      console.error("credits load error:", e?.message ?? e);
      setEcoCredits(null);
    } finally {
      setCreditsLoading(false);
    }
  };

  const refreshPremiumStatus = async () => {
    try {
      setPremiumStatusLoading(true);
      const active = await fetchPremiumStatus();
      setIsPremiumActive(active);
    } catch (e: any) {
      console.error("premium status load error:", e?.message ?? e);
      setIsPremiumActive(false);
    } finally {
      setPremiumStatusLoading(false);
    }
  };

  useEffect(() => {
    refreshCredits();
    refreshPremiumStatus();
  }, []);

  useEffect(() => {
    if (mode === "mealPlan") {
      refreshPremiumStatus();
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "mealPlan") return;
    if (hasFetchedSavedMealPlan) return;

    const loadSavedMealPlan = async () => {
      try {
        setLoadingSavedMealPlan(true);
        const savedPlan = await fetchActiveMealPlan();
        if (savedPlan) {
          setMealPlanResult(savedPlan);
        }
      } catch (e: any) {
        console.error("active meal plan load error:", e);
      } finally {
        setLoadingSavedMealPlan(false);
        setHasFetchedSavedMealPlan(true);
      }
    };

    loadSavedMealPlan();
  }, [mode, hasFetchedSavedMealPlan]);

  const handleGenerateSuggestions = async () => {
    if (items.length === 0) return;
    if (loading) return;

    if (inCooldown) {
      const sec = Math.ceil(((cooldownUntil as number) - Date.now()) / 1000);
      setError(`Troppi tentativi. Riprova tra ${sec} secondi.`);
      return;
    }

    if (noCredits) {
      setError("Crediti EcoChef esauriti. Ricarica per generare nuove ricette.");
      return;
    }

    setLoading(true);
    setError(null);
    setRecipes([]);
    setMealPlanError(null);
    setSelectedRecipe(null);

    try {
      const validPantryItems = getValidPantryItems(items);

      const payload = {
        pantryItems: validPantryItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          expiryDate: i.expiryDate ?? null,
        })),
        constraints: { servings, timeMinutes },
      };

      const { status, body } = await postRecipes(payload);

      if (status === 402) {
        setError("Crediti EcoChef esauriti. Acquista un pacchetto crediti per continuare.");
        await refreshCredits();
        return;
      }

      if (status === 429) {
        setCooldownUntil(Date.now() + 30_000);
        setError("Hai fatto troppe richieste. Aspetta 30 secondi e riprova.");
        await refreshCredits();
        return;
      }

      if (status >= 400) {
        const msg =
          (body as any)?.message ||
          (body as any)?.hint ||
          (body as any)?.error ||
          "Errore durante la generazione delle ricette.";
        setError(String(msg));
        await refreshCredits();
        return;
      }

      const recipesResp = body as any;
      const result: Recipe[] = Array.isArray(recipesResp?.recipes) ? recipesResp.recipes : [];

      if (!result || result.length === 0) {
        setError("Nessuna ricetta generata. Riprova tra poco.");
        await refreshCredits();
        return;
      }

      setRecipes(result);

      const ids: Record<number, string> = {};
      for (let i = 0; i < result.length; i++) {
        const id = await saveRecipe("suggest", result[i]);
        if (id) ids[i] = id;
      }
      setSavedIds(ids);
      setMetaById({});

if (typeof recipesResp?.remainingCredits === "number") {
        setEcoCredits(recipesResp.remainingCredits);
      } else {
        await refreshCredits();
      }
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("SESSION_MISSING")) {
        setError("Sessione scaduta. Fai logout e login di nuovo.");
      } else {
        setError("Impossibile connettersi allo Chef AI. Riprova più tardi.");
      }
      await refreshCredits();
    } finally {
      setLoading(false);
    }
  };

  const handleSearchRecipe = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (loading) return;

    if (inCooldown) {
      const sec = Math.ceil(((cooldownUntil as number) - Date.now()) / 1000);
      setError(`Troppi tentativi. Riprova tra ${sec} secondi.`);
      return;
    }

    if (noCredits) {
      setError("Crediti EcoChef esauriti. Ricarica per cercare nuove ricette.");
      return;
    }

    setLoading(true);
    setError(null);
    setRecipes([]);
    setMealPlanError(null);
    setSelectedRecipe(null);

    try {
      const validPantryItems = getValidPantryItems(items);

      const payload = {
        pantryItems: validPantryItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          expiryDate: i.expiryDate ?? null,
        })),
        constraints: { servings, timeMinutes, idea: searchQuery.trim() },
        idea: searchQuery.trim(),
      };

      const { status, body } = await postRecipes(payload);

      if (status === 402) {
        setError("Crediti EcoChef esauriti. Acquista un pacchetto crediti per continuare.");
        await refreshCredits();
        return;
      }

      if (status === 429) {
        setCooldownUntil(Date.now() + 30_000);
        setError("Hai fatto troppe richieste. Aspetta 30 secondi e riprova.");
        await refreshCredits();
        return;
      }

      if (status >= 400) {
        const msg =
          (body as any)?.message ||
          (body as any)?.hint ||
          (body as any)?.error ||
          "Errore durante la ricerca ricette.";
        setError(String(msg));
        await refreshCredits();
        return;
      }

      const recipesResp = body as any;
      const result: Recipe[] = Array.isArray(recipesResp?.recipes) ? recipesResp.recipes : [];

      if (!result || result.length === 0) {
        setError("Nessuna ricetta trovata. Riprova con una richiesta diversa.");
        await refreshCredits();
        return;
      }

      setRecipes(result);

      const ids: Record<number, string> = {};
      for (let i = 0; i < result.length; i++) {
        const id = await saveRecipe("search", result[i]);
        if (id) ids[i] = id;
      }
      setSavedIds(ids);
      setMetaById({});

if (typeof recipesResp?.remainingCredits === "number") {
        setEcoCredits(recipesResp.remainingCredits);
      } else {
        await refreshCredits();
      }
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("SESSION_MISSING")) {
        setError("Sessione scaduta. Fai logout e login di nuovo.");
      } else {
        setError("Impossibile cercare la ricetta. Riprova.");
      }
      await refreshCredits();
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMealPlan = async (payload: MealPlanRequest) => {
    if (mealPlanLoading) return;

    if (inCooldown) {
      const sec = Math.ceil(((cooldownUntil as number) - Date.now()) / 1000);
      setMealPlanError(`Troppi tentativi. Riprova tra ${sec} secondi.`);
      return;
    }

    if (noCredits) {
      setMealPlanError("Crediti EcoChef esauriti. Ricarica per generare un piano pasti.");
      return;
    }

    setMealPlanLoading(true);
    setMealPlanError(null);
    setMealPlanResult(null);
    setRecipes([]);
    setError(null);
    setSelectedRecipe(null);
    setShoppingListAdded(false);

    try {
      const { status, body } = await postMealPlan(payload);

      if (status === 402) {
        setMealPlanError("Crediti EcoChef esauriti. Acquista un pacchetto crediti per continuare.");
        await refreshCredits();
        return;
      }

      if (status === 429) {
        setCooldownUntil(Date.now() + 30_000);
        setMealPlanError("Hai fatto troppe richieste. Aspetta 30 secondi e riprova.");
        await refreshCredits();
        return;
      }

      if (status >= 400) {
        const msg = body?.message || body?.hint || body?.error || "Errore durante la generazione del piano pasti.";
        setMealPlanError(String(msg));
        await refreshCredits();
        return;
      }

      if (!Array.isArray(body?.plan) || !Array.isArray(body?.shoppingListPreview)) {
        setMealPlanError("Risposta piano pasti non valida.");
        await refreshCredits();
        return;
      }

      setMealPlanResult(body as MealPlanResponse);
      setHasFetchedSavedMealPlan(true);

      if (typeof body?.remainingCredits === "number") {
        setEcoCredits(body.remainingCredits);
      } else {
        await refreshCredits();
      }
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("SESSION_MISSING")) {
        setMealPlanError("Sessione scaduta. Fai logout e login di nuovo.");
      } else {
        setMealPlanError("Impossibile generare il piano pasti. Riprova.");
      }
      await refreshCredits();
    } finally {
      setMealPlanLoading(false);
    }
  };

  const inferCategoryFromName = (name: string): Category => {
    const value = name.toLowerCase();

    if (
      value.includes("latte") ||
      value.includes("mozzarella") ||
      value.includes("parmig") ||
      value.includes("yogurt") ||
      value.includes("burro") ||
      value.includes("formaggio")
    ) {
      return Category.DAIRY;
    }

    if (
      value.includes("pollo") ||
      value.includes("manzo") ||
      value.includes("pesce") ||
      value.includes("tonno") ||
      value.includes("salmone") ||
      value.includes("uova")
    ) {
      return Category.MEAT_FISH;
    }

    if (value.includes("gelato") || value.includes("surgel") || value.includes("ghiacci")) {
      return Category.FROZEN;
    }

    if (
      value.includes("detersivo") ||
      value.includes("spugna") ||
      value.includes("sacchetto") ||
      value.includes("carta")
    ) {
      return Category.HOUSEHOLD;
    }

    if (
      value.includes("pasta") ||
      value.includes("riso") ||
      value.includes("farina") ||
      value.includes("passata") ||
      value.includes("olio") ||
      value.includes("sale") ||
      value.includes("zucchero") ||
      value.includes("legumi")
    ) {
      return Category.PANTRY;
    }

    return Category.FRUIT_VEG;
  };

  const handleAddMissingToShoppingList = async () => {
    if (!mealPlanResult || mealPlanResult.shoppingListPreview.length === 0) return;
    if (addingMissing) return;

    if (!onAddShoppingItems) {
      alert("Funzione lista spesa non disponibile.");
      return;
    }

    setAddingMissing(true);

    try {
      const rows = mealPlanResult.shoppingListPreview.map((item) => {
        const quantityAsNeeded = isMealPlanQuantityAsNeeded(item.name, item.unit);

        return {
          name: item.name,
          category: inferCategoryFromName(item.name),
          quantity: quantityAsNeeded ? null : item.quantity,
          unit: quantityAsNeeded ? "Q.B." : item.unit,
        };
      });

      await onAddShoppingItems(rows);
      setShoppingListAdded(true);
      alert("Ingredienti mancanti aggiunti alla lista della spesa.");
    } catch (e: any) {
      console.error("Add missing shopping items error:", e);
      alert(e?.message ?? "Errore durante l'aggiunta alla lista della spesa.");
    } finally {
      setAddingMissing(false);
    }
  };

  const initialMealPlanValues: Partial<MealPlanRequest> | undefined = mealPlanResult
    ? {
        startDate: mealPlanResult.startDate ?? undefined,
        days: (mealPlanResult.plan?.length as 1 | 2 | 3 | 5 | 7 | undefined) ?? undefined,
        dailyCalorieTarget: mealPlanResult.dailyCalorieTarget ?? undefined,
      }
    : undefined;

  const switchMode = (next: ChefMode) => {
    setMode(next);
    setRecipes([]);
    setError(null);
    setMealPlanError(null);
    setSelectedRecipe(null);
    setSelectedIndex(null);
  };

  // Ingredienti che EcoChef userà per primi: quelli che scadono prima
  const priorityItems = useMemo(() => {
    const valid = getValidPantryItems(items);
    return [...valid]
      .sort((a, b) => {
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      })
      .slice(0, 6);
  }, [items]);

  const TIMES = [10, 15, 20, 25, 30, 40, 60];
  const timeIdx = Math.max(0, TIMES.indexOf(timeMinutes));

  const metaFor = (idx: number): RecipeMeta => {
    const id = savedIds[idx];
    const m = id ? metaById[id] ?? {} : {};
    return { imageUrl: m.imageUrl ?? null, status: m.status ?? "saved", rating: m.rating ?? null };
  };

  const photoFor = (idx: number) => metaFor(idx).imageUrl;

  const updateMeta = (idx: number, p: Partial<RecipeMeta>) => {
    const id = savedIds[idx];
    if (id) setMetaById((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  };

  const openRecipe = (recipe: Recipe, idx: number) => {
    setSelectedRecipe(recipe);
    setSelectedIndex(idx);
  };

  const closeRecipe = () => {
    setSelectedRecipe(null);
    setSelectedIndex(null);
  };

  const settings = (
    <div className="grid grid-cols-2 gap-3">
      <Stepper
        label="Porzioni"
        value={String(servings)}
        onMinus={() => setServings((n) => Math.max(1, n - 1))}
        onPlus={() => setServings((n) => Math.min(8, n + 1))}
        minusLabel="Meno porzioni"
        plusLabel="Più porzioni"
      />
      <Stepper
        label="Tempo massimo"
        value={`${timeMinutes}′`}
        onMinus={() => setTimeMinutes(TIMES[Math.max(0, timeIdx - 1)])}
        onPlus={() => setTimeMinutes(TIMES[Math.min(TIMES.length - 1, timeIdx + 1)])}
        minusLabel="Meno tempo"
        plusLabel="Più tempo"
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-3.5">
      <ScreenHeader
        title="EcoChef"
        right={
          isPremiumActive ? (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3 text-[13px] font-bold text-lemon">
              <Sparkles size={15} /> Premium
            </span>
          ) : (
            <CreditsBadge credits={ecoCredits} dark onClick={refreshCredits} />
          )
        }
      />

      <div role="tablist" aria-label="Modalità EcoChef" className="grid grid-cols-3 gap-1 rounded-2xl bg-[#E6E9E0] p-1">
        {(
          [
            ["suggest", "Dalla dispensa"],
            ["search", "Cerca ricetta"],
            ["mealPlan", "Menu"],
          ] as Array<[ChefMode, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => switchMode(id)}
            className={`h-10 rounded-xl text-[13px] transition-all ${
              mode === id ? "bg-white font-bold text-ink shadow-sm" : "font-semibold text-[#4A524C]"
            }`}
          >
            {id === "mealPlan" ? (
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={14} /> {label}
              </span>
            ) : (
              label
            )}
          </button>
        ))}
      </div>

      {noCredits && !premiumStatusLoading && ecoCredits !== null && (
        <div className="rounded-3xl bg-peach p-4 text-sm text-[#8A3B0C]">
          <p className="font-bold">Crediti esauriti</p>
          <p>Hai usato tutti i crediti di prova. Per generare nuove ricette serve almeno 1 credito: a breve potrai acquistarne altri dal Profilo. Le ricette salvate restano sempre disponibili nel Ricettario.</p>
        </div>
      )}

      {mode === "suggest" && (
        <>
          <section className="flex flex-col gap-3.5 rounded-4xl bg-lemon p-5 text-ink">
            <h2 className="font-display text-[26px] font-extrabold leading-[1.1]">Cosa cucino con quello che ho?</h2>
            {items.length === 0 ? (
              <p className="text-sm">Aggiungi qualche prodotto in dispensa e ti propongo le ricette.</p>
            ) : (
              <>
                <p className="text-sm text-[#3D3A1F]">
                  {expiringItemsCount > 0
                    ? `Parto da quello che scade prima (${expiringItemsCount} in scadenza):`
                    : "Parto da quello che scade prima:"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {priorityItems.map((i) => (
                    <span key={i.id} className="rounded-full bg-ink px-3 py-2 text-[13px] font-bold text-white">
                      {i.name}
                    </span>
                  ))}
                  {getValidPantryItems(items).length > priorityItems.length && (
                    <span className="rounded-full border-2 border-dashed border-ink/30 px-3 py-1.5 text-[13px] font-bold">
                      +{getValidPantryItems(items).length - priorityItems.length} altri
                    </span>
                  )}
                </div>
              </>
            )}
            {expiredItemsCount > 0 && (
              <p className="flex items-center gap-1.5 text-xs font-bold text-[#9B2335]">
                <AlertTriangle size={14} /> {expiredItemsCount} {expiredItemsCount === 1 ? "prodotto scaduto non verrà usato" : "prodotti scaduti non verranno usati"}
              </p>
            )}
          </section>

          {settings}

          <button
            type="button"
            onClick={handleGenerateSuggestions}
            disabled={items.length === 0 || loading || inCooldown || noCredits}
            className="flex h-14 items-center justify-center gap-2.5 rounded-[18px] bg-ink text-base font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? <Loader2 size={20} className="animate-spin text-lemon" /> : <Sparkles size={20} className="text-lemon" />}
            {recipes.length > 0 ? "Altre idee" : "Trova ricette"}
          </button>
          {!isPremiumActive && <p className="-mt-1.5 text-center text-xs text-muted">Ogni 4 ricette generate usi 1 credito</p>}
        </>
      )}

      {mode === "search" && (
        <>
          <form onSubmit={handleSearchRecipe} className="flex gap-2">
            <input
              type="text"
              placeholder="Es. carbonara, torta di mele…"
              aria-label="Cerca una ricetta"
              className="h-[52px] min-w-0 flex-1 rounded-2xl bg-white px-4 text-[15px] text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-emerald-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="submit"
              disabled={!searchQuery.trim() || loading || inCooldown || noCredits}
              aria-label="Cerca"
              title={noCredits ? "Crediti esauriti" : inCooldown ? "Aspetta qualche secondo e riprova" : "Cerca"}
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-ink text-lemon disabled:opacity-50"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
            </button>
          </form>
          {settings}
          <p className="text-center text-xs text-muted">Adatto la ricetta a quello che hai già in dispensa</p>
        </>
      )}

      {mode === "mealPlan" && (
        <div className="flex flex-col gap-4">
          <MealPlanForm
            onSubmit={handleGenerateMealPlan}
            loading={mealPlanLoading}
            initialValues={initialMealPlanValues}
            isPremiumActive={isPremiumActive}
            premiumStatusLoading={premiumStatusLoading}
          />

          {loadingSavedMealPlan && <Spinner label="Recupero il tuo piano attivo…" />}
          {mealPlanLoading && <Spinner label="Organizzo il tuo menu…" />}

          {mealPlanError && (
            <div className="rounded-2xl bg-[#FBE0E3] p-4 text-center text-sm font-semibold text-[#9B2335]">{mealPlanError}</div>
          )}

          {mealPlanResult && !mealPlanLoading && (
            <MealPlanResult
              result={mealPlanResult}
              onAddMissingToShoppingList={handleAddMissingToShoppingList}
              addingToShoppingList={addingMissing}
              shoppingListAlreadyAdded={shoppingListAdded}
            />
          )}
        </div>
      )}

      {loading && (
        <Spinner label={mode === "suggest" ? "Lo chef sta guardando in dispensa…" : "Cerco la ricetta perfetta…"} />
      )}

      {error && mode !== "mealPlan" && (
        <div className="rounded-2xl bg-[#FBE0E3] p-4 text-center text-sm font-semibold text-[#9B2335]">{error}</div>
      )}

      {mode !== "mealPlan" && recipes.length > 0 && !loading && (
        <div className="flex flex-col gap-3">
          <h3 className="mt-1 font-display text-xl font-bold text-ink">
            {mode === "suggest" ? "Le mie proposte" : "Ecco cosa ho trovato"}
          </h3>
          {recipes.map((recipe, idx) => (
            <RecipeCard
              key={`${recipe.title}-${idx}`}
              recipe={recipe}
              photo={photoFor(idx)}
              status={metaFor(idx).status}
              onOpen={() => openRecipe(recipe, idx)}
            />
          ))}
          <p className="text-center text-xs text-muted">Le ricette sono già salvate nel Ricettario</p>
        </div>
      )}

      <RecipeDetailSheet
        open={!!selectedRecipe}
        onClose={closeRecipe}
        recipe={selectedRecipe}
        recipeId={selectedIndex !== null ? savedIds[selectedIndex] ?? null : null}
        meta={selectedIndex !== null ? metaFor(selectedIndex) : { imageUrl: null, status: "saved", rating: null }}
        onMetaChange={(p) => selectedIndex !== null && updateMeta(selectedIndex, p)}
        onCook={onCook}
        onAddShoppingItems={onAddShoppingItems}
      />
    </div>
  );
};

const Stepper = ({
  label,
  value,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusLabel: string;
  plusLabel: string;
}) => (
  <div className="flex flex-col gap-1.5 rounded-[20px] bg-white px-3.5 py-3">
    <span className="text-xs font-bold text-muted">{label}</span>
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onMinus}
        aria-label={minusLabel}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone text-lg font-bold text-ink active:scale-95"
      >
        −
      </button>
      <span className="font-display text-2xl font-extrabold text-ink">{value}</span>
      <button
        type="button"
        onClick={onPlus}
        aria-label={plusLabel}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone text-lg font-bold text-ink active:scale-95"
      >
        +
      </button>
    </div>
  </div>
);

const RecipeCard = ({
  recipe,
  photo,
  status,
  onOpen,
}: {
  recipe: Recipe;
  photo: string | null;
  status?: string;
  onOpen: () => void;
}) => {
  const used = recipe.ingredientsUsed?.length ?? 0;
  const missing = recipe.missingIngredients?.length ?? 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col overflow-hidden rounded-3xl bg-white text-left transition-transform active:scale-[0.99]"
    >
      {photo ? (
        <img src={photo} alt="" className="h-36 w-full object-cover" />
      ) : (
        <span className={`flex h-24 items-end justify-between px-4 pb-3 ${tintFor(recipe.title)}`}>
          <span className="font-display text-5xl font-extrabold leading-none text-ink/20">
            {(recipe.title.trim()[0] ?? "?").toUpperCase()}
          </span>
          {status === "planned" && (
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-ink">In programma</span>
          )}
          {status === "cooked" && (
            <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-lemon">Cucinata</span>
          )}
        </span>
      )}
      <span className="flex flex-col gap-2 p-4">
        <span className="flex flex-wrap gap-1.5 text-xs font-bold">
          <span className="rounded-full bg-mint px-2.5 py-1 text-[#1E5A35]">
            Usa {used} {used === 1 ? "tuo prodotto" : "tuoi prodotti"}
          </span>
          {missing > 0 ? (
            <span className="rounded-full bg-peach px-2.5 py-1 text-[#9A3412]">
              {missing === 1 ? "Manca 1" : `Mancano ${missing}`}
            </span>
          ) : (
            <span className="rounded-full bg-lemon px-2.5 py-1 text-ink">Hai tutto</span>
          )}
        </span>
        <span className="font-display text-xl font-bold leading-tight text-ink">{recipe.title}</span>
        <span className="flex items-center gap-3 text-[13px] text-muted">
          <span className="flex items-center gap-1">
            <Clock size={14} /> {recipe.time}
          </span>
          <span>{recipe.difficulty}</span>
          <ChevronRight size={16} className="ml-auto text-ink" />
        </span>
      </span>
    </button>
  );
};


