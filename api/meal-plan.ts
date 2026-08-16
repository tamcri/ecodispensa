import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type CacheEntry = { ts: number; value: any };
const TTL_MS = 60_000;
const MAX_ENTRIES = 100;

const g = globalThis as any;
g.__ecoMealPlanCache = g.__ecoMealPlanCache ?? new Map<string, CacheEntry>();
g.__ecoMealPlanInflight = g.__ecoMealPlanInflight ?? new Map<string, Promise<any>>();

const cache: Map<string, CacheEntry> = g.__ecoMealPlanCache;
const inflight: Map<string, Promise<any>> = g.__ecoMealPlanInflight;

function pruneCache() {
  if (cache.size <= MAX_ENTRIES) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
  const toRemove = entries.slice(0, Math.max(0, cache.size - MAX_ENTRIES));
  for (const [k] of toRemove) cache.delete(k);
}

function stableStringify(obj: any) {
  const seen = new WeakSet();
  const sorter = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return null;
      seen.add(v);
      if (Array.isArray(v)) return v.map(sorter);
      return Object.keys(v)
        .sort()
        .reduce((acc: any, k: string) => {
          acc[k] = sorter(v[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(sorter(obj));
}

function getBearerToken(req: VercelRequest): string | null {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h || typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeIngredientName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function singularizeItalianFoodName(name: string): string {
  let value = normalizeIngredientName(name);

  if (value.endsWith("che")) value = value.slice(0, -3) + "ca";
  else if (value.endsWith("ghi")) value = value.slice(0, -3) + "go";
  else if (value.endsWith("ie")) value = value.slice(0, -2) + "ia";
  else if (value.endsWith("i") && value.length > 3) value = value.slice(0, -1) + "o";
  else if (value.endsWith("e") && value.length > 3) value = value.slice(0, -1) + "a";

  return value;
}

function buildIngredientAliases(name: string): string[] {
  const normalized = normalizeIngredientName(name);
  const singular = singularizeItalianFoodName(name);
  return [...new Set([normalized, singular])];
}

function parseUnit(value: unknown): string {
  if (typeof value !== "string") return "pz";
  const trimmed = value.trim();
  return trimmed.length ? trimmed : "pz";
}

function normalizeUnit(unit: string): string {
  const value = parseUnit(unit).toLowerCase();

  if (value === "grammi" || value === "gr" || value === "grammo") return "g";
  if (value === "kilogrammi" || value === "kilogrammo") return "kg";
  if (value === "litri" || value === "litro") return "l";
  if (value === "millilitri" || value === "millilitro") return "ml";
  if (value === "pezzi" || value === "pezzo") return "pz";

  return value;
}

function parseQuantity(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : 0;
}

function isValidComplexity(value: unknown): value is "easy" | "medium" | "hard" | "mixed" {
  return value === "easy" || value === "medium" || value === "hard" || value === "mixed";
}

function estimateMinimumBudget(
  days: number,
  mealsPerDay: number,
  people: number,
  complexity: "easy" | "medium" | "hard" | "mixed"
): number {
  const perServingCostMap = {
    easy: 2.5,
    medium: 3.5,
    hard: 5.0,
    mixed: 3.5,
  } as const;

  const totalMealServings = days * mealsPerDay * people;
  const perServingCost = perServingCostMap[complexity];
  return Number((totalMealServings * perServingCost).toFixed(2));
}

function parseStartDateDDMMYYYY(value: unknown): { iso: string; date: Date; display: string } | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  const ddmmyyyy = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  let dd: string;
  let mm: string;
  let yyyy: string;

  if (ddmmyyyy) {
    [, dd, mm, yyyy] = ddmmyyyy;
  } else if (isoDate) {
    [, yyyy, mm, dd] = isoDate;
  } else {
    return null;
  }

  const iso = `${yyyy}-${mm}-${dd}`;
  const display = `${dd}-${mm}-${yyyy}`;
  const date = new Date(`${iso}T00:00:00`);

  if (Number.isNaN(date.getTime())) return null;

  if (
    date.getFullYear() !== Number(yyyy) ||
    date.getMonth() + 1 !== Number(mm) ||
    date.getDate() !== Number(dd)
  ) {
    return null;
  }

  return { iso, date, display };
}

function formatDateToISO(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date: Date, days: number): Date {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
}

type DbPantryItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  expiry_date: string | null;
  category: string | null;
  added_at: string | null;
};

type AvailablePantryItem = {
  id: string;
  name: string;
  normalizedName: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  expiryTs: number | null;
  category: string | null;
  addedAt: string | null;
};

type MissingIngredient = {
  name: string;
  quantity: number;
  unit: string;
};

type MealPlanRecipe = {
  title: string;
  difficulty: string;
  time: string;
  servings: number;
  description: string;
  ingredientsUsed: { name: string; quantity: number; unit: string }[];
  missingIngredients: MissingIngredient[];
  steps: string[];
};

type MealPlanDay = {
  day: number;
  meals: {
    lunch?: MealPlanRecipe;
    dinner?: MealPlanRecipe;
  };
};

type PantryAvailabilityBucket = {
  displayName: string;
  canonicalKey: string;
  totalBaseQty: number;
  originalUnit: string;
};

type PantryCoverage = {
  usedPantryIngredients: string[];
  missingPantryIngredients: string[];
};

function unitToBase(quantity: number, unit: string): { qty: number; unit: string } {
  const normalizedUnit = normalizeUnit(unit);

  if (normalizedUnit === "kg") return { qty: quantity * 1000, unit: "g" };
  if (normalizedUnit === "g") return { qty: quantity, unit: "g" };
  if (normalizedUnit === "l") return { qty: quantity * 1000, unit: "ml" };
  if (normalizedUnit === "ml") return { qty: quantity, unit: "ml" };

  return { qty: quantity, unit: normalizedUnit || "pz" };
}

function baseToDisplay(quantity: number, unit: string): { qty: number; unit: string } {
  if (unit === "g" && quantity >= 1000) {
    return { qty: Number((quantity / 1000).toFixed(2)), unit: "kg" };
  }
  if (unit === "ml" && quantity >= 1000) {
    return { qty: Number((quantity / 1000).toFixed(2)), unit: "l" };
  }

  return { qty: Number(quantity.toFixed(2)), unit };
}

function normalizeDbPantryItems(rows: DbPantryItem[]) {
  const nowDate = new Date();
  nowDate.setHours(0, 0, 0, 0);

  const soonThreshold = new Date(nowDate);
  soonThreshold.setDate(soonThreshold.getDate() + 3);

  const normalized: AvailablePantryItem[] = rows
    .map((row) => {
      const name = String(row.name ?? "").trim();
      const quantity = row.quantity != null ? Number(row.quantity) : 0;
      const unit = row.unit ?? "pz";
      const expiryDate = row.expiry_date ? String(row.expiry_date) : null;

      let expiryTs: number | null = null;
      if (expiryDate) {
        const parsed = new Date(expiryDate);
        if (!Number.isNaN(parsed.getTime())) {
          parsed.setHours(0, 0, 0, 0);
          expiryTs = parsed.getTime();
        }
      }

      return {
        id: row.id,
        name,
        normalizedName: normalizeIngredientName(name),
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unit: unit || "pz",
        expiryDate,
        expiryTs,
        category: row.category ?? null,
        addedAt: row.added_at ?? null,
      };
    })
    .filter((it) => it.name.length > 0);

  normalized.sort((a, b) => {
    const da = a.expiryTs ?? Number.POSITIVE_INFINITY;
    const db = b.expiryTs ?? Number.POSITIVE_INFINITY;
    return da - db;
  });

  const availableItems = normalized.filter((it) => {
    if (it.expiryTs == null) return true;
    return it.expiryTs >= nowDate.getTime();
  });

  const expiredItems = normalized.filter((it) => {
    if (it.expiryTs == null) return false;
    return it.expiryTs < nowDate.getTime();
  });

  const expiringSoonItems = availableItems.filter((it) => {
    if (it.expiryTs == null) return false;
    return it.expiryTs <= soonThreshold.getTime();
  });

  return { availableItems, expiredItems, expiringSoonItems };
}

function formatPantryItems(items: AvailablePantryItem[]): string {
  if (!items.length) return "Nessun ingrediente disponibile in dispensa.";
  return items
    .map((it) => {
      const qty = it.quantity > 0 ? ` - qty: ${it.quantity}${it.unit ? " " + it.unit : ""}` : "";
      const exp = it.expiryDate ? ` - expiry: ${it.expiryDate}` : "";
      return `• ${it.name}${qty}${exp}`;
    })
    .join("\n");
}

function sanitizeRecipe(input: any, fallbackServings: number): MealPlanRecipe {
  const rawIngredientsUsed = Array.isArray(input?.ingredientsUsed) ? input.ingredientsUsed : [];
  const rawMissingIngredients = Array.isArray(input?.missingIngredients) ? input.missingIngredients : [];
  const rawSteps = Array.isArray(input?.steps) ? input.steps : [];

  return {
    title: cleanText(input?.title) ?? "Ricetta",
    difficulty: cleanText(input?.difficulty) ?? "Media",
    time: cleanText(input?.time) ?? "30 min",
    servings: Math.max(1, Math.round(toNumber(input?.servings, fallbackServings))),
    description: cleanText(input?.description) ?? "",
    ingredientsUsed: rawIngredientsUsed
      .map((it: any) => ({
        name: cleanText(it?.name) ?? "",
        quantity: parseQuantity(it?.quantity),
        unit: parseUnit(it?.unit),
      }))
      .filter((it: any) => it.name.length > 0 && it.quantity > 0),
    missingIngredients: rawMissingIngredients
      .map((it: any) => ({
        name: cleanText(it?.name) ?? "",
        quantity: parseQuantity(it?.quantity),
        unit: parseUnit(it?.unit),
      }))
      .filter((it: any) => it.name.length > 0 && it.quantity > 0),
    steps: rawSteps
      .map((step: any) => cleanText(step))
      .filter((step: string | null): step is string => Boolean(step)),
  };
}

function sanitizePlan(rawPlan: any, people: number, days: number, includeLunch: boolean, includeDinner: boolean): MealPlanDay[] {
  const rawDays = Array.isArray(rawPlan) ? rawPlan : [];
  const result: MealPlanDay[] = [];

  for (let i = 0; i < days; i += 1) {
    const sourceDay = rawDays[i] ?? {};
    const sourceMeals = sourceDay?.meals ?? {};

    const dayEntry: MealPlanDay = {
      day: i + 1,
      meals: {},
    };

    if (includeLunch && sourceMeals?.lunch) {
      dayEntry.meals.lunch = sanitizeRecipe(sourceMeals.lunch, people);
    }

    if (includeDinner && sourceMeals?.dinner) {
      dayEntry.meals.dinner = sanitizeRecipe(sourceMeals.dinner, people);
    }

    result.push(dayEntry);
  }

  return result;
}

function buildPantryAvailabilityMap(availablePantryItems: AvailablePantryItem[]) {
  const map = new Map<string, PantryAvailabilityBucket>();

  for (const item of availablePantryItems) {
    if (item.quantity <= 0) continue;

    const base = unitToBase(item.quantity, item.unit);
    const aliases = buildIngredientAliases(item.name);

    for (const alias of aliases) {
      const key = `${alias}__${base.unit}`;
      const existing = map.get(key);

      if (existing) {
        existing.totalBaseQty = Number((existing.totalBaseQty + base.qty).toFixed(2));
      } else {
        map.set(key, {
          displayName: item.name,
          canonicalKey: key,
          totalBaseQty: Number(base.qty.toFixed(2)),
          originalUnit: base.unit,
        });
      }
    }
  }

  return map;
}

function recalculateMissingIngredients(
  plan: MealPlanDay[],
  availablePantryItems: AvailablePantryItem[]
): MealPlanDay[] {
  const pantryAvailability = buildPantryAvailabilityMap(availablePantryItems);

  const consumeFromAvailability = (ingredientName: string, quantity: number, unit: string) => {
    const base = unitToBase(quantity, unit);
    const aliases = buildIngredientAliases(ingredientName);

    for (const alias of aliases) {
      const key = `${alias}__${base.unit}`;
      const bucket = pantryAvailability.get(key);
      if (!bucket) continue;

      const usableQty = Math.min(bucket.totalBaseQty, base.qty);
      bucket.totalBaseQty = Number((bucket.totalBaseQty - usableQty).toFixed(2));
      return Number((base.qty - usableQty).toFixed(2));
    }

    return Number(base.qty.toFixed(2));
  };

  return plan.map((day) => {
    const clonedDay: MealPlanDay = {
      day: day.day,
      meals: {},
    };

    const processRecipe = (recipe?: MealPlanRecipe): MealPlanRecipe | undefined => {
      if (!recipe) return undefined;

      const recalculatedMissing: MissingIngredient[] = [];

      for (const ingredient of recipe.ingredientsUsed) {
        const missingBaseQty = consumeFromAvailability(ingredient.name, ingredient.quantity, ingredient.unit);

        if (missingBaseQty > 0) {
          const base = unitToBase(ingredient.quantity, ingredient.unit);
          const display = baseToDisplay(missingBaseQty, base.unit);

          recalculatedMissing.push({
            name: ingredient.name,
            quantity: display.qty,
            unit: display.unit,
          });
        }
      }

      const aggregatedMissing = new Map<string, MissingIngredient>();
      for (const ingredient of recalculatedMissing) {
        const key = `${normalizeIngredientName(ingredient.name)}__${normalizeUnit(ingredient.unit)}`;
        const existing = aggregatedMissing.get(key);

        if (existing) {
          existing.quantity = Number((existing.quantity + ingredient.quantity).toFixed(2));
        } else {
          aggregatedMissing.set(key, {
            name: ingredient.name,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
          });
        }
      }

      return {
        ...recipe,
        missingIngredients: [...aggregatedMissing.values()],
      };
    };

    clonedDay.meals.lunch = processRecipe(day.meals.lunch);
    clonedDay.meals.dinner = processRecipe(day.meals.dinner);

    return clonedDay;
  });
}

function aggregateShoppingList(plan: MealPlanDay[]): MissingIngredient[] {
  const aggregated = new Map<string, MissingIngredient>();

  for (const day of plan) {
    const recipes = [day.meals.lunch, day.meals.dinner].filter(Boolean) as MealPlanRecipe[];

    for (const recipe of recipes) {
      for (const ingredient of recipe.missingIngredients) {
        const normalizedName = normalizeIngredientName(ingredient.name);
        const unit = normalizeUnit(ingredient.unit);
        const key = `${normalizedName}__${unit}`;

        const existing = aggregated.get(key);
        if (existing) {
          existing.quantity = Number((existing.quantity + ingredient.quantity).toFixed(2));
        } else {
          aggregated.set(key, {
            name: ingredient.name.trim(),
            quantity: Number(ingredient.quantity.toFixed(2)),
            unit,
          });
        }
      }
    }
  }

  return [...aggregated.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
}

function buildPantryCoverage(plan: MealPlanDay[], availablePantryItems: AvailablePantryItem[]): PantryCoverage {
  const pantryAliasMap = new Map<string, string>();

  for (const item of availablePantryItems) {
    for (const alias of buildIngredientAliases(item.name)) {
      pantryAliasMap.set(alias, item.name);
    }
  }

  const usedPantryNames = new Set<string>();

  for (const day of plan) {
    const recipes = [day.meals.lunch, day.meals.dinner].filter(Boolean) as MealPlanRecipe[];
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredientsUsed) {
        for (const alias of buildIngredientAliases(ingredient.name)) {
          const originalName = pantryAliasMap.get(alias);
          if (originalName) {
            usedPantryNames.add(originalName);
            break;
          }
        }
      }
    }
  }

  const shoppingListPreview = aggregateShoppingList(plan);

  return {
    usedPantryIngredients: [...usedPantryNames].sort((a, b) => a.localeCompare(b, "it")),
    missingPantryIngredients: shoppingListPreview.map((it) => it.name),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY not set" });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY" });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Missing Authorization Bearer token" });

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: "Invalid session", details: userErr?.message });
    }

    const user_id = userData.user.id;
    const body = req.body ?? {};

    const style =
    body.style === "light" ||
    body.style === "protein" ||
    body.style === "budget" ||
    body.style === "vegetarian" ||
   body.style === "antiwaste"
    ? body.style
    : "balanced";

    const startDateParsed = parseStartDateDDMMYYYY(body.startDate);
    if (!startDateParsed) {
      return res.status(400).json({ error: "Data di inizio non valida. Seleziona una data dal calendario." });
    }

    const days = Math.round(toNumber(body.days, 0));
    const allowedDays = [1, 2, 3, 5, 7];
    if (!allowedDays.includes(days)) {
      return res.status(400).json({ error: "Invalid days. Allowed values: 1, 2, 3, 5, 7" });
    }

    const startDateIso = startDateParsed.iso;
    const endDateIso = formatDateToISO(addDays(startDateParsed.date, Math.max(0, days - 1)));

    const meals = body.meals ?? {};
    const includeLunch = Boolean(meals.lunch);
    const includeDinner = Boolean(meals.dinner);

    if (!includeLunch && !includeDinner) {
      return res.status(400).json({ error: "Select at least one meal type: lunch and/or dinner" });
    }

    const people = Math.max(1, Math.round(toNumber(body.people, 1)));
    const budget = body.budget == null || body.budget === "" ? null : toNumber(body.budget, NaN);
    if (budget !== null && !Number.isFinite(budget)) {
      return res.status(400).json({ error: "Invalid budget" });
    }

    const complexity = isValidComplexity(body.complexity) ? body.complexity : "mixed";
    const notes = cleanText(body.notes) ?? "";

    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("diet, lactose_free, avoid, allergies, plan_type, premium_until")
      .eq("user_id", user_id)
      .maybeSingle();

    if (profileErr) return res.status(500).json({ error: profileErr.message });

    const { data: pantryRows, error: pantryErr } = await supabase
      .from("pantry_items")
      .select("id, name, quantity, unit, expiry_date, category, added_at")
      .eq("user_id", user_id)
      .order("added_at", { ascending: false });

    if (pantryErr) return res.status(500).json({ error: pantryErr.message });

    const { availableItems, expiredItems, expiringSoonItems } = normalizeDbPantryItems((pantryRows ?? []) as DbPantryItem[]);

    const diet = (profile?.diet ?? "omnivore") as string;
    const lactoseFree = Boolean(profile?.lactose_free ?? false);
    const avoid: string[] = Array.isArray(profile?.avoid) ? profile.avoid : [];
    const allergies: string[] = Array.isArray(profile?.allergies) ? profile.allergies : [];
    const premiumUntil = profile?.premium_until ? new Date(String(profile.premium_until)) : null;
    const isPremiumActive =
      profile?.plan_type === "premium" &&
      premiumUntil !== null &&
      !Number.isNaN(premiumUntil.getTime()) &&
      premiumUntil.getTime() > Date.now();

    const mealsPerDay = Number(includeLunch) + Number(includeDinner);
    const estimatedMinBudget = estimateMinimumBudget(days, mealsPerDay, people, complexity);
    const budgetWarning =
      budget !== null && budget < estimatedMinBudget
        ? "Il budget inserito potrebbe non coprire il periodo selezionato."
        : null;

    const keyObj = {
      model,
      startDateIso,
      endDateIso,
      days,
      includeLunch,
      includeDinner,
      people,
      budget,
      complexity,
      notes,
      diet,
      lactoseFree,
      avoid,
      allergies,
      pantryItems: availableItems.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        expiryDate: it.expiryDate,
      })),
    };
    const cacheKey = stableStringify(keyObj);

    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < TTL_MS) {
      return res.status(200).json({ ...cached.value, cached: true });
    }

    const existing = inflight.get(cacheKey);
    if (existing) {
      const value = await existing;
      return res.status(200).json({ ...value, deduped: true });
    }

    let creditUsage: any = null;
    let remainingAfterConsume: number | null = null;

    if (!isPremiumActive) {
      const { data: consumeData, error: creditErr } = await supabase.rpc("consume_eco_generation");
      if (creditErr) {
        if (String(creditErr.message || "").includes("NO_CREDITS")) {
          return res.status(402).json({
            error: "NO_CREDITS",
            message: "Crediti EcoChef esauriti. Acquista un pacchetto crediti per continuare.",
          });
        }
        return res.status(500).json({ error: creditErr.message });
      }

      creditUsage = consumeData ?? null;
      remainingAfterConsume =
        typeof creditUsage?.remainingCredits === "number" ? creditUsage.remainingCredits : null;
    }

    const rules: string[] = [];
    rules.push(`Diet: ${diet}.`);
    rules.push(`Lactose-free: ${lactoseFree ? "YES" : "NO"}.`);
    if (avoid.length) rules.push(`Avoid ingredients: ${avoid.join(", ")}.`);
    if (allergies.length) rules.push(`Allergies: ${allergies.join(", ")}.`);

