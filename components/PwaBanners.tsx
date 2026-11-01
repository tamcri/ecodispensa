import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Share, SquarePlus, X } from "lucide-react";

// Evento non ancora nei tipi standard di TypeScript
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "ecodispensa_install_dismissed_at";
const DISMISS_DAYS = 14;

const readDismissed = (): boolean => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ageDays = (Date.now() - Number(raw)) / 86_400_000;
    return ageDays < DISMISS_DAYS;
  } catch {
    return false;
  }
};

const saveDismissed = () => {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage non disponibile: pazienza */
  }
};

/** Chiede di mostrare l'installazione (es. dal pulsante nel Profilo), anche se il banner era stato chiuso. */
export const requestInstall = () => window.dispatchEvent(new Event("eco:install-request"));

export const isAppInstalled = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const PwaBanners = () => {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [showGenericHint, setShowGenericHint] = useState(false);
  // l'evento di installazione di Chrome si conserva anche se il banner è stato chiuso
  const savedPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const waitingWorker = useRef<ServiceWorker | null>(null);

  // Service worker: registrazione e controllo aggiornamenti
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let registration: ServiceWorkerRegistration | null = null;

    const markWaiting = (worker: ServiceWorker | null) => {
      if (worker && navigator.serviceWorker.controller) {
        waitingWorker.current = worker;
        setUpdateReady(true);
      }
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        markWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed") markWaiting(worker);
          });
        });
      })
      .catch((e) => console.error("Service worker non registrato:", e));

    // Quando l'utente torna sull'app controlla se c'è una versione nuova
    const onVisible = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Proposta di installazione
  useEffect(() => {
    if (isStandalone()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      savedPrompt.current = e as BeforeInstallPromptEvent;
      if (!readDismissed()) setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onRequest = () => {
      if (isStandalone()) {
        alert("EcoDispensa è già installata: la trovi tra le app del telefono.");
        return;
      }
      if (savedPrompt.current) {
        setInstallEvent(savedPrompt.current);
        return;
      }
      if (isIos()) {
        setShowIosHint(true);
        return;
      }
      setShowGenericHint(true);
    };
    window.addEventListener("eco:install-request", onRequest);
    const onInstalled = () => {
      setInstallEvent(null);
      setShowIosHint(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // Su iPhone/iPad non esiste il pulsante automatico: spieghiamo come fare
    if (isIos() && !readDismissed()) setShowIosHint(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("eco:install-request", onRequest);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismissInstall = () => {
    saveDismissed();
    setInstallEvent(null);
    setShowIosHint(false);
    setShowGenericHint(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice.catch(() => null);
    if (choice?.outcome !== "accepted") saveDismissed();
    else savedPrompt.current = null;
    setInstallEvent(null);
  };

  const applyUpdate = () => {
    waitingWorker.current?.postMessage({ type: "SKIP_WAITING" });
    setUpdateReady(false);
  };

  if (!updateReady && !installEvent && !showIosHint && !showGenericHint) return null;

  return (
    <div
      className="fixed inset-x-0 z-40 mx-auto w-full max-w-md px-3 space-y-2 pointer-events-none"
      style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
    >
      {updateReady && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-gray-900 text-white px-4 py-3 shadow-lg">
          <RefreshCw size={18} className="shrink-0 text-emerald-400" />
          <p className="flex-1 text-sm">È disponibile una nuova versione.</p>
          <button
            type="button"
            onClick={applyUpdate}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-400"
          >
            Aggiorna
          </button>
        </div>
      )}

      {installEvent && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-lg">
          <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">Installa EcoDispensa</p>
            <p className="text-xs text-gray-500">Aprila dalla schermata Home come un'app.</p>
          </div>
          <button
            type="button"
            onClick={install}
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Download size={16} />
            Installa
          </button>
          <button
            type="button"
            onClick={dismissInstall}
            className="p-1 text-gray-400 hover:text-gray-600"
            aria-label="Chiudi"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {showGenericHint && !installEvent && !showIosHint && (
        <div className="pointer-events-auto rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-lg">
          <div className="flex items-start gap-3">
            <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="flex-1 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">Installa EcoDispensa</p>
              <p className="mt-1">
                Apri il menu del browser (i tre puntini ⋮ in alto a destra) e scegli <b>Installa app</b> oppure{" "}
                <b>Aggiungi a schermata Home</b>. Se non compare, apri l'app da Chrome all'indirizzo ecodispensa.vercel.app.
              </p>
            </div>
            <button type="button" onClick={dismissInstall} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Chiudi">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {showIosHint && !installEvent && (
        <div className="pointer-events-auto rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-lg">
          <div className="flex items-start gap-3">
            <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="flex-1 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">Installa EcoDispensa sull'iPhone</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>
                  Tocca <Share size={15} className="inline align-[-2px] text-blue-500" /> <b>Condividi</b> (in Safari è in basso, in Chrome
                  in alto a destra)
                </li>
                <li>
                  Scorri e scegli <SquarePlus size={15} className="inline align-[-2px]" /> <b>Aggiungi alla schermata Home</b>
                </li>
                <li>Tocca <b>Aggiungi</b> e apri EcoDispensa dall'icona</li>
              </ol>
            </div>
            <button
              type="button"
              onClick={dismissInstall}
              className="p-1 text-gray-400 hover:text-gray-600"
              aria-label="Chiudi"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
