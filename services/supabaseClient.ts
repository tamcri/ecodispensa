import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

// Non far crashare l'app in import: logga e continua.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase env vars. Check .env.local (root) and restart dev server.",
    { hasUrl: !!supabaseUrl, hasAnonKey: !!supabaseAnonKey }
  );
}

// Valori dummy per non rompere il render.
// Le chiamate a supabase falliranno finché non sistemi le env, ma l'app si apre.
export const supabase = createClient(
  supabaseUrl || "https://example.supabase.co",
  supabaseAnonKey || "public-anon-key"
);

