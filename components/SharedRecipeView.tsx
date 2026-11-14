import React, { useEffect, useState } from "react";
import { Loader2, Swords, X } from "lucide-react";
import { fetchSharedRecipe, SharedRecipe } from "../services/api";
import { RecipeContent } from "./RecipeContent";
import { Stars } from "./RecipeDetailSheet";
import { Spinner } from "./ui";
import { Recipe } from "../types";

const toRecipe = (r: SharedRecipe): Recipe => ({
  title: r.title,
  difficulty: r.difficulty ?? "",
  time: r.time ?? "",
  description: r.description ?? "",
  ingredientsUsed: Array.isArray(r.ingredients_used) ? r.ingredients_used : [],
  missingIngredients: Array.isArray(r.missing_ingredients) ? r.missing_ingredients : [],
  steps: Array.isArray(r.steps) ? r.steps : [],
});

/**
 * Ricetta aperta da un link condiviso (o da una sfida).
 * Si vede anche senza account; per salvarla serve accedere o registrarsi.
 */
export const SharedRecipeView = ({
  token,
  challenge,
  loggedIn,
  onAccept,
  onClose,
}: {
  token: string;
  challenge: boolean;
  loggedIn: boolean;
  onAccept: () => Promise<void>;
  onClose: () => void;
}) => {
  const [recipe, setRecipe] = useState<SharedRecipe | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchSharedRecipe(token).then(setRecipe);
  }, [token]);

  const accept = async () => {
    setBusy(true);
    await onAccept();
    setBusy(false);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-ground">
      <div className="flex items-center justify-between px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <span className="flex items-center gap-2">
          <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-xl" />
          <span className="font-display text-lg font-extrabold text-ink">EcoDispensa</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink"
        >
          <X size={20} />
        </button>
      </div>

      {recipe === undefined ? (
        <Spinner label="Apro la ricetta…" />
      ) : recipe === null ? (
        <div className="mx-5 flex flex-col items-center gap-3 rounded-4xl bg-white px-6 py-10 text-center">
          <p className="font-display text-xl font-bold text-ink">Ricetta non trovata</p>
          <p className="text-sm text-muted">Il link potrebbe essere sbagliato o la ricetta è stata eliminata.</p>
          <button type="button" onClick={onClose} className="h-11 rounded-2xl bg-forest px-5 text-sm font-bold text-white">
            Vai all'app
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-5 pb-40">
          {challenge && (
            <section className="flex items-start gap-3 rounded-3xl bg-tangerine p-4 text-ink">
              <Swords size={24} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-display text-xl font-extrabold leading-tight">Sei stato sfidato!</p>
                <p className="text-sm">Un amico l'ha cucinata e ti sfida a rifarla. Accetti?</p>
              </div>
            </section>
          )}

          {recipe.image_url && (
            <img src={recipe.image_url} alt={`Foto di ${recipe.title}`} className="h-60 w-full rounded-3xl object-cover" />
          )}

          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[30px] font-extrabold leading-tight text-ink">{recipe.title}</h1>
            {recipe.rating ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Stars value={recipe.rating} size={18} /> voto di chi l'ha cucinata
              </div>
            ) : null}
          </div>

          <RecipeContent recipe={toRecipe(recipe)} />
        </div>
      )}

      {recipe && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md bg-gradient-to-b from-ground/0 via-ground to-ground px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6">
          <button
            type="button"
            onClick={accept}
            disabled={busy}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-forest text-base font-bold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 size={20} className="animate-spin text-honey" /> : challenge ? <Swords size={20} className="text-honey" /> : null}
            {challenge
              ? loggedIn
                ? "Accetto la sfida"
                : "Accetto la sfida: entra o registrati"
              : loggedIn
              ? "Salva nel mio Ricettario"
              : "Salvala: entra o registrati gratis"}
          </button>
          {!loggedIn && (
            <p className="mt-2 text-center text-xs text-muted">
              EcoDispensa ricorda cosa hai in casa, ti avvisa prima delle scadenze e ti suggerisce cosa cucinare.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
