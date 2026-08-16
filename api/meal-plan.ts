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
  const canonical = canonicalizeConcreteIngredientName(name);
  const normalized = normalizeIngredientName(canonical);
  const singular = singularizeItalianFoodName(canonical);
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

function isPantryBasicIngredient(name: string): boolean {
  const normalized = normalizeIngredientName(name);

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
    "alloro",
    "curry",
    "peperoncino",
    "timo",
    "maggiorana",
    "cumino",
    "coriandolo in polvere",
    "erbe aromatiche",
  ];

  return pantryBasics.some(
    (basic) =>
      normalized === basic ||
      normalized.startsWith(`${basic} `) ||
      normalized.includes(` ${basic} `)
  );
}

function canonicalizeConcreteIngredientName(name: string): string {
  const normalized = normalizeIngredientName(name);

  if (
    normalized === "succo di limone" ||
    normalized === "succo del limone" ||
    normalized === "succo limone"
  ) {
    return "limone";
  }

  if (
    normalized === "succo di lime" ||
    normalized === "succo del lime" ||
    normalized === "succo lime"
  ) {
    return "lime";
  }

  const canonicalNames: Record<string, string> = {
    peperoni: "peperone",
    zucchine: "zucchina",
    carote: "carota",
    melanzane: "melanzana",
    patate: "patata",
    cipolle: "cipolla",
    cetrioli: "cetriolo",
    uova: "uovo",
    "uova fresche": "uovo",
    "uovo fresco": "uovo",
    "spinaci freschi": "spinaci",
    pomodori: "pomodoro",
    pomodorini: "pomodoro",
    "pomodori freschi": "pomodoro",
    "pomodoro fresco": "pomodoro",
    "pomodori ciliegini": "pomodoro",
    "pomodorini freschi": "pomodoro",
    "basilico fresco": "basilico",
    "prezzemolo fresco": "prezzemolo",
    "rosmarino fresco": "rosmarino",
    "erbe aromatiche fresche": "erbe aromatiche",
    "olio d'oliva": "olio d'oliva",
    "olio di oliva": "olio d'oliva",
    "olio extravergine": "olio d'oliva",
    "olio extravergine d'oliva": "olio d'oliva",
    "olio extravergine di oliva": "olio d'oliva",
    "olio evo": "olio d'oliva",
  };

  return canonicalNames[normalized] ?? name.trim();
}

function isNonShoppingIngredient(name: string): boolean {
  const normalized = normalizeIngredientName(name);

  return (
    normalized === "acqua" ||
    normalized === "acqua calda" ||
    normalized === "acqua fredda" ||
    normalized === "acqua di cottura" ||
    normalized.startsWith("acqua per ")
  );
}

function normalizeProducePieceToWeight(
  name: string,
  quantity: number,
  unit: string
): { quantity: number; unit: string } | null {
  if (normalizeUnit(unit) !== "pz") return null;

  const normalized = normalizeIngredientName(canonicalizeConcreteIngredientName(name));
  const gramsPerPiece: Record<string, number> = {
    carota: 100,
    zucchina: 150,
    peperone: 150,
    melanzana: 300,
    patata: 150,
    cetriolo: 200,
  };

  const grams = gramsPerPiece[normalized];
  if (!grams) return null;

  return {
    quantity: Number((Math.max(1, quantity) * grams).toFixed(2)),
    unit: "g",
  };
}

function isPieceIngredient(name: string): boolean {
  const normalized = singularizeItalianFoodName(name);

  const pieceIngredients = [
    "limone",
    "lime",
    "aglio",
    "cipolla",
    "scalogno",
    "cetriolo",
    "avocado",
  ];

  return pieceIngredients.some(
    (ingredient) =>
      normalized === ingredient ||
      normalized.startsWith(`${ingredient} `) ||
      normalized.includes(` ${ingredient} `)
  );
}

function isStrictAntiWasteRepurchaseIngredient(name: string): boolean {
  const normalized = normalizeIngredientName(
    canonicalizeConcreteIngredientName(name)
  );

  const strictKeywords = [
    "pollo",
    "tacchino",
    "manzo",
    "vitello",
    "maiale",
    "salmone",
    "sgombro",
    "merluzzo",
    "orata",
    "branzino",
    "tonno",
    "pesce",
    "uovo",
    "tofu",
    "tempeh",
    "seitan",
  ];

  return strictKeywords.some((keyword) => normalized.includes(keyword));
}

function shouldNeverBeMicroWeight(name: string): boolean {
  const normalized = normalizeIngredientName(name);

  const keywords = [
    "carot",
    "peperon",
    "zucchin",
    "cetriol",
    "sedano",
    "pomodor",
    "broccol",
    "spinac",
    "insalat",
    "patat",
    "pollo",
    "tacchin",
    "manzo",
    "vitello",
    "maiale",
    "salmone",
    "sgombro",
    "merluzzo",
    "tonno",
    "pesce",
    "ceci",
    "lenticch",
    "fagiol",
    "riso",
    "pasta",
    "spaghetti",
    "penne",
    "fusilli",
    "couscous",
    "quinoa",
    "farro",
    "orzo",
  ];

  return keywords.some((keyword) => normalized.includes(keyword));
}

