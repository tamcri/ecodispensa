import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase env vars. Check .env.local (root) and restart dev server.",
    { hasUrl: !!supabaseUrl, hasAnonKey: !!supabaseAnonKey }
  );
}

export const supabase = createClient(
  supabaseUrl || "https://example.supabase.co",
  supabaseAnonKey || "public-anon-key"
);

// DEBUG SOLO LOCALE
if (typeof window !== "undefined") {
  (window as any).supabase = supabase;
}

