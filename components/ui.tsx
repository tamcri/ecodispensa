import React, { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { getCategoryTheme, getInitial } from "../constants";

/** Titolo grande in cima a ogni schermata */
export const ScreenHeader = ({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) => (
  <div className="flex items-end justify-between gap-3">
    <div className="min-w-0">
      <h1 className="font-display text-[34px] leading-none font-extrabold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
    </div>
    {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
  </div>
);

/** Riquadro colorato con l'iniziale del prodotto */
export const Monogram = ({
  name,
  category,
  size = "md",
}: {
  name: string;
  category: string;
  size?: "sm" | "md" | "lg";
}) => {
  const theme = getCategoryTheme(category);
  const dims =
    size === "sm" ? "h-9 w-9 rounded-xl text-base" : size === "lg" ? "h-12 w-12 rounded-2xl text-xl" : "h-10 w-10 rounded-[14px] text-lg";
  return (
    <span className={`flex shrink-0 items-center justify-center font-display font-extrabold ${dims} ${theme.tile}`} aria-hidden="true">
      {getInitial(name)}
    </span>
  );
};

/** Pannello che sale dal basso, usato per moduli e dettagli */
export const Sheet = ({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) => {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-4xl bg-ground animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0 font-display text-xl font-bold text-ink">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-ink"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-black/5 px-5 pb-safe pt-3"><div className="pb-3">{footer}</div></div>}
      </div>
    </div>
  );
};

/** Riduce un'immagine da canvas/video a max `maxSide` px e la restituisce come data URL jpeg */
function drawScaled(source: HTMLVideoElement | HTMLImageElement, w: number, h: number, maxSide = 1024) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export async function fileToDataUrl(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return drawScaled(img, img.naturalWidth, img.naturalHeight);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

/** Lettore di codici a barre: quello del browser se c'è (Chrome Android), altrimenti la versione WebAssembly. */
async function createBarcodeDetector(): Promise<any> {
  const Native = (window as any).BarcodeDetector;
  if (Native) {
    try {
      const supported: string[] = await Native.getSupportedFormats();
      if (BARCODE_FORMATS.some((f) => supported.includes(f))) return new Native({ formats: BARCODE_FORMATS });
    } catch {
      /* passo alla versione WebAssembly */
    }
  }
  const mod = await import("barcode-detector/ponyfill");
  return new mod.BarcodeDetector({ formats: BARCODE_FORMATS as any });
}

export type CameraMode = "photo" | "barcode";

/** Fotocamera a schermo intero: foto per il riconoscimento AI o lettura del codice a barre */
export const CameraCapture = ({
  open,
  onClose,
  onCapture,
  onBarcode,
  initialMode = "barcode",
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  onBarcode?: (code: string) => void;
  initialMode?: CameraMode;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraError, setCameraError] = useState(false);
  const [mode, setMode] = useState<CameraMode>(onBarcode ? initialMode : "photo");
  const [scanHint, setScanHint] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode(onBarcode ? initialMode : "photo");
      setScanHint(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCameraError(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(true);
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((err) => {
        console.error("Errore fotocamera:", err);
        setCameraError(true);
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  // Lettura continua del codice a barre finché ne trova uno
  useEffect(() => {
    if (!open || mode !== "barcode" || !onBarcode || cameraError) return;
    let stopped = false;
    let timer: number | undefined;
    let detector: any = null;
    const started = Date.now();

    const tick = async () => {
      if (stopped) return;
      const v = videoRef.current;
      try {
        if (!detector) detector = await createBarcodeDetector();
        if (v && v.readyState >= 2 && v.videoWidth) {
          const found = await detector.detect(v);
          const code = found?.[0]?.rawValue;
          if (code && !stopped) {
            stopped = true;
            try {
              navigator.vibrate?.(60);
            } catch {
              /* niente vibrazione */
            }
            onBarcode(String(code));
            return;
          }
        }
        if (Date.now() - started > 12000) {
          setScanHint("Non lo trovo: avvicina il codice e tienilo fermo, oppure passa a Foto.");
        }
      } catch (e) {
        console.error("barcode scan error:", e);
        setScanHint("Il lettore di codici non è disponibile qui: usa la modalità Foto.");
        return;
      }
      timer = window.setTimeout(tick, 300);
    };
    tick();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [open, mode, cameraError]);

  if (!open) return null;

  const shoot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const data = drawScaled(v, v.videoWidth, v.videoHeight);
    if (data) onCapture(data);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (mode === "barcode" && onBarcode) {
      try {
        const detector = await createBarcodeDetector();
        const bitmap = await createImageBitmap(file);
        const found = await detector.detect(bitmap);
        const code = found?.[0]?.rawValue;
        if (code) {
          onBarcode(String(code));
          return;
        }
        setScanHint("Nessun codice a barre nella foto. Riprova o passa a Foto.");
      } catch {
        setScanHint("Non riesco a leggere il codice da questa foto.");
      }
      return;
    }
    const data = await fileToDataUrl(file);
    if (data) onCapture(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {!cameraError ? (
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-white">
          <Camera size={40} className="text-lemon" />
          <p className="text-base">Non riesco ad aprire la fotocamera qui. Puoi scegliere una foto o scattarla dall'app Fotocamera.</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-12 items-center gap-2 rounded-2xl bg-lemon px-5 font-bold text-ink"
          >
            <ImagePlus size={20} /> Scegli una foto
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      {/* mirino per il codice a barre */}
      {mode === "barcode" && !cameraError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-40 w-[78%] max-w-sm rounded-3xl border-[3px] border-lemon shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
            <span className="absolute left-4 right-4 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-lemon/80" />
          </div>
        </div>
      )}

      <div className="absolute left-0 right-0 top-0 flex flex-col items-center gap-3 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        {onBarcode && (
          <div role="tablist" aria-label="Modalità fotocamera" className="grid grid-cols-2 gap-1 rounded-full bg-black/50 p-1 backdrop-blur-md">
            {(
              [
                ["barcode", "Codice a barre"],
                ["photo", "Foto"],
              ] as Array<[CameraMode, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => {
                  setMode(id);
                  setScanHint(null);
                }}
                className={`h-9 rounded-full px-4 text-[13px] font-bold ${mode === id ? "bg-lemon text-ink" : "text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <p className="text-center text-sm font-semibold text-white/90">
          {mode === "barcode"
            ? "Inquadra il codice a barre della confezione"
            : "Inquadra il prodotto: frutta, verdura o qualsiasi confezione"}
        </p>
        {scanHint && <p className="rounded-2xl bg-black/60 px-3 py-2 text-center text-xs font-semibold text-white">{scanHint}</p>}
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi fotocamera"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md"
        >
          <X size={24} />
        </button>
        {!cameraError && mode === "photo" && (
          <button
            type="button"
            onClick={shoot}
            aria-label="Scatta"
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/50 active:scale-95"
          >
            <span className="h-16 w-16 rounded-full bg-lemon" />
          </button>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Scegli dalla galleria"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md"
        >
          <ImagePlus size={22} />
        </button>
      </div>
    </div>
  );
};

export const AnalyzingOverlay = ({ open, label }: { open: boolean; label: string }) =>
  open ? (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink/70 text-white backdrop-blur-sm">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-lemon text-ink">
        <Sparkles size={28} className="animate-pulse" />
      </span>
      <p className="font-display text-xl font-bold">{label}</p>
    </div>
  ) : null;

export const Spinner = ({ label }: { label?: string }) => (
  <div className="flex flex-col items-center gap-2 py-8 text-muted">
    <Loader2 className="animate-spin text-emerald-600" size={30} />
    {label && <p className="text-sm font-medium">{label}</p>}
  </div>
);

/** Pulsante/etichetta crediti in stile giallo */
export const CreditsBadge = ({
  credits,
  dark = false,
  onClick,
}: {
  credits: number | null;
  dark?: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold ${
      dark ? "bg-ink text-lemon" : "bg-lemon text-ink"
    }`}
    title="Crediti EcoChef"
  >
    <Sparkles size={15} />
    {credits === null ? "…" : credits} {credits === 1 ? "credito" : "crediti"}
  </button>
);

const QTY_UNITS = ["pz", "kg", "g", "l"];
const stepFor = (unit: string) => (unit === "g" ? 50 : unit === "kg" || unit === "l" ? 0.5 : 1);
const fmtQty = (n: number) => (Number.isFinite(n) ? String(parseFloat(n.toFixed(3))).replace(".", ",") : "");

/**
 * Quantità con − e +, campo largo e unità a pulsanti.
 * Toccando il numero viene selezionato tutto, così quello che scrivi lo sostituisce.
 */
export const QuantityInput = ({
  id,
  value,
  unit,
  onChange,
  onUnitChange,
  label = "Quantità",
  compact = false,
}: {
  id: string;
  value: number;
  unit: string;
  onChange: (qty: number) => void;
  onUnitChange: (unit: string) => void;
  label?: string;
  compact?: boolean;
}) => {
  const [text, setText] = useState(fmtQty(value));

  // si riallinea quando il valore cambia da fuori (es. pulsanti, prodotto scansionato)
  useEffect(() => {
    const parsed = parseFloat(text.replace(",", "."));
    if (parsed !== value) setText(fmtQty(value));
  }, [value]);

  const commit = (raw: string) => {
    setText(raw);
    const parsed = parseFloat(raw.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 0) onChange(parsed);
  };

  const bump = (dir: 1 | -1) => {
    const next = Math.max(0, parseFloat(((value || 0) + dir * stepFor(unit)).toFixed(3)));
    onChange(next);
    setText(fmtQty(next));
  };

  const btn = `flex shrink-0 items-center justify-center rounded-2xl bg-white text-xl font-bold text-ink ring-1 ring-black/5 active:scale-95 ${
    compact ? "h-11 w-11" : "h-12 w-12"
  }`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={compact ? "sr-only" : "block text-xs font-bold text-muted"}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => bump(-1)} aria-label="Diminuisci" className={btn}>
          −
        </button>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => commit(e.target.value.replace(/[^\d.,]/g, ""))}
          onBlur={() => setText(fmtQty(value))}
          className={`min-w-0 flex-1 rounded-2xl border-0 bg-white px-3 text-center font-display font-extrabold text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-emerald-500 ${
            compact ? "h-11 text-lg" : "h-12 text-xl"
          }`}
        />
        <button type="button" onClick={() => bump(1)} aria-label="Aumenta" className={btn}>
          +
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Unità di misura">
        {QTY_UNITS.map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={unit === u}
            onClick={() => onUnitChange(u)}
            className={`h-9 rounded-xl text-sm font-bold transition-colors ${
              unit === u ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-black/5"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  );
};
