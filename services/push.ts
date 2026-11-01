import { supabase } from "./supabaseClient";

export const isPushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getPublicKey(): Promise<string | null> {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  return key && key.trim() ? key.trim() : null;
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON() as any;
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: json?.keys?.p256dh,
    p_auth: json?.keys?.auth,
  });
  if (error) throw error;
}

export type PushResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "ios-install" | "denied" | "not-configured" | "error" };

/** Chiede il permesso e iscrive questo dispositivo alle notifiche di scadenza. */
export async function enablePush(): Promise<PushResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: isIos() && !isStandalone() ? "ios-install" : "unsupported" };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const key = await getPublicKey();
  if (!key) return { ok: false, reason: "not-configured" };

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    await saveSubscription(sub);
    return { ok: true };
  } catch (e) {
    console.error("push subscribe error:", e);
    return { ok: false, reason: "error" };
  }
}

/** Se l'utente aveva già dato il permesso, riallinea l'iscrizione (es. dopo un nuovo login). */
export async function refreshPushSubscription() {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return false;
    await saveSubscription(sub);
    return true;
  } catch {
    return false;
  }
}

export const PUSH_MESSAGES: Record<Exclude<PushResult, { ok: true }>["reason"], string> = {
  unsupported: "Questo browser non supporta le notifiche.",
  "ios-install":
    "Su iPhone le notifiche funzionano solo con l'app installata: in Safari tocca Condividi → Aggiungi alla schermata Home, poi apri EcoDispensa dall'icona.",
  denied: "Le notifiche sono bloccate. Puoi riattivarle dalle impostazioni del browser o del telefono.",
  "not-configured": "Le notifiche non sono ancora attive sul server. Riprova più tardi.",
  error: "Non sono riuscito ad attivare le notifiche. Riprova.",
};