function normalizePracticalShoppingIngredient(
  ingredient: MissingIngredient
): MissingIngredient {
  const name = canonicalizeConcreteIngredientName(ingredient.name);
  const unit = normalizeUnit(ingredient.unit);
  const quantity = Number(ingredient.quantity.toFixed(2));

  // Q.B. è riservato esclusivamente a condimenti, spezie ed erbe aromatiche.
  if (isPantryBasicIngredient(name)) {
    return {
      name,
      quantity: 1,
      unit: "qb",
    };
  }

  if (name === "limone" || name === "lime") {
    return {
      name,
      quantity: Math.max(1, Math.round(quantity || 1)),
      unit: "pz",
    };
  }

  const normalizedProducePiece = normalizeProducePieceToWeight(name, quantity, unit);
  if (normalizedProducePiece) {
    return {
      name,
      quantity: normalizedProducePiece.quantity,
      unit: normalizedProducePiece.unit,
    };
  }

  // Se l'AI usa impropriamente Q.B. per un ingrediente concreto,
  // lo trasformiamo in una quantità acquistabile realistica.
  if (unit === "qb" || unit === "q.b." || unit === "q.b") {
    if (isPieceIngredient(name)) {
      return {
        name,
        quantity: 1,
        unit: "pz",
      };
    }

    return {
      name,
      quantity: 100,
      unit: "g",
    };
  }

  // Corregge micro-quantità chiaramente irrealistiche solo per ingredienti
  // che normalmente non si usano o acquistano a singoli grammi.
  if (unit === "g" && quantity > 0 && quantity < 20) {
    if (isPieceIngredient(name)) {
      return {
        name,
        quantity: 1,
        unit: "pz",
      };
    }

    if (shouldNeverBeMicroWeight(name)) {
      return {
        name,
        quantity: 100,
        unit: "g",
      };
    }
  }

  return {
    name,
    quantity,
    unit,
  };
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
  aliases: string[];
  totalBaseQty: number;
  baseUnit: string;
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

function normalizePastaCookingSteps(recipe: MealPlanRecipe): MealPlanRecipe {
  const pastaTerms = [
    "pasta",
    "spaghetti",
    "linguine",
    "bucatini",
    "penne",
    "rigatoni",
    "fusilli",
    "farfalle",
    "orecchiette",
    "tagliatelle",
    "fettuccine",
    "mezze maniche",
    "paccheri",
    "tortiglioni",
  ];

  const ingredientNames = [...recipe.ingredientsUsed, ...recipe.missingIngredients]
    .map((ingredient) => normalizeIngredientName(ingredient.name));

  const hasPackagedPasta = ingredientNames.some((name) =>
    pastaTerms.some((term) => name === term || name.includes(term))
  );

  if (!hasPackagedPasta) return recipe;

  const normalizedSteps = recipe.steps.map((step) => {
    const lower = step.toLowerCase();
    const mentionsPasta = pastaTerms.some((term) => lower.includes(term));
    const mentionsCooking = /cuoc|boll|less|scol/.test(lower);
    const mentionsMinutes = /\b\d+\s*(?:-|–|a)?\s*\d*\s*minut/i.test(step);

    if (!mentionsPasta || !mentionsCooking || !mentionsMinutes) {
      return step;
    }

    let updated = step
      .replace(
        /(?:per\s+)?(?:circa\s+)?\d+\s*(?:-|–|a)\s*\d+\s*minuti?/gi,
        "seguendo i tempi indicati sulla confezione"
      )
      .replace(
        /(?:per\s+)?(?:circa\s+)?\d+\s*minuti?/gi,
        "seguendo i tempi indicati sulla confezione"
      )
      .replace(/\s+/g, " ")
      .trim();

    if (!updated.toLowerCase().includes("al dente")) {
      updated = updated.replace(/[.]?$/, " e scolala al dente.");
    }

    return updated;
  });

  return {
    ...recipe,
    steps: normalizedSteps,
  };
}

function normalizeTextForIngredientSearch(value: string): string {
  return normalizeIngredientName(value)
    .replace(/[^a-z0-9à-ÿ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stepMentionsPantryBasic(step: string, basic: string): boolean {
  const haystack = ` ${normalizeTextForIngredientSearch(step)} `;
  const needle = ` ${normalizeTextForIngredientSearch(basic)} `;
  return haystack.includes(needle);
}

function ingredientRepresentsPantryBasic(
  ingredientName: string,
  basic: string
): boolean {
  const normalized = normalizeIngredientName(ingredientName);
  const normalizedBasic = normalizeIngredientName(basic);

  return (
    normalized === normalizedBasic ||
    normalized.startsWith(`${normalizedBasic} `) ||
    normalized.includes(` ${normalizedBasic} `)
  );
}

function ensureStepPantryBasicsAreListed(
  recipe: MealPlanRecipe
): MealPlanRecipe {
  const pantryBasics = [
    "sale",
    "pepe",
    "olio",
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
    "alloro",
    "curry",
    "peperoncino",
    "timo",
    "maggiorana",
    "cumino",
    "coriandolo in polvere",
    "erbe aromatiche",
  ];

  const allIngredients = [
    ...recipe.ingredientsUsed,
    ...recipe.missingIngredients,
  ];

  const missingBasics: MissingIngredient[] = [];

  for (const basic of pantryBasics) {
    const mentionedInSteps = recipe.steps.some((step) =>
      stepMentionsPantryBasic(step, basic)
    );

    if (!mentionedInSteps) continue;

    const alreadyListed = allIngredients.some((ingredient) =>
      ingredientRepresentsPantryBasic(ingredient.name, basic)
    );

    if (!alreadyListed) {
      missingBasics.push({
        name: basic,
        quantity: 1,
        unit: "qb",
      });
    }
  }

  if (!missingBasics.length) {
    return recipe;
  }

  return {
    ...recipe,
    missingIngredients: [
      ...recipe.missingIngredients,
      ...missingBasics,
    ],
  };
}

function normalizeCommonItalianRecipeText(value: string): string {
  return value
    .replace(/\bomlette\b/gi, (match) =>
      match[0] === match[0]?.toUpperCase() ? "Omelette" : "omelette"
    )
    .replace(/\buna piatto\b/gi, (match) =>
      match[0] === match[0]?.toUpperCase() ? "Un piatto" : "un piatto"
    )
    .replace(/\bcuocere la penne\b/gi, "cuocere le penne")
    .replace(/\bcuoci la penne\b/gi, "cuoci le penne")
    .replace(/\bcuocere i penne\b/gi, "cuocere le penne")
    .replace(/\bcuoci i penne\b/gi, "cuoci le penne")
    .replace(/\bcondite con\b/gi, "condisci con");
}

function normalizeRecipeStepIngredientConsistency(
  recipe: MealPlanRecipe
): MealPlanRecipe {
  const allIngredients = [
    ...recipe.ingredientsUsed,
    ...recipe.missingIngredients,
  ];

  const hasIngredient = (name: string) =>
    allIngredients.some((ingredient) =>
      ingredientAliasesOverlap(ingredient.name, name)
    );

  const hasMixedSalad = allIngredients.some(
    (ingredient) =>
      normalizeIngredientName(
        canonicalizeConcreteIngredientName(ingredient.name)
      ) === "insalata mista"
  );

  const hasSpecificSaladIngredients =
    hasIngredient("lattuga") ||
    hasIngredient("pomodoro") ||
    hasIngredient("cetriolo");

  const hasHardCheese =
    hasIngredient("pecorino") ||
    hasIngredient("parmigiano") ||
    hasIngredient("grana");

  const optionalClauseMentionsListedIngredient = (value: string): boolean => {
    const haystack = ` ${normalizeTextForIngredientSearch(value)} `;

    return allIngredients.some((ingredient) =>
      buildIngredientAliases(ingredient.name).some((alias) => {
        const normalizedAlias = normalizeTextForIngredientSearch(alias);
        return (
          normalizedAlias.length >= 3 &&
          haystack.includes(` ${normalizedAlias} `)
        );
      })
    );
  };

  const removeUnlistedOptionalTail = (value: string): string => {
    const optionalTailMatch = value.match(
      /(?:,\s*)?((?:accompagnat[oaie]\s+da|con|aggiungendo|guarnendo\s+con)\s+.+?)\s+se\s+(?:lo\s+si\s+desidera|si\s+desidera|lo\s+desideri|desiderato|desiderata|vuoi|preferisci)\.?$/i
    );

    if (!optionalTailMatch) return value;

    const optionalClause = optionalTailMatch[1] ?? "";
    if (optionalClauseMentionsListedIngredient(optionalClause)) {
      return value;
    }

    const matchIndex = optionalTailMatch.index ?? value.length;
    const prefix = value
      .slice(0, matchIndex)
      .replace(/[\s,;:]+$/g, "")
      .replace(/[.!?]+$/g, "");

    return prefix ? `${prefix}.` : value;
  };

  const steps = recipe.steps.map((step) => {
    let updated = step;

    if (
      hasMixedSalad &&
      !hasSpecificSaladIngredients &&
      /insalata mista con lattuga,\s*pomodori(?:ni)?\s*e cetrioli/i.test(updated)
    ) {
      updated = updated.replace(
        /(?:preparare|prepara)\s+un['’]?insalata mista con lattuga,\s*pomodori(?:ni)?\s*e cetrioli/gi,
        "preparare l'insalata mista prevista negli ingredienti"
      );
    }

    if (!hasHardCheese) {
      updated = updated
        .replace(
          /\s+con una spolverata di (?:pecorino|parmigiano|grana)(?: grattugiato)? se (?:lo|si) desidera\.?$/i,
          "."
        )
        .replace(
          /\s+con (?:pecorino|parmigiano|grana)(?: grattugiato)? se (?:lo|si) desidera\.?$/i,
          "."
        );
    }

    updated = removeUnlistedOptionalTail(updated);

    return updated.replace(/\s+/g, " ").trim();
  });

  return {
    ...recipe,
    steps,
  };
}

function sanitizeRecipe(input: any, fallbackServings: number): MealPlanRecipe {
  const rawIngredientsUsed = Array.isArray(input?.ingredientsUsed) ? input.ingredientsUsed : [];
  const rawMissingIngredients = Array.isArray(input?.missingIngredients) ? input.missingIngredients : [];
  const rawSteps = Array.isArray(input?.steps) ? input.steps : [];

  const recipe: MealPlanRecipe = {
    title: normalizeCommonItalianRecipeText(
      cleanText(input?.title) ?? "Ricetta"
    ),
    difficulty: cleanText(input?.difficulty) ?? "Media",
    time: cleanText(input?.time) ?? "30 min",
    servings: Math.max(1, Math.round(toNumber(input?.servings, fallbackServings))),
    description: normalizeCommonItalianRecipeText(
      cleanText(input?.description) ?? ""
    ),
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
      .filter((step: string | null): step is string => Boolean(step))
      .map((step: string) => normalizeCommonItalianRecipeText(step)),
  };

  return normalizeRecipeStepIngredientConsistency(
    ensureStepPantryBasicsAreListed(
      normalizePastaCookingSteps(recipe)
    )
  );
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

function buildPantryAvailabilityMap(
  availablePantryItems: AvailablePantryItem[]
): PantryAvailabilityBucket[] {
  const buckets: PantryAvailabilityBucket[] = [];

  for (const item of availablePantryItems) {
    if (item.quantity <= 0) continue;

    const base = unitToBase(item.quantity, item.unit);
    const aliases = buildIngredientAliases(item.name);

    const existing = buckets.find(
      (bucket) =>
        bucket.baseUnit === base.unit &&
        bucket.aliases.some((alias) => aliases.includes(alias))
    );

    if (existing) {
      existing.totalBaseQty = Number((existing.totalBaseQty + base.qty).toFixed(2));
      existing.aliases = [...new Set([...existing.aliases, ...aliases])];
    } else {
      buckets.push({
        displayName: item.name,
        aliases,
        totalBaseQty: Number(base.qty.toFixed(2)),
        baseUnit: base.unit,
      });
    }
  }

  return buckets;
}

function recalculateMissingIngredients(
  plan: MealPlanDay[],
  availablePantryItems: AvailablePantryItem[]
): MealPlanDay[] {
  const pantryAvailability = buildPantryAvailabilityMap(availablePantryItems);

  const findPantryBucket = (
    ingredientName: string,
    baseUnit: string,
    ignoreUnit = false
  ): PantryAvailabilityBucket | undefined => {
    const aliases = buildIngredientAliases(ingredientName);

    return pantryAvailability.find(
      (bucket) =>
        (ignoreUnit || bucket.baseUnit === baseUnit) &&
        bucket.aliases.some((alias) => aliases.includes(alias))
    );
  };

  const buildRequiredIngredients = (recipe: MealPlanRecipe): MissingIngredient[] => {
    const required = new Map<string, MissingIngredient>();

    const register = (ingredient: MissingIngredient) => {
      const normalized = normalizePracticalShoppingIngredient(ingredient);

      if (isNonShoppingIngredient(normalized.name)) {
        return;
      }

      if (isPantryBasicIngredient(normalized.name)) {
        const key = `${singularizeItalianFoodName(normalized.name)}__qb`;
        if (!required.has(key)) {
          required.set(key, {
            name: normalized.name,
            quantity: 1,
            unit: "qb",
          });
        }
        return;
      }

      const base = unitToBase(normalized.quantity, normalized.unit);
      const key = `${singularizeItalianFoodName(normalized.name)}__${base.unit}`;
      const existing = required.get(key);

      if (!existing) {
        required.set(key, {
          name: normalized.name,
          quantity: Number(base.qty.toFixed(2)),
          unit: base.unit,
        });
        return;
      }

      // ingredientsUsed e missingIngredients rappresentano due quote distinte:
      // quella coperta dalla dispensa e quella ancora da acquistare.
      // Se lo stesso ingrediente compare in entrambe, la quantità totale richiesta
      // dalla ricetta è quindi la SOMMA delle due quote.
      existing.quantity = Number((existing.quantity + base.qty).toFixed(2));
    };

    recipe.ingredientsUsed.forEach(register);
    recipe.missingIngredients.forEach(register);

    return [...required.values()];
  };

  return plan.map((day) => {
    const clonedDay: MealPlanDay = {
      day: day.day,
      meals: {},
    };

    const processRecipe = (recipe?: MealPlanRecipe): MealPlanRecipe | undefined => {
      if (!recipe) return undefined;

      const requiredIngredients = buildRequiredIngredients(recipe);
      const pantryUsed: MealPlanRecipe["ingredientsUsed"] = [];
      const missing: MissingIngredient[] = [];

      for (const ingredient of requiredIngredients) {
        if (isPantryBasicIngredient(ingredient.name) || ingredient.unit === "qb") {
          const bucket = findPantryBucket(ingredient.name, "qb", true);

          if (bucket && bucket.totalBaseQty > 0) {
            pantryUsed.push({
              name: ingredient.name,
              quantity: 1,
              unit: "qb",
            });
          } else {
            missing.push({
              name: ingredient.name,
              quantity: 1,
              unit: "qb",
            });
          }

          continue;
        }

        const requiredBaseQty = ingredient.quantity;
        const baseUnit = ingredient.unit;
        const bucket = findPantryBucket(ingredient.name, baseUnit);

        const availableBaseQty = bucket ? Math.max(0, bucket.totalBaseQty) : 0;
        const usedBaseQty = Math.min(availableBaseQty, requiredBaseQty);
        const missingBaseQty = Math.max(0, requiredBaseQty - usedBaseQty);

        if (bucket && usedBaseQty > 0) {
          bucket.totalBaseQty = Number((bucket.totalBaseQty - usedBaseQty).toFixed(2));

          const usedDisplay = baseToDisplay(usedBaseQty, baseUnit);
          pantryUsed.push({
            name: ingredient.name,
            quantity: usedDisplay.qty,
            unit: usedDisplay.unit,
          });
        }

        if (missingBaseQty > 0) {
          const missingDisplay = baseToDisplay(missingBaseQty, baseUnit);
          missing.push({
            name: ingredient.name,
            quantity: missingDisplay.qty,
            unit: missingDisplay.unit,
          });
        }
      }

      return {
        ...recipe,
        ingredientsUsed: pantryUsed,
        missingIngredients: missing.map(normalizePracticalShoppingIngredient),
      };
    };

    clonedDay.meals.lunch = processRecipe(day.meals.lunch);
    clonedDay.meals.dinner = processRecipe(day.meals.dinner);

    return clonedDay;
  });
}

function normalizeShoppingAggregationIngredient(
  ingredient: MissingIngredient
): MissingIngredient {
  const normalized = normalizePracticalShoppingIngredient(ingredient);
  const canonicalName = normalizeIngredientName(
    canonicalizeConcreteIngredientName(normalized.name)
  );

  if (canonicalName === "cipolla" && normalizeUnit(normalized.unit) === "pz") {
    return {
      name: "cipolla",
      quantity: Number((normalized.quantity * 100).toFixed(2)),
      unit: "g",
    };
  }

  return normalized;
}

function aggregateShoppingList(plan: MealPlanDay[]): MissingIngredient[] {
  type ShoppingBucket = {
    name: string;
    totalBaseQty: number;
    baseUnit: string;
  };

  const aggregated = new Map<string, ShoppingBucket>();

  for (const day of plan) {
    const recipes = [day.meals.lunch, day.meals.dinner].filter(Boolean) as MealPlanRecipe[];

    for (const recipe of recipes) {
      for (const ingredient of recipe.missingIngredients) {
        const normalizedIngredient = normalizeShoppingAggregationIngredient(ingredient);

        if (isNonShoppingIngredient(normalizedIngredient.name)) {
          continue;
        }

        const canonicalName = singularizeItalianFoodName(
          canonicalizeConcreteIngredientName(normalizedIngredient.name)
        );

        if (
          normalizedIngredient.unit === "qb" ||
          isPantryBasicIngredient(normalizedIngredient.name)
        ) {
          const key = `${canonicalName}__qb`;

          if (!aggregated.has(key)) {
            aggregated.set(key, {
              name: normalizedIngredient.name,
              totalBaseQty: 1,
              baseUnit: "qb",
            });
          }

          continue;
        }

        const base = unitToBase(
          normalizedIngredient.quantity,
          normalizedIngredient.unit
        );
        const key = `${canonicalName}__${base.unit}`;
        const existing = aggregated.get(key);

        if (existing) {
          existing.totalBaseQty = Number(
            (existing.totalBaseQty + base.qty).toFixed(2)
          );
        } else {
          aggregated.set(key, {
            name: normalizedIngredient.name,
            totalBaseQty: Number(base.qty.toFixed(2)),
            baseUnit: base.unit,
          });
        }
      }
    }
  }

  return [...aggregated.values()]
    .map((bucket): MissingIngredient => {
      if (bucket.baseUnit === "qb") {
        return {
          name: bucket.name,
          quantity: 1,
          unit: "qb",
        };
      }

      const display = baseToDisplay(bucket.totalBaseQty, bucket.baseUnit);

      return {
        name: bucket.name,
        quantity: display.qty,
        unit: display.unit,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}

function buildShoppingAccountingMap(items: MissingIngredient[]): Map<string, number> {
  const totals = new Map<string, number>();

  for (const ingredient of items) {
    const normalized = normalizeShoppingAggregationIngredient(ingredient);

    if (isNonShoppingIngredient(normalized.name)) {
      continue;
    }

    const canonicalName = singularizeItalianFoodName(
      canonicalizeConcreteIngredientName(normalized.name)
    );

    if (normalized.unit === "qb" || isPantryBasicIngredient(normalized.name)) {
      totals.set(`${canonicalName}__qb`, 1);
      continue;
    }

    const base = unitToBase(normalized.quantity, normalized.unit);
    const key = `${canonicalName}__${base.unit}`;
    totals.set(key, Number(((totals.get(key) ?? 0) + base.qty).toFixed(2)));
  }

  return totals;
}

function validateShoppingListAccounting(
  plan: MealPlanDay[],
  shoppingList: MissingIngredient[]
): { valid: boolean; details: string[] } {
  const perRecipeMissing: MissingIngredient[] = [];

  for (const day of plan) {
    const recipes = [day.meals.lunch, day.meals.dinner].filter(Boolean) as MealPlanRecipe[];

    for (const recipe of recipes) {
      perRecipeMissing.push(...recipe.missingIngredients);
    }
  }

  const expected = buildShoppingAccountingMap(perRecipeMissing);
  const actual = buildShoppingAccountingMap(shoppingList);
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  const details: string[] = [];

  for (const key of keys) {
    const expectedQty = expected.get(key) ?? 0;
    const actualQty = actual.get(key) ?? 0;

    if (Math.abs(expectedQty - actualQty) > 0.01) {
      details.push(
        `${key}: expected ${expectedQty}, shopping list ${actualQty}`
      );
    }
  }

  return {
    valid: details.length === 0,
    details,
  };
}

type MealSlot = "lunch" | "dinner";

type MealPlanQualityIssue = {
  code:
    | "PANTRY_REPURCHASE"
    | "CONSECUTIVE_PANTRY_MAIN"
    | "REPEATED_PASTA_FORMAT";
  day: number;
  meal: MealSlot;
  ingredient: string;
  message: string;
};

function ingredientAliasesOverlap(a: string, b: string): boolean {
  const aliasesA = buildIngredientAliases(canonicalizeConcreteIngredientName(a));
  const aliasesB = buildIngredientAliases(canonicalizeConcreteIngredientName(b));
  return aliasesA.some((alias) => aliasesB.includes(alias));
}

function recipeContainsIngredient(
  recipe: MealPlanRecipe,
  ingredientName: string,
  source: "used" | "missing" | "any" = "any"
): boolean {
  const items =
    source === "used"
      ? recipe.ingredientsUsed
      : source === "missing"
        ? recipe.missingIngredients
        : [...recipe.ingredientsUsed, ...recipe.missingIngredients];

  return items.some((item) => ingredientAliasesOverlap(item.name, ingredientName));
}

function recipeTitleMentionsIngredient(
  recipe: MealPlanRecipe,
  ingredientName: string
): boolean {
  const title = normalizeIngredientName(recipe.title);
  const aliases = buildIngredientAliases(canonicalizeConcreteIngredientName(ingredientName));

  return aliases.some((alias) => {
    if (alias.length < 4) return false;
    return title === alias || title.includes(alias);
  });
}

function getPastaFormat(recipe: MealPlanRecipe): string | null {
  const pastaFormats = [
    "spaghetti",
    "linguine",
    "bucatini",
    "penne",
    "rigatoni",
    "fusilli",
    "farfalle",
    "orecchiette",
    "tagliatelle",
    "fettuccine",
    "mezze maniche",
    "paccheri",
    "tortiglioni",
    "pasta corta",
  ];

  const ingredients = [...recipe.ingredientsUsed, ...recipe.missingIngredients];

  for (const item of ingredients) {
    const normalized = normalizeIngredientName(item.name);
    const format = pastaFormats.find(
      (candidate) =>
        normalized === candidate ||
        normalized.startsWith(`${candidate} `) ||
        normalized.includes(` ${candidate} `)
    );
    if (format) return format;
  }

  return null;
}

function isColdPastaRecipe(recipe: MealPlanRecipe): boolean {
  const haystack = normalizeIngredientName(
    [
      recipe.title,
      recipe.description,
      ...recipe.steps,
    ].join(" ")
  );

  return (
    haystack.includes("pasta fredda") ||
    haystack.includes("insalata di pasta") ||
    haystack.includes("raffredd")
  );
}

function replacePastaFormatInText(
  value: string,
  fromFormat: string,
  toFormat: string
): string {
  const escaped = fromFormat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "gi");

  return value.replace(regex, (match) => {
    if (match[0] === match[0]?.toUpperCase()) {
      return toFormat.charAt(0).toUpperCase() + toFormat.slice(1);
    }
    return toFormat;
  });
}

function replacePastaFormatInRecipe(
  recipe: MealPlanRecipe,
  fromFormat: string,
  toFormat: string
): MealPlanRecipe {
  const replaceIngredient = <T extends { name: string; quantity: number; unit: string }>(
    ingredient: T
  ): T => ({
    ...ingredient,
    name: replacePastaFormatInText(
      ingredient.name,
      fromFormat,
      toFormat
    ),
  });

  return normalizePastaCookingSteps({
    ...recipe,
    title: replacePastaFormatInText(recipe.title, fromFormat, toFormat),
    description: replacePastaFormatInText(
      recipe.description,
      fromFormat,
      toFormat
    ),
    ingredientsUsed: recipe.ingredientsUsed.map(replaceIngredient),
    missingIngredients: recipe.missingIngredients.map(replaceIngredient),
    steps: recipe.steps.map((step) =>
      replacePastaFormatInText(step, fromFormat, toFormat)
    ),
  });
}

function applyDeterministicPastaFormatFallback(
  plan: MealPlanDay[],
  issues: MealPlanQualityIssue[]
): {
  plan: MealPlanDay[];
  applied: number;
  changes: string[];
} {
  const shortPastaFormats = [
    "penne",
    "rigatoni",
    "farfalle",
    "orecchiette",
    "mezze maniche",
    "paccheri",
    "tortiglioni",
    "fusilli",
  ];

  const allPastaFormats = [
    ...shortPastaFormats,
    "spaghetti",
    "linguine",
    "bucatini",
    "tagliatelle",
    "fettuccine",
  ];

  const clonedPlan: MealPlanDay[] = plan.map((day) => ({
    day: day.day,
    meals: {
      lunch: day.meals.lunch
        ? {
            ...day.meals.lunch,
            ingredientsUsed: day.meals.lunch.ingredientsUsed.map((item) => ({
              ...item,
            })),
            missingIngredients: day.meals.lunch.missingIngredients.map((item) => ({
              ...item,
            })),
            steps: [...day.meals.lunch.steps],
          }
        : undefined,
      dinner: day.meals.dinner
        ? {
            ...day.meals.dinner,
            ingredientsUsed: day.meals.dinner.ingredientsUsed.map((item) => ({
              ...item,
            })),
            missingIngredients: day.meals.dinner.missingIngredients.map((item) => ({
              ...item,
            })),
            steps: [...day.meals.dinner.steps],
          }
        : undefined,
    },
  }));

  const usedFormats = new Set<string>();

  for (const day of clonedPlan) {
    const recipes = [day.meals.lunch, day.meals.dinner].filter(
      Boolean
    ) as MealPlanRecipe[];

    for (const recipe of recipes) {
      const format = getPastaFormat(recipe);
      if (format) usedFormats.add(format);
    }
  }

  let applied = 0;
  const changes: string[] = [];

  const pastaIssues = issues
    .filter((issue) => issue.code === "REPEATED_PASTA_FORMAT")
    .sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day;
      return a.meal.localeCompare(b.meal);
    });

  for (const issue of pastaIssues) {
    const day = clonedPlan.find((item) => item.day === issue.day);
    const recipe = day?.meals[issue.meal];
    if (!recipe) continue;

    const currentFormat = getPastaFormat(recipe);
    if (!currentFormat) continue;

    const candidates = isColdPastaRecipe(recipe)
      ? shortPastaFormats
      : allPastaFormats;

    const replacement = candidates.find(
      (candidate) =>
        candidate !== currentFormat &&
        !usedFormats.has(candidate)
    );

    if (!replacement) continue;

    day!.meals[issue.meal] = replacePastaFormatInRecipe(
      recipe,
      currentFormat,
      replacement
    );

    usedFormats.add(replacement);
    applied += 1;
    changes.push(
      `Giorno ${issue.day} ${issue.meal}: ${currentFormat} -> ${replacement}`
    );
  }

  return {
    plan: clonedPlan,
    applied,
    changes,
  };
}

function analyzeMealPlanQualityIssues(
  plan: MealPlanDay[],
  availablePantryItems: AvailablePantryItem[],
  strictRepurchaseIngredientNames: string[] = []
): MealPlanQualityIssue[] {
  const issues: MealPlanQualityIssue[] = [];
  const seenIssueKeys = new Set<string>();

  const addIssue = (issue: MealPlanQualityIssue) => {
    const key = `${issue.code}__${issue.day}__${issue.meal}__${normalizeIngredientName(
      issue.ingredient
    )}`;

    if (seenIssueKeys.has(key)) return;
    seenIssueKeys.add(key);
    issues.push(issue);
  };

  // 1) Hard repurchase rule for selected protein-like pantry ingredients.
  // Ordinary versatile ingredients (for example tomato/vegetables) may be bought
  // again after pantry stock is used, without invalidating the whole plan.
  // Partial shortage in the SAME meal is not considered a repurchase.
  for (const pantryItem of availablePantryItems) {
    if (isPantryBasicIngredient(pantryItem.name)) continue;

    const isStrictRepurchaseIngredient = strictRepurchaseIngredientNames.some(
      (priorityName) =>
        ingredientAliasesOverlap(pantryItem.name, priorityName)
    );

    if (!isStrictRepurchaseIngredient) continue;

    let previouslyUsed = false;

    for (const day of plan) {
      const slots: MealSlot[] = ["lunch", "dinner"];

      for (const meal of slots) {
        const recipe = day.meals[meal];
        if (!recipe) continue;

        const usedHere = recipeContainsIngredient(recipe, pantryItem.name, "used");
        const missingHere = recipeContainsIngredient(recipe, pantryItem.name, "missing");

        if (missingHere && previouslyUsed && !usedHere) {
          addIssue({
            code: "PANTRY_REPURCHASE",
            day: day.day,
            meal,
            ingredient: pantryItem.name,
            message:
              `Giorno ${day.day} ${meal}: "${pantryItem.name}" era presente in dispensa, ` +
              `è già stato utilizzato nei pasti precedenti e ora viene ricomprato. ` +
              `Sostituisci questo pasto con un'alternativa che non richieda nuovo "${pantryItem.name}".`,
          });
        }

        if (usedHere) {
          previouslyUsed = true;
        }
      }
    }
  }

  // 2) Same pantry ingredient as recipe protagonist for 3 consecutive days.
  for (const pantryItem of availablePantryItems) {
    if (isPantryBasicIngredient(pantryItem.name)) continue;

    const daysWithMainIngredient = new Set<number>();
    const recipesByDay = new Map<number, { meal: MealSlot; recipe: MealPlanRecipe }[]>();

    for (const day of plan) {
      const slots: MealSlot[] = ["lunch", "dinner"];

      for (const meal of slots) {
        const recipe = day.meals[meal];
        if (!recipe) continue;

        if (
          recipeContainsIngredient(recipe, pantryItem.name, "any") &&
          recipeTitleMentionsIngredient(recipe, pantryItem.name)
        ) {
          daysWithMainIngredient.add(day.day);
          const existing = recipesByDay.get(day.day) ?? [];
          existing.push({ meal, recipe });
          recipesByDay.set(day.day, existing);
        }
      }
    }

    const sortedDays = [...daysWithMainIngredient].sort((a, b) => a - b);
    let streak: number[] = [];

    for (const dayNumber of sortedDays) {
      if (!streak.length || dayNumber === streak[streak.length - 1] + 1) {
        streak.push(dayNumber);
      } else {
        streak = [dayNumber];
      }

      if (streak.length >= 3) {
        const offendingDay = dayNumber;
        const candidates = recipesByDay.get(offendingDay) ?? [];

        for (const candidate of candidates) {
          addIssue({
            code: "CONSECUTIVE_PANTRY_MAIN",
            day: offendingDay,
            meal: candidate.meal,
            ingredient: pantryItem.name,
            message:
              `Giorno ${offendingDay} ${candidate.meal}: "${pantryItem.name}" è protagonista ` +
              `per almeno 3 giorni consecutivi. Sostituisci questo pasto per interrompere la monotonia.`,
          });
        }
      }
    }
  }

  // 3) Same pasta format repeated: keep the first occurrence, repair later ones.
  const firstPastaOccurrence = new Map<string, { day: number; meal: MealSlot }>();

  for (const day of plan) {
    const slots: MealSlot[] = ["lunch", "dinner"];

    for (const meal of slots) {
      const recipe = day.meals[meal];
      if (!recipe) continue;

      const pastaFormat = getPastaFormat(recipe);
      if (!pastaFormat) continue;

      const first = firstPastaOccurrence.get(pastaFormat);
      if (!first) {
        firstPastaOccurrence.set(pastaFormat, { day: day.day, meal });
        continue;
      }

      addIssue({
        code: "REPEATED_PASTA_FORMAT",
        day: day.day,
        meal,
        ingredient: pastaFormat,
        message:
          `Giorno ${day.day} ${meal}: il formato di pasta "${pastaFormat}" è già stato usato ` +
          `al giorno ${first.day}. Scegli un formato diverso o un altro tipo di primo.`,
      });
    }
  }

  return issues;
}

function formatMealPlanIssuesForRepair(issues: MealPlanQualityIssue[]): string {
  return issues.map((issue, index) => `${index + 1}. ${issue.message}`).join("\n");
}

type MealPlanRepairTarget = {
  day: number;
  meal: MealSlot;
  currentRecipe: MealPlanRecipe;
  problems: string[];
  forbiddenIngredients: string[];
  forbiddenPastaFormats: string[];
};

type MealPlanRepairReplacement = {
  day: number;
  meal: MealSlot;
  recipe: any;
};

function buildMealPlanRepairTargets(
  plan: MealPlanDay[],
  issues: MealPlanQualityIssue[]
): MealPlanRepairTarget[] {
  const grouped = new Map<
    string,
    {
      day: number;
      meal: MealSlot;
      problems: string[];
      forbiddenIngredients: Set<string>;
      forbiddenPastaFormats: Set<string>;
    }
  >();

  for (const issue of issues) {
    const key = `${issue.day}__${issue.meal}`;
    const existing = grouped.get(key) ?? {
      day: issue.day,
      meal: issue.meal,
      problems: [],
      forbiddenIngredients: new Set<string>(),
      forbiddenPastaFormats: new Set<string>(),
    };

    existing.problems.push(issue.message);

    if (
      issue.code === "PANTRY_REPURCHASE" ||
      issue.code === "CONSECUTIVE_PANTRY_MAIN"
    ) {
      existing.forbiddenIngredients.add(issue.ingredient);
    }

    if (issue.code === "REPEATED_PASTA_FORMAT") {
      existing.forbiddenPastaFormats.add(issue.ingredient);
    }

    grouped.set(key, existing);
  }

  const targets: MealPlanRepairTarget[] = [];

  for (const groupedTarget of grouped.values()) {
    const day = plan.find((item) => item.day === groupedTarget.day);
    const recipe = day?.meals[groupedTarget.meal];

    if (!recipe) continue;

    targets.push({
      day: groupedTarget.day,
      meal: groupedTarget.meal,
      currentRecipe: recipe,
      problems: groupedTarget.problems,
      forbiddenIngredients: [...groupedTarget.forbiddenIngredients],
      forbiddenPastaFormats: [...groupedTarget.forbiddenPastaFormats],
    });
  }

  return targets.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return a.meal.localeCompare(b.meal);
  });
}

function buildMealPlanOverview(plan: MealPlanDay[]) {
  return plan.map((day) => ({
    day: day.day,
    lunch: day.meals.lunch?.title ?? null,
    dinner: day.meals.dinner?.title ?? null,
  }));
}

function isUsableRepairRecipe(recipe: MealPlanRecipe): boolean {
  const totalIngredients =
    recipe.ingredientsUsed.length + recipe.missingIngredients.length;

  return (
    recipe.title.trim().length > 2 &&
    recipe.title !== "Ricetta" &&
    totalIngredients > 0 &&
    recipe.steps.length >= 3
  );
}

function replacementViolatesTarget(
  recipe: MealPlanRecipe,
  target: MealPlanRepairTarget
): boolean {
  for (const forbiddenIngredient of target.forbiddenIngredients) {
    if (recipeContainsIngredient(recipe, forbiddenIngredient, "any")) {
      return true;
    }
  }

  const pastaFormat = getPastaFormat(recipe);
  if (
    pastaFormat &&
    target.forbiddenPastaFormats.some(
      (forbidden) => normalizeIngredientName(forbidden) === pastaFormat
    )
  ) {
    return true;
  }

  return false;
}

function applyTargetedMealPlanRepairs(
  plan: MealPlanDay[],
  replacements: MealPlanRepairReplacement[],
  targets: MealPlanRepairTarget[],
  people: number
): { plan: MealPlanDay[]; applied: number; rejected: string[] } {
  const targetMap = new Map(
    targets.map((target) => [`${target.day}__${target.meal}`, target])
  );

  const clonedPlan: MealPlanDay[] = plan.map((day) => ({
    day: day.day,
    meals: {
      lunch: day.meals.lunch,
      dinner: day.meals.dinner,
    },
  }));

  const appliedKeys = new Set<string>();
  const rejected: string[] = [];
  let applied = 0;

  for (const replacement of replacements) {
    const dayNumber = Math.round(toNumber(replacement?.day, 0));
    const meal: MealSlot | null =
      replacement?.meal === "lunch" || replacement?.meal === "dinner"
        ? replacement.meal
        : null;

    if (!meal) {
      rejected.push("Replacement con meal non valido.");
      continue;
    }

    const key = `${dayNumber}__${meal}`;
    const target = targetMap.get(key);

    if (!target) {
      rejected.push(
        `Replacement non richiesto ignorato: giorno ${dayNumber} ${meal}.`
      );
      continue;
    }

    if (appliedKeys.has(key)) {
      rejected.push(
        `Replacement duplicato ignorato: giorno ${dayNumber} ${meal}.`
      );
      continue;
    }

    const repairedRecipe = sanitizeRecipe(replacement?.recipe, people);

    if (!isUsableRepairRecipe(repairedRecipe)) {
      rejected.push(
        `Replacement incompleto: giorno ${dayNumber} ${meal}.`
      );
      continue;
    }

    if (replacementViolatesTarget(repairedRecipe, target)) {
      rejected.push(
        `Replacement ancora in violazione: giorno ${dayNumber} ${meal}.`
      );
      continue;
    }

    const day = clonedPlan.find((item) => item.day === dayNumber);
    if (!day) {
      rejected.push(
        `Giorno inesistente nel replacement: ${dayNumber}.`
      );
      continue;
    }

    day.meals[meal] = repairedRecipe;
    appliedKeys.add(key);
    applied += 1;
  }

  for (const target of targets) {
    const key = `${target.day}__${target.meal}`;
    if (!appliedKeys.has(key)) {
      rejected.push(
        `Nessuna sostituzione valida per giorno ${target.day} ${target.meal}.`
      );
    }
  }

  return {
    plan: clonedPlan,
    applied,
    rejected,
  };
}

function extractOpenAIOutputText(data: any): string {
  let text = data?.output_text ?? "";

  if (!text && Array.isArray(data?.output)) {
    const parts: string[] = [];

    for (const item of data.output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;

      for (const c of content) {
        if (c?.type === "output_text" && typeof c?.text === "string") {
          parts.push(c.text);
        }
      }
    }

    text = parts.join("");
  }

  return String(text ?? "");
}

function parseJsonObjectFromModelText(text: string): any {
  let cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "").trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

function stripModelCodeFences(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractObjectCandidatesFromArrayText(
  text: string,
  arrayStartIndex: number
): string[] {
  const candidates: string[] = [];
  let inString = false;
  let escaped = false;
  let objectDepth = 0;
  let objectStart = -1;

  for (let i = arrayStartIndex + 1; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = false;
      }

      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (objectDepth === 0) {
        objectStart = i;
      }
      objectDepth += 1;
      continue;
    }

    if (ch === "}") {
      if (objectDepth > 0) {
        objectDepth -= 1;

        if (objectDepth === 0 && objectStart >= 0) {
          candidates.push(text.slice(objectStart, i + 1));
          objectStart = -1;
        }
      }
      continue;
    }

    if (ch === "]" && objectDepth === 0) {
      break;
    }
  }

  return candidates;
}

function parseRepairReplacementsFromModelText(text: string): {
  replacements: MealPlanRepairReplacement[];
  recovered: boolean;
  parseErrors: string[];
} {
  const cleaned = stripModelCodeFences(text);
  const parseErrors: string[] = [];

  try {
    const strictParsed = parseJsonObjectFromModelText(cleaned);
    const replacements = Array.isArray(strictParsed?.replacements)
      ? strictParsed.replacements
      : [];

    return {
      replacements,
      recovered: false,
      parseErrors,
    };
  } catch (error: any) {
    parseErrors.push(
      `Strict repair JSON parse failed: ${error?.message ?? String(error)}`
    );
  }

  const recovered: MealPlanRepairReplacement[] = [];
  const seenKeys = new Set<string>();

  const replacementsKeyMatch = cleaned.match(/["']?replacements["']?\s*:/i);
  const searchStart = replacementsKeyMatch
    ? (replacementsKeyMatch.index ?? 0) + replacementsKeyMatch[0].length
    : 0;
  const arrayStart = cleaned.indexOf("[", searchStart);

  if (arrayStart >= 0) {
    const candidates = extractObjectCandidatesFromArrayText(
      cleaned,
      arrayStart
    );

    for (const candidate of candidates) {
      try {
        const parsedCandidate = JSON.parse(candidate);

        const day = Math.round(toNumber(parsedCandidate?.day, 0));
        const meal =
          parsedCandidate?.meal === "lunch" ||
          parsedCandidate?.meal === "dinner"
            ? parsedCandidate.meal
            : null;

        if (!day || !meal || !parsedCandidate?.recipe) {
          continue;
        }

        const key = `${day}__${meal}`;
        if (seenKeys.has(key)) continue;

        seenKeys.add(key);
        recovered.push(parsedCandidate as MealPlanRepairReplacement);
      } catch (error: any) {
        parseErrors.push(
          `Skipped malformed repair replacement: ${error?.message ?? String(error)}`
        );
      }
    }
  }

  // Secondary recovery path: compact one-object-per-line output.
  if (recovered.length === 0) {
    for (const rawLine of cleaned.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith("{") || !line.endsWith("}")) continue;

      try {
        const parsedLine = JSON.parse(line);
        const day = Math.round(toNumber(parsedLine?.day, 0));
        const meal =
          parsedLine?.meal === "lunch" || parsedLine?.meal === "dinner"
            ? parsedLine.meal
            : null;

        if (!day || !meal || !parsedLine?.recipe) continue;

        const key = `${day}__${meal}`;
        if (seenKeys.has(key)) continue;

        seenKeys.add(key);
        recovered.push(parsedLine as MealPlanRepairReplacement);
      } catch {
        // Ignore non-replacement JSON lines.
      }
    }
  }

  return {
    replacements: recovered,
    recovered: recovered.length > 0,
    parseErrors,
  };
}

function buildMealPlanRepairStructuredFormat(targetCount: number) {
  const ingredientSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string" },
      quantity: { type: "number" },
      unit: {
        type: "string",
        enum: ["g", "kg", "l", "ml", "pz", "qb"],
      },
    },
    required: ["name", "quantity", "unit"],
  };

  const recipeSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      difficulty: {
        type: "string",
        enum: ["Facile", "Media", "Difficile"],
      },
      time: { type: "string" },
      servings: { type: "number" },
      description: { type: "string" },
      ingredientsUsed: {
        type: "array",
        items: ingredientSchema,
      },
      missingIngredients: {
        type: "array",
        items: ingredientSchema,
      },
      steps: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "title",
      "difficulty",
      "time",
      "servings",
      "description",
      "ingredientsUsed",
      "missingIngredients",
      "steps",
    ],
  };

  return {
    format: {
      type: "json_schema",
      name: "meal_plan_targeted_repair",
      description:
        "Ricette sostitutive valide per i soli pasti del piano che richiedono una correzione.",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          replacements: {
            type: "array",
            minItems: targetCount,
            maxItems: targetCount,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                day: { type: "number" },
                meal: {
                  type: "string",
                  enum: ["lunch", "dinner"],
                },
                recipe: recipeSchema,
              },
              required: ["day", "meal", "recipe"],
            },
          },
        },
        required: ["replacements"],
      },
    },
  };
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
      style,
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

    const maxPastaMeals = days >= 7 ? 3 : days >= 5 ? 2 : 2;
    const standardMainProteinLimit = style === "budget" ? 3 : 2;

    const planStartTs = new Date(`${startDateIso}T00:00:00`).getTime();
    const planEndTs = new Date(`${endDateIso}T23:59:59`).getTime();

    const abundantExpiringItems = availableItems.filter((item) => {
      if (item.expiryTs == null) return false;
      if (item.expiryTs < planStartTs || item.expiryTs > planEndTs) return false;

      const base = unitToBase(item.quantity, item.unit);

      if (base.unit === "g") return base.qty >= 600;
      if (base.unit === "ml") return base.qty >= 1000;
      if (base.unit === "pz") return base.qty >= 4;

      return false;
    });

    const antiWastePrioritySummary =
      abundantExpiringItems.length > 0
        ? abundantExpiringItems
            .map((item) => {
              const expiry = item.expiryDate ? `, scadenza ${item.expiryDate}` : "";
              return `${item.name} (${item.quantity} ${item.unit}${expiry})`;
            })
            .join("; ")
        : "nessuno";

    const strictAntiWasteRepurchaseNames =
      availableItems
        .filter(
          (item) =>
            item.quantity > 0 &&
            isStrictAntiWasteRepurchaseIngredient(item.name)
        )
        .map((item) => item.name);

    const antiWasteRepeatLimit = style === "antiwaste" ? 5 : 4;

    const hardVarietyRules =
      days >= 5
        ? `
- Salvo richiesta esplicita dell'utente o eccezione anti-spreco, la stessa fonte proteica principale non deve comparire in più di ${standardMainProteinLimit} pasti nell'intero piano.
- Salvo richiesta esplicita, i pasti a base di pasta non possono superare ${maxPastaMeals} nell'intero piano.
- Lo stesso formato di pasta non può comparire più di 1 volta nell'intero piano.
- Lo stesso ingrediente protagonista non deve definire più di 2 piatti, salvo eccezione anti-spreco.
- Ingredienti anti-spreco prioritari nel periodo: ${antiWastePrioritySummary}.
- Se un ingrediente è indicato come anti-spreco prioritario perché è presente in quantità rilevante e scade entro il periodo del piano, PUÒ essere usato più spesso dei normali limiti per evitare sprechi.
- Un ingrediente anti-spreco prioritario può comparire fino a ${antiWasteRepeatLimit} pasti in un piano di 7 giorni quando la quantità disponibile lo giustifica.
- OBBLIGATORIO: somma la quantità totale prevista di ogni ingrediente anti-spreco prioritario nell'intero piano e NON superare mai la quantità realmente disponibile in dispensa.
- Se la quantità disponibile di un ingrediente anti-spreco è già interamente allocata nei pasti precedenti, nei pasti successivi scegli una fonte alternativa: NON aggiungere altro dello stesso ingrediente in MissingIngredients e NON suggerire di ricomprarlo.
- Quando possibile, distribuisci un ingrediente abbondante in scadenza in meno pasti con porzioni realistiche, invece di ripeterlo quasi ogni giorno.
- Anche per un ingrediente anti-spreco prioritario evita 3 giorni consecutivi e varia davvero preparazione, contorni, aromi e tecnica di cottura.
- Non inserire un ingrediente anti-spreco in un pasto se rende il piano incoerente con dieta, allergie, stile o note dell'utente.
- Prima di restituire il JSON, conta davvero le occorrenze, somma le quantità e correggi le ripetizioni o gli acquisti non giustificati.
`
        : `
- Evita di ripetere la stessa fonte proteica principale in pasti consecutivi.
- Evita di ripetere lo stesso formato di pasta nello stesso piano.
`;


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
${hardVarietyRules}
- Ogni giorno deve essere diverso dal precedente.
- Non ripetere lo stesso piatto durante il piano.
- Non proporre sempre la stessa categoria di piatto.
- Alterna fonti proteiche, cereali, verdure, contorni e tecniche di cottura.
- Alterna metodi di cottura: vapore, forno, padella leggera, bollitura, crudo quando adatto.
- Per piani di 5 o 7 giorni, evita la stessa fonte proteica principale in giorni consecutivi; per ingredienti anti-spreco prioritari sono ammesse ripetizioni ravvicinate, ma mai per 3 giorni consecutivi.
- Per piani di 5 o 7 giorni, evita di usare lo stesso cereale o formato di pasta più di 2 volte salvo richiesta esplicita.
- Se la dispensa non consente sufficiente varietà, aggiungi ingredienti mancanti nella lista della spesa.
- La varietà, la leggerezza e il rispetto delle preferenze hanno priorità rispetto al riuso della dispensa.

