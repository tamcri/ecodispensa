// Elimina definitivamente l'account dell'utente che chiama, con i suoi dati e le sue foto.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const BUCKET = "recipe-images";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "UNAUTHORIZED" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // chi sta chiedendo? (solo il proprio account si può eliminare)
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return json({ error: "UNAUTHORIZED" }, 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body?.confirm !== "ELIMINA") return json({ error: "CONFIRM_REQUIRED" }, 400);

  // 1) foto dei piatti
  try {
    const { data: files } = await admin.storage.from(BUCKET).list(user.id, { limit: 1000 });
    if (files?.length) {
      await admin.storage.from(BUCKET).remove(files.map((f) => `${user.id}/${f.name}`));
    }
  } catch (e) {
    console.error("storage cleanup error:", e);
  }

  // 2) dispensa e spesa, se nessun altro le condivide
  const { error: prepErr } = await admin.rpc("prepare_account_deletion", { p_user_id: user.id });
  if (prepErr) {
    console.error("prepare_account_deletion error:", prepErr);
    return json({ error: "SERVER", message: "Eliminazione non riuscita. Riprova." }, 500);
  }

  // 3) l'account: tutto il resto (ricette, crediti, profilo, notifiche…) si cancella a cascata
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error("deleteUser error:", delErr);
    return json({ error: "SERVER", message: "Eliminazione non riuscita. Riprova." }, 500);
  }
  return json({ ok: true });
});
