import { supabase } from "./supabaseClient";

const functionsUrl = () => `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/+$/, "")}/functions/v1`;
const anonKey = () => import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function callLink(path: string): Promise<any | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const r = await fetch(`${functionsUrl()}/alexa/collega/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey(), Authorization: `Bearer ${token}` },
      body: "{}",
    });
    return r.ok ? await r.json().catch(() => null) : null;
  } catch {
    return null;
  }
}

/** Alexa è collegata a questo account? Chiede ad Amazon se la skill è ancora attiva (null se non si riesce a saperlo) */
export async function alexaLinked(): Promise<boolean | null> {
  const body = await callLink("stato");
  if (body && typeof body.linked === "boolean") return body.linked;
  const { data, error } = await supabase.rpc("alexa_status");
  if (error) return null;
  return !!data;
}

/** Scollega Alexa: toglie l'accesso alla dispensa e disattiva la skill anche nell'app Alexa */
export async function alexaUnlink(): Promise<boolean> {
  const body = await callLink("scollega");
  if (body?.ok) return true;
  const { error } = await supabase.rpc("alexa_unlink");
  return !error;
}

export const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Collegamento in un tocco: chiede al server gli indirizzi del consenso di Amazon.
 * Sul telefono si apre l'app Alexa (se c'è), altrimenti la pagina di accesso di Amazon.
 */
export async function startAlexaLink(): Promise<{ url: string } | { error: string }> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { error: "SESSION" };
    const r = await fetch(`${functionsUrl()}/alexa/collega/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey(), Authorization: `Bearer ${token}` },
      body: "{}",
    });
    const body = await r.json().catch(() => null);
    if (!r.ok || !body?.alexaUrl) return { error: body?.error ?? "SERVER" };
    return { url: isPhone() ? body.alexaUrl : body.lwaUrl };
  } catch {
    return { error: "NETWORK" };
  }
}

/** Ritorno da Amazon: abilita la skill e collega l'account (non serve essere entrati: basta lo "state") */
export async function finishAlexaLink(code: string, state: string): Promise<{ ok: true } | { error: string }> {
  try {
    const r = await fetch(`${functionsUrl()}/alexa/collega/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey(), Authorization: `Bearer ${anonKey()}` },
      body: JSON.stringify({ code, state }),
    });
    const body = await r.json().catch(() => null);
    return r.ok && body?.ok ? { ok: true } : { error: body?.error ?? "SERVER" };
  } catch {
    return { error: "NETWORK" };
  }
}