CONTROLLO MONOTONIA:
- Prima di finalizzare il piano, conta quante volte compaiono gli stessi ingredienti principali.
- Evita sequenze come pasta-pasta, pollo-pollo, riso-riso o insalata-insalata in pasti vicini.
- Non usare la stessa fonte proteica in giorni consecutivi, se evitabile.
- Non proporre sempre pasta, riso o couscous come unica soluzione per il pranzo.
- Alterna piatti caldi, freddi, zuppe, cereali, legumi, verdure, secondi e piatti unici.
- Cambia anche profilo aromatico e consistenze: non limitarti a rinominare combinazioni quasi identiche.

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
- Prima scegli la struttura del menu in base alle note dell'utente e allo stile selezionato.
- Poi costruisci il menu ideale, distribuendo categorie di piatti e fonti proteiche sull'intero periodo.
- Solo dopo scegli le singole ricette.
- Solo alla fine confronta le ricette con la dispensa.
- Non partire mai dagli ingredienti della dispensa per decidere il piatto, salvo stile Anti-spreco.
- Ogni pranzo deve avere una funzione chiara: primo, piatto unico, zuppa, cereale con verdure o alternativa coerente.
- Ogni cena deve avere una fonte proteica chiara e, quando appropriato, un contorno.
- Per ogni giorno crea una combinazione equilibrata tra carboidrati, proteine e verdure.
- Pranzo e cena dello stesso giorno non devono essere entrambi pesanti.
- Evita che pranzo e cena dello stesso giorno usino lo stesso ingrediente principale.
- Se un ingrediente pesante è in dispensa, può essere usato solo se coerente con stile, note e obiettivo del piano.

