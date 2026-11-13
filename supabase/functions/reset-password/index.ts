// Reimposta la password con il codice di recupero (l'app non usa email vere).
// Il codice viene verificato nel database (max 5 tentativi, poi blocco di un'ora) e vale una sola volta.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// stessa trasformazione usata dall'app per creare l'account dallo username
function toFakeEmail(username: string) {
  const safe = username.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "");
  return `${safe}@example.com`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_REQUEST" }, 400);
  }
  const username = String(body?.username ?? "");
  const code = String(body?.code ?? "");
  const newPassword = String(body?.newPassword ?? "");

  if (username.trim().length < 3 || code.replace(/[^A-Za-z0-9]/g, "").length !== 16) {
    return json({ error: "INVALID", message: "Username o codice non validi." }, 400);
  }
  if (newPassword.length < 6) {
    return json({ error: "WEAK_PASSWORD", message: "La nuova password deve avere almeno 6 caratteri." }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userId, error } = await admin.rpc("verify_recovery_code", {
    p_email: toFakeEmail(username),
    p_code: code,
  });

  if (error) {
    if (String(error.message).includes("LOCKED")) {
      return json({ error: "LOCKED", message: "Troppi tentativi sbagliati. Riprova tra un'ora." }, 429);
    }
    console.error("verify_recovery_code error:", error);
    return json({ error: "SERVER", message: "Errore imprevisto. Riprova." }, 500);
  }
  if (!userId) {
    return json({ error: "INVALID", message: "Username o codice di recupero non corretti." }, 400);
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(String(userId), { password: newPassword });
  if (updErr) {
    console.error("update password error:", updErr);
    return json({ error: "SERVER", message: "Non sono riuscito a cambiare la password. Riprova." }, 500);
  }
  return json({ ok: true });
});
