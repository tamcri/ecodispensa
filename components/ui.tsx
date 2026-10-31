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

/** Fotocamera a schermo intero per riconoscere un prodotto */
export const CameraCapture = ({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraError, setCameraError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCameraError(false);

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
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

    if (!navigator.mediaDevices?.getUserMedia) setCameraError(true);

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

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

      <p className="pointer-events-none absolute left-0 right-0 top-0 pt-[max(1.25rem,env(safe-area-inset-top))] text-center text-sm font-semibold text-white/90">
        Inquadra il prodotto o l'etichetta
      </p>

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi fotocamera"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md"
        >
          <X size={24} />
        </button>
        {!cameraError && (
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