ANTI-SPRECO:
- Non usare mai ingredienti scaduti.
- Considera anche gli ingredienti che scadranno DURANTE il periodo coperto dal piano, non soltanto quelli in scadenza nei prossimi 3 giorni.
- Se un ingrediente è presente in quantità importante e scade entro la fine del piano, dagli priorità quando è compatibile con stile, note, dieta e varietà.
- Un ingrediente abbondante in scadenza può essere riutilizzato più volte per evitare sprechi, ma cambia ricetta, tecnica di cottura, contorno e profilo aromatico.
- Pianifica le quantità sull'intero periodo: non consumare virtualmente più di quanto è realmente presente in dispensa.
- Una volta allocata tutta la quantità disponibile di un ingrediente anti-spreco, passa a un'altra fonte alimentare invece di inserirne altro nella lista della spesa.
- Anche in ottica anti-spreco evita di proporre lo stesso ingrediente principale per 3 giorni consecutivi.
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
- Per ingredienti normalmente acquistati a peso (carne, pesce, pasta, riso, verdure, legumi, formaggi) indica quantità realistiche e unità coerenti.
- Q.B. è consentito SOLO per condimenti, spezie ed erbe aromatiche usati in piccole quantità: olio, aceto, sale, pepe, basilico, prezzemolo, rosmarino, salvia, origano, alloro, curry, peperoncino, timo, maggiorana, cumino, paprika, curcuma, cannella, noce moscata e spezie equivalenti.
- Se usi la voce generica "erbe aromatiche", trattala sempre come Q.B.; quando possibile preferisci indicare l'erba specifica.
- Usa nomi ingredienti stabili: "pomodoro" invece di alternare pomodoro/pomodori/pomodorini quando rappresentano lo stesso acquisto, "basilico" invece di alternare basilico/basilico fresco e "olio d'oliva" invece di alternare olio d'oliva/olio di oliva/olio extravergine/olio EVO.
- Per questi ingredienti usa quantity = 1 e unit = "qb". "qb" significa "quanto basta".
- NON usare "qb" per limone, lime, aglio, cipolla, scalogno, cetriolo, verdure, frutta, carne, pesce, uova, latticini, cereali o altri ingredienti concreti.
- Limone, lime, aglio e cipolla possono usare unit = "pz" con una quantità realistica.
- Per carote, zucchine, peperoni, melanzane, patate e cetrioli preferisci quantità in grammi, così la lista della spesa può essere aggregata correttamente.
- Non inserire "succo di limone" o "succo di lime" come acquisto separato in grammi o millilitri: nella lista ingredienti usa rispettivamente "limone" o "lime" in pezzi, mentre nei passaggi puoi indicare di spremerne il succo.
- L'acqua del rubinetto usata per cottura, brodi o per allungare una preparazione non deve comparire in MissingIngredients e non deve finire nella lista della spesa.
- Per verdure, frutta, carne, pesce, cereali e altri ingredienti acquistati a peso non usare mai quantità palesemente irrealistiche come 1 g, 2 g, 5 g o 10 g.
- Se una verdura è un ingrediente reale della ricetta, indica una quantità realistica per il numero di persone, normalmente nell'ordine delle decine o centinaia di grammi, non singoli grammi.
- Non indicare micro-quantità da ricetta come "olio 2 ml", "sale 1 g", "pepe 1 g" o "basilico 10 g" nella lista della spesa.
- Ragiona come una persona che deve realmente fare la spesa al supermercato.
- Se un ingrediente è presente solo tra gli scaduti, consideralo NON disponibile e inseriscilo in missingIngredients se serve.
- Le ricette devono essere realistiche, semplici da eseguire e coerenti con il numero di persone.
- Non inserire pasti vuoti nei giorni richiesti.
- Non scrivere testo fuori dal JSON.