let styleInstructions = `
- Obiettivo principale: equilibrio e varietà.
- Mantieni una buona distribuzione tra carboidrati, proteine e verdure.
- Alterna frequentemente gli ingredienti.
`;

if (style === "light") {
  styleInstructions = `
- Obiettivo principale: leggerezza.
- Privilegia piatti leggeri e facilmente digeribili.
- Limita salumi, formaggi grassi, fritti e preparazioni pesanti.
- Preferisci verdure, pesce magro, legumi e cereali integrali.
- Evita guanciale, pancetta, salsiccia e ingredienti molto grassi come protagonisti.
`;
}

if (style === "protein") {
  styleInstructions = `
- Obiettivo principale: apporto proteico elevato.
- Ogni pasto deve contenere una fonte proteica importante.
- Alterna pesce, carne magra, uova, legumi e proteine vegetali.
`;
}

if (style === "budget") {
  styleInstructions = `
- Obiettivo principale: contenere i costi.
- Prediligi ingredienti economici.
- Riduci il numero di ingredienti da acquistare.
- Mantieni comunque varietà e qualità.
`;
}

if (style === "vegetarian") {
  styleInstructions = `
- Obiettivo principale: alimentazione vegetariana.
- Non usare carne o pesce.
- Alterna legumi, uova, latticini se consentiti e proteine vegetali.
`;
}

