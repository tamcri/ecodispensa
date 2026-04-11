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

function parseStartDateDDMMYYYY(value: unknown): { iso: string; date: Date } | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
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

  return { iso, date };
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

    const startDateParsed = parseStartDateDDMMYYYY(body.startDate);
    if (!startDateParsed) {
      return res.status(400).json({ error: "Invalid startDate. Expected format: DD-MM-YYYY" });
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
      .select("diet, lactose_free, avoid, allergies")
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

    const { data: remainingAfterConsume, error: creditErr } = await supabase.rpc("consume_eco_credit");
    if (creditErr) {
      if (String(creditErr.message || "").includes("NO_CREDITS")) {
        return res.status(402).json({
          error: "NO_CREDITS",
          message: "Crediti EcoChef esauriti. Acquista un pacchetto crediti per continuare.",
        });
      }
      return res.status(500).json({ error: creditErr.message });
    }

    const rules: string[] = [];
    rules.push(`Diet: ${diet}.`);
    rules.push(`Lactose-free: ${lactoseFree ? "YES" : "NO"}.`);
    if (avoid.length) rules.push(`Avoid ingredients: ${avoid.join(", ")}.`);
    if (allergies.length) rules.push(`Allergies: ${allergies.join(", ")}.`);

    const prompt = `
Agisci come un meal planner esperto di cucina sostenibile, anti-spreco e organizzazione dei pasti.

OBIETTIVO:
- Genera un piano pasti di ${days} giorni.
- Il piano inizia il ${startDateIso} e termina il ${endDateIso}.
- Prevedi ${includeLunch ? "pranzo" : ""}${includeLunch && includeDinner ? " e " : ""}${includeDinner ? "cena" : ""}.
- Il piano è per ${people} persone.
- Riutilizza il più possibile gli ingredienti già presenti in dispensa.
- Dai priorità ancora più alta agli ingredienti in scadenza a breve.
- Non usare mai ingredienti scaduti.
- Riduci sprechi, costi e numero di ingredienti da comprare.
- Favorisci il riuso degli stessi ingredienti tra più pasti.

VINCOLI:
- Complessità: ${complexity}
- Budget inserito: ${budget != null ? `${budget} €` : "non specificato"}
- Budget minimo stimato: ${estimatedMinBudget} €
- ${rules.join(" ")}
${notes ? `- Note utente: ${notes}` : ""}

DISPENSA DISPONIBILE:
${formatPantryItems(availableItems)}

INGREDIENTI IN SCADENZA A BREVE (DA PRIORITIZZARE):
${formatPantryItems(expiringSoonItems)}

INGREDIENTI SCADUTI (NON USARLI MAI):
${expiredItems.length ? formatPantryItems(expiredItems) : "Nessuno"}

REGOLE IMPORTANTI:
- Se diet = veg: niente carne e niente pesce.
- Se diet = vegan: niente ingredienti di origine animale.
- Se lactose-free = YES: evita ingredienti con lattosio.
- Non usare ingredienti presenti in "Avoid ingredients".
- Non usare ingredienti presenti in "Allergies".
- IngredientsUsed deve contenere gli ingredienti realmente usati dalla ricetta con quantità e unità.
- Le ricette devono essere realistiche, semplici da eseguire e coerenti con il numero di persone.
- Non inserire pasti vuoti nei giorni richiesti.
- Non scrivere testo fuori dal JSON.
- Anche se un ingrediente esiste solo tra gli scaduti, consideralo NON disponibile.

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
        const { data: refunded, error: refundErr } = await supabase.rpc("refund_eco_credit", {
          p_reason: refundReason,
        });

        const errType = data?.error?.type;
        const status = r.status;

        return {
          error: data?.error ?? data,
          status,
          hint:
            status === 429 && errType === "insufficient_quota"
              ? "Quota/billing API non attivo o crediti esauriti su OpenAI Platform."
              : undefined,
          remainingCredits: typeof refunded === "number" ? refunded : remainingAfterConsume ?? null,
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
          startDate: body.startDate,
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
          startDate: body.startDate,
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
          startDate: body.startDate,
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