QUALITÀ GASTRONOMICA:
- Evita nomi troppo generici come "Pasta al pomodoro", "Riso con verdure", "Pollo con insalata".
- Preferisci nomi più curati ma semplici, come "Spaghetti integrali con pomodorini arrosto e basilico" o "Petto di pollo al limone con zucchine grigliate".
- Le ricette devono sembrare appetitose, realistiche e facili da cucinare.
- Ogni piatto deve avere una logica gastronomica chiara: ingrediente principale, accompagnamento e condimento devono stare bene insieme.
- Usa solo nomi culinari italiani reali, grammaticalmente corretti e comprensibili.
- Non inventare parole o espressioni senza senso come "scuottini", "cucchiai di insalata", "bocconcetti speciali" o termini inesistenti.
- Il titolo deve descrivere in modo naturale il piatto: se una formulazione suona strana, semplificala. Esempio corretto: "Pollo allo yogurt con insalata fresca".
- Controlla accordi grammaticali, preposizioni e nomi degli ingredienti prima di finalizzare ogni titolo.
- Per insalate di pasta e pasta fredda usa formati corti adatti (fusilli, farfalle, penne, mezze maniche, tortiglioni). Non usare spaghetti, linguine, bucatini o altri formati lunghi, salvo richiesta esplicita dell'utente.
- Usa erbe aromatiche, spezie leggere e abbinamenti mediterranei quando coerenti.
- Evita di cambiare solo il nome a ricette sostanzialmente uguali.
- Non inventare piatti strani o poco credibili.