if (style === "antiwaste") {
  styleInstructions = `
- Obiettivo principale: ridurre gli sprechi.
- Dai maggiore priorità alla dispensa.
- Utilizza gli ingredienti prossimi alla scadenza quando coerenti.
- Mantieni comunque varietà e qualità dei pasti.
`;
}

    const prompt = `
Agisci come un meal planner esperto di cucina sostenibile, anti-spreco e organizzazione dei pasti.

MISSIONE:
- Devi comportarti come un meal planner professionista.
- Il tuo obiettivo è creare un piano alimentare utile, realistico, vario e piacevole.
- Il piano deve sembrare pensato per una persona reale, non generato in modo automatico.
- Devi combinare organizzazione dei pasti, gusto, semplicità, equilibrio e riduzione degli sprechi.

OBIETTIVO:
- Genera un piano pasti di ${days} giorni.
- Il piano inizia il ${startDateIso} e termina il ${endDateIso}.
- Prevedi ${includeLunch ? "pranzo" : ""}${includeLunch && includeDinner ? " e " : ""}${includeDinner ? "cena" : ""}.
- Il piano è per ${people} persone.

PROCESSO DECISIONALE OBBLIGATORIO:
1. Analizza prima le note dell'utente.
2. Analizza dieta, allergie, intolleranze e ingredienti da evitare.
3. Analizza lo stile del piano selezionato.
4. Progetta la struttura generale dei giorni.
5. Definisci prima il tipo di pasto: primo, secondo, piatto unico, zuppa, insalata completa o altro.
6. Solo dopo scegli le ricette.
7. Solo alla fine confronta le ricette con la dispensa.
8. Non partire mai dalla dispensa per decidere i piatti, salvo stile Anti-spreco.

STILE DEL PIANO:
${styleInstructions}

REGOLA SULLO STILE:
- Lo stile selezionato deve guidare tutto il piano.
- Se lo stile è "light", evita piatti pesanti anche se gli ingredienti sono disponibili.
- Se lo stile è "antiwaste", puoi dare più importanza alla dispensa, ma senza usare ingredienti scaduti.
- Se lo stile è "protein", ogni pasto deve contenere una fonte proteica chiara.
- Se lo stile è "budget", scegli ingredienti economici ma non rendere il piano monotono.
- Se lo stile è "vegetarian", non usare carne o pesce.

FILOSOFIA DEL PIANO:
- Il piano deve essere prima di tutto coerente con le preferenze, le note e l'obiettivo alimentare dell'utente.
- La dispensa serve DOPO per capire cosa è già disponibile e cosa manca.
- La dispensa NON deve guidare la scelta dei piatti.
- Non modificare un piano leggero, equilibrato o richiesto dall'utente solo per forzare l'uso di ingredienti presenti in dispensa.
- Se un ingrediente in dispensa non è coerente con le note utente, ignoralo.
- Se un ingrediente in scadenza non è coerente con il piano, ignoralo.
- Gli ingredienti disponibili devono essere usati solo quando migliorano o completano il piano senza snaturarlo.

PRIORITÀ (in ordine di importanza):
1. Rispetta sempre le richieste dell'utente e le note inserite.
2. Rispetta dieta, allergie, intolleranze e ingredienti da evitare.
3. Crea un piano realistico, equilibrato, sano e vario.
4. Rispetta la struttura dei pasti richiesta dall'utente.
5. Evita ripetizioni e monotonia.
6. Usa la dispensa solo se compatibile con il piano.
7. Dai priorità agli ingredienti prossimi alla scadenza solo se coerenti.
8. Mantieni il budget richiesto quando possibile.

REGOLE DI VARIETÀ:
- Ogni giorno deve essere diverso dal precedente.
- Non ripetere lo stesso piatto durante il piano.
- Non proporre sempre la stessa categoria di piatto.
- Non ripetere troppo spesso lo stesso ingrediente principale.
- Alterna fonti proteiche, cereali, verdure e contorni.
- Alterna metodi di cottura: vapore, forno, padella leggera, bollitura, crudo quando adatto.
- Se la dispensa non consente sufficiente varietà, aggiungi ingredienti mancanti nella lista della spesa.
- La varietà, la leggerezza e il rispetto delle preferenze hanno priorità rispetto al riuso della dispensa.

CONTROLLO MONOTONIA:
- Verifica quante volte compaiono gli stessi ingredienti principali.
- Non usare lo stesso cereale o formato di pasta troppo spesso.
- Non usare la stessa fonte proteica in giorni consecutivi, se evitabile.
- Non proporre sempre pasta, riso o couscous come unica soluzione per il pranzo.
- Alterna piatti caldi, freddi, zuppe, cereali, legumi, verdure e secondi.

REGOLE SULLE NOTE UTENTE:
- Le note utente sono vincolanti.
- Se l'utente scrive "voglio mangiare leggero", evita piatti pesanti, salumi, fritti, preparazioni ricche di grassi e condimenti eccessivi.
- Se l'utente scrive "primo a pranzo e secondo a cena", il pranzo deve essere un primo piatto e la cena deve essere un secondo con contorno.
- Se l'utente chiede pasti semplici, proponi ricette semplici.
- Se l'utente chiede pasti economici, usa ingredienti economici.
- Se l'utente indica un obiettivo alimentare, rispettalo più della dispensa.

PASTI LEGGERI:
Se l'utente richiede pasti leggeri:
- privilegia verdure, legumi, cereali integrali, pesce magro, carni magre, uova leggere o alternative vegetali;
- limita salumi, guanciale, pancetta, panna, burro, formaggi grassi, fritti e salse pesanti;
- usa cotture semplici come vapore, forno, padella antiaderente, bollitura o crudo;
- usa condimenti moderati;
- evita piatti chiaramente pesanti anche se gli ingredienti sono presenti in dispensa.
- In un piano leggero, salumi come guanciale, pancetta, speck e salsiccia non devono essere ingredienti principali.
- Possono essere usati solo se l'utente li richiede esplicitamente.
- Se sono presenti in dispensa ma l'utente chiede leggerezza, ignorali.

STRUTTURA DEI PASTI:
- Se è richiesto un primo a pranzo, proponi primi piatti coerenti: pasta, riso, cereali, zuppe, minestre, cous cous o piatti equivalenti.
- Se è richiesto un secondo a cena, proponi secondi coerenti: pesce, carne magra, uova, legumi, tofu, formaggi leggeri se compatibili, sempre con contorno.
- Non proporre un salume saltato o un ingrediente singolo come piatto principale.
- Ogni pasto deve avere senso come ricetta completa.

LOGICA DI COSTRUZIONE DEL MENU:
- Prima costruisci il menu ideale.
- Poi valuta cosa è disponibile in dispensa.
- Ogni pranzo deve avere una funzione chiara: primo leggero, piatto unico, zuppa, cereale con verdure o alternativa coerente.
- Ogni cena deve avere una fonte proteica chiara e un contorno.
- Pranzo e cena dello stesso giorno non devono essere entrambi pesanti.
- Evita che pranzo e cena dello stesso giorno usino lo stesso ingrediente principale.

LOGICA DI COSTRUZIONE DEL MENU:
- Prima scegli la struttura del menu in base alle note dell'utente.
- Solo dopo scegli le ricette.
- Solo dopo confronta le ricette con la dispensa.
- Non partire mai dagli ingredienti della dispensa per decidere il piatto.
- Per ogni giorno crea una combinazione equilibrata tra carboidrati, proteine e verdure.
- Se il pranzo è un primo, deve essere un primo completo ma leggero.
- Se la cena è un secondo, deve includere sempre una fonte proteica e un contorno.
- Evita che pranzo e cena dello stesso giorno siano entrambi pesanti.
- Evita che pranzo e cena dello stesso giorno usino lo stesso ingrediente principale.
- Se un ingrediente pesante è in dispensa, può essere usato solo in piccola quantità e solo se coerente con le note utente.

ANTI-SPRECO:
- Non usare mai ingredienti scaduti.
- Usa quando possibile gli ingredienti prossimi alla scadenza, ma solo se coerenti con il piano.
- Evita acquisti inutili, ma non compromettere qualità, varietà e obiettivo alimentare.
- Non sacrificare un piano leggero o equilibrato per consumare ingredienti pesanti presenti in dispensa.

USO CORRETTO DELLA DISPENSA:
- La dispensa serve a indicare cosa è già disponibile, non a decidere il piano.
- Usa un ingrediente della dispensa solo se è coerente con stile, note e obiettivo del piano.
- Se un ingrediente disponibile è pesante e lo stile è leggero, ignoralo.
- Gli ingredienti in scadenza sono utili, ma non devono peggiorare qualità, leggerezza o varietà.
- IngredientsUsed deve contenere solo ingredienti realmente presenti nella dispensa disponibile.
- MissingIngredients deve contenere solo ingredienti non presenti o insufficienti.
- Lo stesso ingrediente non può comparire sia in IngredientsUsed che in MissingIngredients.

VINCOLI:
- Complessità: ${complexity}
- Budget inserito: ${budget != null ? `${budget} €` : "non specificato"}
- Budget minimo stimato: ${estimatedMinBudget} €
- ${rules.join(" ")}
${notes ? `- Note utente: ${notes}` : ""}

DISPENSA DISPONIBILE:
${formatPantryItems(availableItems)}

INGREDIENTI IN SCADENZA A BREVE:
${formatPantryItems(expiringSoonItems)}

INGREDIENTI SCADUTI (NON USARLI MAI):
${expiredItems.length ? formatPantryItems(expiredItems) : "Nessuno"}

REGOLE IMPORTANTI:
- Se diet = veg: niente carne e niente pesce.
- Se diet = vegan: niente ingredienti di origine animale.
- Se lactose-free = YES: evita ingredienti con lattosio.
- Non usare ingredienti presenti in "Avoid ingredients".
- Non usare ingredienti presenti in "Allergies".
- Non usare ingredienti scaduti anche se sarebbero perfetti per la ricetta.
- IngredientsUsed deve contenere SOLO ingredienti realmente presenti nella DISPENSA DISPONIBILE e realmente usati nella ricetta.
- MissingIngredients deve contenere gli ingredienti necessari alla ricetta che non sono presenti in dispensa o sono presenti in quantità insufficiente.
- MissingIngredients deve essere pensato come una vera lista della spesa.
- Per ingredienti normalmente acquistati a peso (carne, pesce, pasta, riso, verdure, legumi, formaggi) indica quantità e unità.
- Per ingredienti normalmente acquistati a confezione, mazzetto o come dispensa base (basilico, prezzemolo, rosmarino, salvia, spezie, sale, pepe, olio, aceto, limone, aglio, cipolla e condimenti comuni) indica preferibilmente solo il nome.
- Evita quantità irrealistiche come "basilico 10 g" o "sale 3 g".
- Ragiona come una persona che deve realmente fare la spesa.
- Se un ingrediente è presente solo tra gli scaduti, consideralo NON disponibile e inseriscilo in missingIngredients se serve.
- Le ricette devono essere realistiche, semplici da eseguire e coerenti con il numero di persone.
- Non inserire pasti vuoti nei giorni richiesti.
- Non scrivere testo fuori dal JSON.

QUALITÀ GASTRONOMICA:
- Evita nomi troppo generici come "Pasta al pomodoro", "Riso con verdure", "Pollo con insalata".
- Preferisci nomi più curati ma semplici, come "Spaghetti integrali con pomodorini arrosto e basilico" o "Petto di pollo al limone con zucchine grigliate".
- Le ricette devono sembrare appetitose, realistiche e facili da cucinare.
- Usa erbe aromatiche, spezie leggere e abbinamenti mediterranei quando coerenti.
- Non inventare piatti strani o poco credibili.

REGOLE SUI PASSAGGI:
- Ogni ricetta deve avere passaggi chiari e pratici.
- I passaggi devono accompagnare l'utente dall'inizio alla fine.
- Indica tempi, cotture, fiamma, temperatura o consistenza quando utile.
- Evita passaggi generici come "cuoci tutto" o "prepara la ricetta".
- L'utente deve poter cucinare seguendo solo gli steps.

CONTROLLO QUALITÀ DEL PIANO:
Prima di generare il JSON verifica che:
- Il piano sia coerente con lo stile selezionato.
- I pasti siano realistici e appetitosi.
- I piatti non siano troppo banali.
- Le fonti proteiche siano ben distribuite.
- Le verdure siano variate.
- Non ci siano ripetizioni inutili.
- Il piano sembri creato da un vero meal planner professionista.
- La dispensa sia usata come supporto e non come motore principale del piano.
- MissingIngredients rappresenti una lista della spesa realistica.

VALIDAZIONE FINALE:
Prima di restituire il JSON verifica che:
1. Il piano rispetti le note dell'utente.
2. Il piano rispetti lo stile selezionato.
3. I pasti siano realistici e cucinabili.
4. Le ricette siano appetitose e non banali.
5. Le proteine siano distribuite bene.
6. Le verdure siano presenti e variate.
7. Non ci siano ripetizioni inutili.
8. Nessun ingrediente scaduto sia usato.
9. Nessun ingrediente compaia sia in IngredientsUsed che in MissingIngredients.
10. IngredientsUsed contenga solo ingredienti realmente presenti in dispensa.
11. MissingIngredients rappresenti una lista della spesa realistica.
12. Il piano sembri creato da un vero meal planner professionista.

Se uno di questi controlli fallisce, correggi il piano prima di generare il JSON.

OUTPUT OBBLIGATORIO:
Restituisci SOLO un JSON object valido, con questa struttura esatta:
{
  "plan": [
    {
      "day": 1,
      "meals": {
        ${includeLunch ? `"lunch": {
          "title": "...",
          "difficulty": "Facile|Media|Difficile",
          "time": "es. 30 min",
          "servings": ${people},
          "description": "...",
          "ingredientsUsed": [{"name":"...", "quantity": 1, "unit":"g|kg|l|ml|pz"}],
          "missingIngredients": [{"name":"...", "quantity": 1, "unit":"g|kg|l|ml|pz"}],
          "steps": ["..."]
        }${includeDinner ? "," : ""}` : ""}
        ${includeDinner ? `"dinner": {
          "title": "...",
          "difficulty": "Facile|Media|Difficile",
          "time": "es. 35 min",
          "servings": ${people},
          "description": "...",
          "ingredientsUsed": [{"name":"...", "quantity": 1, "unit":"g|kg|l|ml|pz"}],
          "missingIngredients": [{"name":"...", "quantity": 1, "unit":"g|kg|l|ml|pz"}],
          "steps": ["..."]
        }` : ""}
      }
    }
  ]
}
`.trim();

    const work = (async () => {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, input: prompt }),
      });

      const data = await r.json();

      if (!r.ok) {
        console.error("OpenAI meal-plan error:", data);

        const refundReason = `openai_meal_plan_error_${r.status}`;
        const { data: refunded, error: refundErr } = !isPremiumActive
          ? await supabase.rpc("refund_eco_generation", {
              p_consumed_credit: Boolean(creditUsage?.consumedCredit),
              p_reason: refundReason,
            })
          : { data: null, error: null };

        const errType = data?.error?.type;
        const status = r.status;

        return {
          error: data?.error ?? data,
          status,
          hint:
            status === 429 && errType === "insufficient_quota"
              ? "Quota/billing API non attivo o crediti esauriti su OpenAI Platform."
              : undefined,
          remainingCredits:
            typeof refunded?.remainingCredits === "number" ? refunded.remainingCredits : remainingAfterConsume ?? null,
          refunded: refundErr ? false : true,
        };
      }

      let text: string = data?.output_text ?? "";
      if (!text && Array.isArray(data?.output)) {
        const parts: string[] = [];
        for (const item of data.output) {
          const content = item?.content;
          if (!Array.isArray(content)) continue;
          for (const c of content) {
            if (c?.type === "output_text" && typeof c?.text === "string") parts.push(c.text);
          }
        }
        text = parts.join("");
      }

      if (!text) {
        console.error("OpenAI meal-plan returned empty text:", data);
        return {
          warning: budgetWarning,
          estimatedMinBudget,
          startDate: startDateParsed.display,
          startDateIso,
          endDate: endDateIso,
          plan: [],
          shoppingListPreview: [],
          pantryCoverage: {
            usedPantryIngredients: [],
            missingPantryIngredients: [],
          },
          raw: data,
          remainingCredits: typeof remainingAfterConsume === "number" ? remainingAfterConsume : null,
        };
      }

      try {
        let cleaned = String(text).trim();
        cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
        cleaned = cleaned.replace(/\s*```$/i, "").trim();

        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleaned = cleaned.slice(firstBrace, lastBrace + 1);
        }

        const parsed = JSON.parse(cleaned);
        const aiPlan = sanitizePlan(parsed?.plan, people, days, includeLunch, includeDinner);
        const correctedPlan = recalculateMissingIngredients(aiPlan, availableItems);
        const shoppingListPreview = aggregateShoppingList(correctedPlan);
        const pantryCoverage = buildPantryCoverage(correctedPlan, availableItems);

        await supabase
          .from("meal_plans")
          .update({ status: "archived" })
          .eq("user_id", user_id)
          .eq("status", "active");

        const { data: savedPlan, error: saveErr } = await supabase
          .from("meal_plans")
          .insert({
            user_id,
            start_date: startDateIso,
            end_date: endDateIso,
            days,
            meals: {
              lunch: includeLunch,
              dinner: includeDinner,
            },
            people,
            budget,
            complexity,
            notes: notes || null,
            warning: budgetWarning,
            estimated_min_budget: estimatedMinBudget,
            plan_json: correctedPlan,
            shopping_list_json: shoppingListPreview,
            pantry_coverage_json: pantryCoverage,
            status: "active",
          })
          .select("id, start_date, end_date, days, meals, people, budget, complexity, notes, warning, estimated_min_budget, plan_json, shopping_list_json, pantry_coverage_json, status, created_at, updated_at")
          .single();

        if (saveErr) {
          console.error("Meal plan save error:", saveErr);
          throw new Error(saveErr.message);
        }

        return {
          id: savedPlan.id,
          warning: budgetWarning,
          estimatedMinBudget,
          startDate: startDateParsed.display,
          startDateIso,
          endDate: endDateIso,
          plan: correctedPlan,
          shoppingListPreview,
          pantryCoverage,
          status: savedPlan.status,
          createdAt: savedPlan.created_at,
          updatedAt: savedPlan.updated_at,
          remainingCredits: typeof remainingAfterConsume === "number" ? remainingAfterConsume : null,
        };
      } catch (e: any) {
        console.error("Meal-plan JSON/save failed. Raw text:", text, e);
        return {
          warning: budgetWarning,
          estimatedMinBudget,
          startDate: startDateParsed.display,
          startDateIso,
          endDate: endDateIso,
          plan: [],
          shoppingListPreview: [],
          pantryCoverage: {
            usedPantryIngredients: [],
            missingPantryIngredients: [],
          },
          parse_error: true,
          text,
          error: e?.message ?? null,
          remainingCredits: typeof remainingAfterConsume === "number" ? remainingAfterConsume : null,
        };
      }
    })();

    inflight.set(cacheKey, work);
    const value = await work.finally(() => inflight.delete(cacheKey));

    cache.set(cacheKey, { ts: Date.now(), value });
    pruneCache();

    if (value?.error && typeof value?.status === "number") {
      return res.status(value.status).json(value);
    }

    return res.status(200).json({ ...value, cached: false });
  } catch (e: any) {
    console.error("meal-plan api error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}