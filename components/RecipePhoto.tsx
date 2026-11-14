import React, { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { RECIPE_TINTS } from "../constants";
import { uploadRecipePhoto } from "../services/api";

export const tintFor = (text: string) => {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return RECIPE_TINTS[h % RECIPE_TINTS.length];
};

/**
 * Foto del piatto di una ricetta salvata.
 * Senza foto invita l'utente a fotografare il piatto che ha cucinato.
 */
export const RecipePhoto = ({
  recipeId,
  imageUrl,
  title,
  onChange,
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !recipeId) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadRecipePhoto(recipeId, file);
      onChange?.(url);
    } catch (err) {
      console.error("upload photo error:", err);
      setError("Caricamento non riuscito. Riprova.");
    } finally {
      setBusy(false);
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
            disabled={busy}
            className="absolute bottom-3 right-3 flex h-10 items-center gap-1.5 rounded-full bg-white/90 px-3 text-xs font-bold text-ink backdrop-blur"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            Cambia foto
          </button>
        )}
        {fileInput}
      </div>
    );
  }

  return (
    <div className={`relative flex flex-col items-center justify-center gap-2.5 overflow-hidden px-5 text-center ${rounded} ${className} ${tintFor(title)}`}>
      {recipeId ? (
        <>
          <p className="font-display text-lg font-bold leading-tight text-ink">L'hai cucinato? Fai vedere com'è venuto!</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex h-11 items-center gap-2 rounded-2xl bg-forest px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} className="text-honey" />}
            Fotografa il tuo piatto
          </button>
          {error && <p className="text-xs font-bold text-[#8A1F2B]">{error}</p>}
        </>
      ) : (
        <span className="font-display text-6xl font-extrabold text-ink/20">{(title.trim()[0] ?? "?").toUpperCase()}</span>
      )}
      {fileInput}
    </div>
  );
};