REGOLE SUI PASSAGGI:
- Ogni ricetta deve avere passaggi chiari e pratici.
- Gli ingredienti citati nei passaggi devono essere coerenti con ingredientsUsed + missingIngredients.
- Se nei passaggi usi sale, pepe, olio, prezzemolo, basilico o altre erbe/spezie Q.B., includili sempre anche negli ingredienti con quantity = 1 e unit = "qb".
- Usa nomi coerenti e stabili per lo stesso ingrediente: per esempio "uovo" invece di alternare "uovo/uova", e "spinaci" invece di alternare "spinaci/spinaci freschi".
- Non sostituire nei passaggi un ingrediente con un altro diverso: per esempio, se negli ingredienti compare "cocco grattugiato", non scrivere "latte di cocco" nei passaggi.
- Se nei passaggi serve un ingrediente reale non presente negli elenchi, aggiungilo prima a ingredientsUsed o missingIngredients con quantità e unità corrette.
- Non aggiungere nei passaggi ingredienti facoltativi, decorativi o "se lo si desidera" se non sono già presenti negli ingredienti della ricetta.
- Se usi una voce generica come "insalata mista", non inventare nei passaggi lattuga, pomodoro, cetriolo o altri componenti specifici non dichiarati negli ingredienti.
- I passaggi devono accompagnare l'utente dall'inizio alla fine.
- Per ricette semplici usa almeno 4 passaggi utili; per ricette più articolate usa 5-8 passaggi.
- Indica tempi, cotture, fiamma, temperatura o consistenza quando utile.
- ECCEZIONE PASTA: non indicare mai un numero fisso di minuti per la cottura di spaghetti, penne, rigatoni, fusilli, linguine o altra pasta confezionata. Scrivi invece di cuocerla "seguendo i tempi indicati sulla confezione" e di scolarla al dente.
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
12. Nessuna verdura, frutta, carne, pesce o cereale abbia micro-quantità assurde come 1 g, 2 g, 5 g o 10 g.
13. Q.B. sia usato soltanto per condimenti, spezie ed erbe aromatiche consentiti.
14. Ogni titolo sia italiano naturale, grammaticalmente corretto e privo di espressioni senza senso.
15. Le ripetizioni di ingredienti abbondanti in scadenza siano motivate dall'anti-spreco e non creino 3 giorni consecutivi monotoni.
16. La quantità totale pianificata di ogni ingrediente anti-spreco non superi la quantità disponibile in dispensa; una volta esaurita, il piano scelga un'alternativa invece di ricomprarla.
17. Alloro, curry, peperoncino, timo, maggiorana e altre spezie/erbe usate in piccole quantità siano Q.B., non 100 g.
18. Succo di limone/lime non compaia come acquisto separato: usa limone/lime in pezzi.
19. Ogni ingrediente citato nei passaggi sia coerente con ingredientsUsed + missingIngredients.
20. La pasta fredda o l'insalata di pasta non usi formati lunghi salvo richiesta esplicita.
21. Il piano sembri creato da un vero meal planner professionista.

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
          "ingredientsUsed": [{"name":"...", "quantity": 1, "unit":"g|kg|l|ml|pz|qb"}],
          "missingIngredients": [{"name":"...", "quantity": 1, "unit":"g|kg|l|ml|pz|qb"}],
          "steps": ["..."]
        }${includeDinner ? "," : ""}` : ""}
        ${includeDinner ? `"dinner": {
          "title": "...",
          "difficulty": "Facile|Media|Difficile",
          "time": "es. 35 min",
          "servings": ${people},
          "description": "...",
          "ingredientsUsed": [{"name":"...", "quantity": 1, "unit":"g|kg|l|ml|pz|qb"}],
          "missingIngredients": [{"name":"...", "quantity": 1, "unit":"g|kg|l|ml|pz|qb"}],
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

      let text = extractOpenAIOutputText(data);

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
        const parsed = parseJsonObjectFromModelText(text);
        const aiPlan = sanitizePlan(parsed?.plan, people, days, includeLunch, includeDinner);

        let finalPlan = recalculateMissingIngredients(aiPlan, availableItems);
        let repairApplied = false;
        const initialQualityIssues = analyzeMealPlanQualityIssues(
          finalPlan,
          availableItems,
          strictAntiWasteRepurchaseNames
        );

        if (initialQualityIssues.length > 0) {
          const repairTargets = buildMealPlanRepairTargets(
            finalPlan,
            initialQualityIssues
          );

          const repairPrompt = `
Agisci come revisore tecnico di un piano pasti.

NON devi rigenerare l'intero piano.
Devi restituire ESCLUSIVAMENTE le ricette sostitutive per i pasti elencati in TARGET DA CORREGGERE.

CONTESTO:
- Periodo: ${startDateIso} → ${endDateIso}
- Persone: ${people}
- Stile: ${style}
- Complessità: ${complexity}
- Dieta: ${diet}
- Senza lattosio: ${lactoseFree ? "SI" : "NO"}
- Ingredienti da evitare: ${avoid.length ? avoid.join(", ") : "nessuno"}
- Allergie: ${allergies.length ? allergies.join(", ") : "nessuna"}
${notes ? `- Note utente: ${notes}` : ""}

PANORAMICA DEL PIANO DA PRESERVARE:
${JSON.stringify(buildMealPlanOverview(finalPlan), null, 2)}

DISPENSA ORIGINALE:
${formatPantryItems(availableItems)}

PROTEINE DELLA DISPENSA CON DIVIETO FORTE DI RIACQUISTO:
${strictAntiWasteRepurchaseNames.length ? strictAntiWasteRepurchaseNames.join(", ") : "nessuno"}

TARGET DA CORREGGERE:
${JSON.stringify(
  repairTargets.map((target) => ({
    day: target.day,
    meal: target.meal,
    currentTitle: target.currentRecipe.title,
    problems: target.problems,
    forbiddenIngredients: target.forbiddenIngredients,
    forbiddenPastaFormats: target.forbiddenPastaFormats,
  })),
  null,
  2
)}

REGOLE OBBLIGATORIE:
- Restituisci ESATTAMENTE ${repairTargets.length} sostituzioni: UNA per OGNI target e nessuna sostituzione per pasti non richiesti.
- Non usare MAI gli elementi presenti in forbiddenIngredients del relativo target.
- Non usare MAI i formati presenti in forbiddenPastaFormats del relativo target.
- Se il problema è che un ingrediente della dispensa è stato esaurito e poi ricomprato, scegli una fonte principale DAVVERO diversa.
- Mantieni il tipo di pasto coerente: un pranzo resta un pranzo appropriato, una cena resta una cena appropriata.
- Evita di creare nuove ripetizioni rispetto alla panoramica del piano.
- Rispetta dieta, allergie, ingredienti da evitare, note, stile e numero di persone.
- Mantieni quantità realistiche.
- Q.B. soltanto per condimenti, spezie ed erbe aromatiche.
- La voce generica "erbe aromatiche" deve essere Q.B.; quando possibile preferisci un'erba specifica.
- Usa nomi stabili: "pomodoro" per varianti equivalenti pomodoro/pomodori/pomodorini, "basilico" per basilico/basilico fresco e "olio d'oliva" per olio d'oliva/olio di oliva/olio extravergine/olio EVO.
- Carote, zucchine, peperoni, melanzane, patate e cetrioli preferibilmente in grammi.
- Non inserire acqua del rubinetto tra gli ingredienti.
- Per pasta confezionata non indicare minuti fissi: usa i tempi indicati sulla confezione.
- Ogni ingrediente citato nei passaggi deve comparire negli ingredienti della ricetta.
- Non aggiungere ingredienti facoltativi o decorativi nei passaggi se non sono presenti negli ingredienti.
- Se usi una voce generica come "insalata mista", non specificare componenti aggiuntivi non dichiarati.
- Se nei passaggi usi sale, pepe, olio, prezzemolo, basilico o altre erbe/spezie Q.B., includili anche negli ingredienti con quantity = 1 e unit = "qb".
- Usa "uovo" come nome stabile per uovo/uova e "spinaci" come nome stabile per spinaci/spinaci freschi.
- Per rendere il ricalcolo della dispensa deterministico, imposta ingredientsUsed = [].
- Inserisci in missingIngredients TUTTI gli ingredienti necessari alla ricetta, anche quelli che potrebbero essere già in dispensa. Il server deciderà automaticamente cosa è disponibile e cosa manca.
- Non duplicare lo stesso ingrediente tra più voci con nomi quasi identici.
- Restituisci SOLO JSON valido.
- Mantieni il JSON il più compatto possibile.
- Non inserire virgolette doppie non escaped dentro title, description o steps; quando serve usa apostrofi.
- Non aggiungere commenti, markdown, trailing comma o testo prima/dopo il JSON.

OUTPUT OBBLIGATORIO:
{
  "replacements": [
    {
      "day": 4,
      "meal": "dinner",
      "recipe": {
        "title": "...",
        "difficulty": "Facile|Media|Difficile",
        "time": "...",
        "servings": ${people},
        "description": "...",
        "ingredientsUsed": [],
        "missingIngredients": [
          {"name":"...", "quantity":1, "unit":"g|kg|l|ml|pz|qb"}
        ],
        "steps": ["...", "...", "..."]
      }
    }
  ]
}
          `.trim();

          try {
            const repairResponse = await fetch(
              "https://api.openai.com/v1/responses",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model,
                  input: repairPrompt,
                  text: buildMealPlanRepairStructuredFormat(repairTargets.length),
                }),
              }
            );

            const repairData = await repairResponse.json();

            if (repairResponse.ok) {
              const repairText = extractOpenAIOutputText(repairData);

              if (repairText) {
                const parsedRepair =
                  parseRepairReplacementsFromModelText(repairText);
                const rawReplacements = parsedRepair.replacements;

                if (parsedRepair.parseErrors.length > 0) {
                  console.warn(
                    "Meal-plan repair JSON recovery details:",
                    parsedRepair.parseErrors
                  );
                }

                if (parsedRepair.recovered) {
                  console.warn(
                    "Meal-plan repair recovered valid replacements from malformed JSON."
                  );
                }

                const repairResult = applyTargetedMealPlanRepairs(
                  finalPlan,
                  rawReplacements,
                  repairTargets,
                  people
                );

                if (repairResult.rejected.length > 0) {
                  console.warn(
                    "Meal-plan targeted repair rejected replacements:",
                    repairResult.rejected
                  );
                }

                if (repairResult.applied > 0) {
                  finalPlan = recalculateMissingIngredients(
                    repairResult.plan,
                    availableItems
                  );
                  repairApplied = true;
                }
              }
            } else {
              console.error("OpenAI meal-plan repair error:", repairData);
            }
          } catch (repairError) {
            console.error("Meal-plan targeted repair failed:", repairError);
          }
        }

        let remainingQualityIssues = analyzeMealPlanQualityIssues(
          finalPlan,
          availableItems,
          strictAntiWasteRepurchaseNames
        );

        let deterministicPastaFallbackApplied = false;
        let deterministicPastaFallbackChanges: string[] = [];

        if (
          remainingQualityIssues.length > 0 &&
          remainingQualityIssues.every(
            (issue) => issue.code === "REPEATED_PASTA_FORMAT"
          )
        ) {
          const pastaFallback = applyDeterministicPastaFormatFallback(
            finalPlan,
            remainingQualityIssues
          );

          if (pastaFallback.applied > 0) {
            finalPlan = recalculateMissingIngredients(
              pastaFallback.plan,
              availableItems
            );
            deterministicPastaFallbackApplied = true;
            deterministicPastaFallbackChanges = pastaFallback.changes;

            remainingQualityIssues = analyzeMealPlanQualityIssues(
              finalPlan,
              availableItems,
              strictAntiWasteRepurchaseNames
            );
          }
        }

        if (remainingQualityIssues.length > 0) {
          console.error(
            "Meal-plan quality validation failed after targeted repair/fallback:",
            remainingQualityIssues
          );

          const { data: qualityRefund, error: qualityRefundErr } =
            !isPremiumActive
              ? await supabase.rpc("refund_eco_generation", {
                  p_consumed_credit: Boolean(creditUsage?.consumedCredit),
                  p_reason: "meal_plan_quality_repair_failed",
                })
              : { data: null, error: null };

          return {
            error: "MEAL_PLAN_QUALITY_REPAIR_FAILED",
            status: 422,
            message:
              "Il piano generato non ha superato i controlli di qualità. Riprova la generazione.",
            qualityIssues: remainingQualityIssues,
            repairApplied,
            deterministicPastaFallbackApplied,
            deterministicPastaFallbackChanges,
            remainingCredits:
              typeof qualityRefund?.remainingCredits === "number"
                ? qualityRefund.remainingCredits
                : typeof remainingAfterConsume === "number"
                  ? remainingAfterConsume
                  : null,
            refunded: isPremiumActive ? false : !qualityRefundErr,
          };
        }

        const shoppingListPreview = aggregateShoppingList(finalPlan);
        const shoppingAccounting = validateShoppingListAccounting(
          finalPlan,
          shoppingListPreview
        );

        if (!shoppingAccounting.valid) {
          console.error(
            "Meal-plan shopping accounting mismatch:",
            shoppingAccounting.details
          );
          throw new Error("SHOPPING_LIST_ACCOUNTING_MISMATCH");
        }

        const pantryCoverage = buildPantryCoverage(finalPlan, availableItems);

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
            plan_json: finalPlan,
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
          plan: finalPlan,
          shoppingListPreview,
          pantryCoverage,
          status: savedPlan.status,
          createdAt: savedPlan.created_at,
          updatedAt: savedPlan.updated_at,
          remainingCredits: typeof remainingAfterConsume === "number" ? remainingAfterConsume : null,
          repairApplied,
          deterministicPastaFallbackApplied,
          deterministicPastaFallbackChanges,
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