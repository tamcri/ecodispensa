import { supabase } from "./supabaseClient";

const functionsUrl = () => `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/+$/, "")}/functions/v1`;
const anonKey = () => import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** Crea (o rigenera) il codice di recupero: va mostrato una volta sola. */
export async function createRecoveryCode(): Promise<string | null> {
  const { data, error } = await supabase.rpc("create_recovery_code");
  if (error) {
    console.error("create_recovery_code error:", error);
    return null;
  }
  return data as string;
}

export async function hasRecoveryCode(): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("has_recovery_code");
  if (error) return null;
  return !!data;
}

/** Nuova password con username + codice di recupero (senza essere loggati). */
export async function resetPasswordWithCode(username: string, code: string, newPassword: string): Promise<string | null> {
  try {
    const r = await fetch(`${functionsUrl()}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey(), Authorization: `Bearer ${anonKey()}` },
      body: JSON.stringify({ username, code, newPassword }),
    });
    const body = await r.json().catch(() => null);
    if (r.ok && body?.ok) return null;
    return body?.message ?? "Non sono riuscito a cambiare la password. Riprova.";
  } catch {
    return "Connessione assente. Riprova.";
  }
}

/** Elimina definitivamente l'account e i dati dell'utente collegato. */
export async function deleteMyAccount(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return "Sessione scaduta: accedi di nuovo.";
  try {
    const r = await fetch(`${functionsUrl()}/delete-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey(), Authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirm: "ELIMINA" }),
    });
    const body = await r.json().catch(() => null);
    if (r.ok && body?.ok) {
      await supabase.auth.signOut().catch(() => undefined);
      return null;
    }
    return body?.message ?? "Eliminazione non riuscita. Riprova.";
  } catch {
    return "Connessione assente. Riprova.";
  }
}
