import React, { useRef, useState } from "react";
import { Camera, Loader2, Sparkles } from "lucide-react";
import { RECIPE_TINTS } from "../constants";
import { generateRecipeImage, uploadRecipePhoto } from "../services/api";

export const tintFor = (text: string) => {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return RECIPE_TINTS[h % RECIPE_TINTS.length];
};

/**
 * Foto del piatto di una ricetta salvata.
 * Senza foto mostra due azioni: crearla con l'AI oppure scattare la propria.
 */
export const RecipePhoto = ({
  recipeId,
  imageUrl,
  title,
  onChange,
  onCreditsChange,
  className = "h-48",
  rounded = "rounded-3xl",
}: {
  recipeId: string | null;
  imageUrl: string | null;
  title: string;
  onChange?: (url: string) => void;
  onCreditsChange?: (credits: number) => void;
  className?: string;
  rounded?: string;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "ai" | "upload">(null);
  const [error, setError] = useState<string | null>(null);

  const createWithAi = async () => {
    if (!recipeId || busy) return;
    setBusy("ai");
    setError(null);
    const r = await generateRecipeImage(recipeId);
    setBusy(null);
    if (r.ok === true) {
      onChange?.(r.imageUrl);
      if (r.remainingCredits !== null) onCreditsChange?.(r.remainingCredits);
    } else if (r.ok === false) {
      setError(r.message);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !recipeId) return;
    setBusy("upload");
    setError(null);
    try {
      const url = await uploadRecipePhoto(recipeId, file);
      onChange?.(url);
    } catch (err) {
      console.error("upload photo error:", err);
      setError("Caricamento non riuscito. Riprova.");
    } finally {
      setBusy(null);
    }
  };

  const fileInput = (
    <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
  );

  if (imageUrl) {
    return (
      <div className={`relative overflow-hidden ${rounded} ${className} bg-stone`}>
        <img src={imageUrl} alt={`Foto di ${title}`} className="h-full w-full object-cover" loading="lazy" />
        {recipeId && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!!busy}
            className="absolute bottom-3 right-3 flex h-10 items-center gap-1.5 rounded-full bg-white/90 px-3 text-xs font-bold text-ink backdrop-blur"
          >
            {busy === "upload" ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            La mia foto
          </button>
        )}
        {fileInput}
      </div>
    );
  }

  return (
    <div className={`relative flex flex-col items-center justify-center gap-3 overflow-hidden px-4 text-center ${rounded} ${className} ${tintFor(title)}`}>
      {busy === "ai" ? (
        <>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/80">
            <Sparkles size={22} className="animate-pulse text-ink" />
          </span>
          <p className="text-sm font-bold text-ink">Sto impiattando la foto…</p>
          <p className="text-xs text-ink/70">Ci vogliono circa 15 secondi</p>
        </>
      ) : recipeId ? (
        <>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={createWithAi}
              disabled={!!busy}
              className="flex h-11 items-center gap-1.5 rounded-2xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              <Sparkles size={16} className="text-lemon" />
              Crea foto con AI
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!!busy}
              className="flex h-11 items-center gap-1.5 rounded-2xl bg-white px-4 text-sm font-bold text-ink disabled:opacity-60"
            >
              {busy === "upload" ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              Scatta la tua
            </button>
          </div>
          <p className="text-xs font-medium text-ink/70">La foto AI conta come una ricetta generata</p>
          {error && <p className="text-xs font-bold text-[#9B2335]">{error}</p>}
        </>
      ) : (
        <span className="font-display text-6xl font-extrabold text-ink/20">{(title.trim()[0] ?? "?").toUpperCase()}</span>
      )}
      {fileInput}
    </div>
  );
};
