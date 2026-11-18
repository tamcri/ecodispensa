/**
 * Sito pubblico o app?
 *
 * - ecodispensa.it/app (e tutto sotto /app) → l'app
 * - ecodispensa.it, /partner, /guida → il sito, quando è visibile
 * - link con ?codice, ?ricetta, ?accesso, ?checkout → l'app (anche quelli vecchi senza /app)
 * - app installata sul telefono → l'app
 *
 * Il sito è visibile a tutti quando SITE_LIVE = true. Prima del lancio lo vede solo chi apre
 * il link riservato ?anteprima=sito (il browser se lo ricorda), e chi lavora su un'anteprima di Vercel.
 */

/** Il giorno del lancio diventa true: il sito si vede per tutti al posto di "Presto online" */
export const SITE_LIVE = false;

const PREVIEW_KEY = "eco-anteprima-sito";
const PUBLIC_HOSTS = ["ecodispensa.it", "www.ecodispensa.it", "ecodispensa.app", "www.ecodispensa.app"];
const APP_PARAMS = ["codice", "ricetta", "accesso", "checkout", "sfida", "view"];

export type SitePage = "home" | "partner" | "guida";

const remember = () => {
  try {
    localStorage.setItem(PREVIEW_KEY, "1");
    // chi ha il link riservato del sito può anche entrare nell'app (come con «Area riservata»)
    localStorage.setItem("eco-area-riservata", "1");
  } catch {
    /* memoria del browser non disponibile: vale solo per questa visita */
  }
};

const previewOn = () => {
  try {
    return localStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
};

const standalone = () => {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
};

export function siteVisible(): boolean {
  return SITE_LIVE || previewOn() || !PUBLIC_HOSTS.includes(window.location.hostname);
}

/** Pagina del sito per un percorso, o null se il percorso è dell'app */
export function pageFromPath(path: string): SitePage | null {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return "home";
  if (p === "/partner") return "partner";
  if (p === "/guida") return "guida";
  return null;
}

/** Decide all'apertura della pagina se mostrare il sito o l'app */
export function decideRoute(): "site" | "app" {
  const { pathname, search } = window.location;
  const params = new URLSearchParams(search);

  if (pathname === "/app" || pathname.startsWith("/app/")) return "app";

  // link dell'app arrivati sulla pagina principale: si passa all'app tenendo i parametri
  if (APP_PARAMS.some((k) => params.has(k)) || standalone()) {
    window.history.replaceState(null, "", `/app${search}`);
    return "app";
  }

  if (params.get("anteprima") === "sito") {
    remember();
    params.delete("anteprima");
    const rest = params.toString();
    window.history.replaceState(null, "", `${pathname}${rest ? `?${rest}` : ""}`);
  }
  // ?anteprima=presto: la pagina "Presto online", come prima
  if (params.get("anteprima") === "presto") return "app";

  if (!siteVisible()) return "app";
  return pageFromPath(pathname) || params.has("pagina") ? "site" : "app";
}
