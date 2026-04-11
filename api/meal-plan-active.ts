import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function getBearerToken(req: VercelRequest): string | null {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h || typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function formatDateForDisplay(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;

  const [, yyyy, mm, dd] = match;
  return `${dd}-${mm}-${yyyy}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY" });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Missing Authorization Bearer token" });

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: "Invalid session", details: userErr?.message });
    }

    const user_id = userData.user.id;

    const { data, error } = await supabase
      .from("meal_plans")
      .select("id, start_date, end_date, days, meals, people, budget, complexity, notes, warning, estimated_min_budget, plan_json, shopping_list_json, pantry_coverage_json, status, created_at, updated_at")
      .eq("user_id", user_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(200).json({ plan: null });
    }

    return res.status(200).json({
      plan: {
        id: data.id,
        startDate: formatDateForDisplay(data.start_date),
        startDateIso: data.start_date,
        endDate: formatDateForDisplay(data.end_date),
        endDateIso: data.end_date,
        days: data.days,
        meals: data.meals,
        people: data.people,
        budget: data.budget,
        complexity: data.complexity,
        notes: data.notes,
        warning: data.warning,
        estimatedMinBudget: data.estimated_min_budget,
        plan: data.plan_json,
        shoppingListPreview: data.shopping_list_json,
        pantryCoverage: data.pantry_coverage_json ?? {
          usedPantryIngredients: [],
          missingPantryIngredients: [],
        },
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (e: any) {
    console.error("meal-plan-active api error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}