import React, { useEffect, useRef, useState } from "react";
import { CalendarCheck, Camera, Check, Loader2, Share2, ShoppingCart, Star, Swords, Utensils } from "lucide-react";
import { Category, CookResult, IngredientUsage, Recipe } from "../types";
import { RecipeMeta, RecipeStatus, updateRecipe, uploadRecipePhoto } from "../services/api";
import { shareRecipe, ShareOutcome } from "../services/share";
import { findFoodGuide } from "../foodGuide";
import { RecipePhoto } from "./RecipePhoto";
import { RecipeContent } from "./RecipeContent";
import { Sheet } from "./ui";

type AddShopping = (
  items: Array<{ name: string; category: Category; quantity?: number | null; unit?: string | null }>
) => Promise<void>;

/** Stelle da 1 a 5, toccabili */
export const Stars = ({
  value,
  onChange,
  size = 30,
  dark = false,
}: {
  value: number | null;
  onChange?: (v: number) => void;
  size?: number;
  dark?: boolean;
}) => (
  <div className="flex gap-1" role={onChange ? "radiogroup" : undefined} aria-label="Voto">
    {[1, 2, 3, 4, 5].map((n) => {
      const on = (value ?? 0) >= n;
      const cls = on ? "fill-lemon text-lemon" : dark ? "text-white/30" : "text-[#C5CCC7]";
      return onChange ? (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? "stella" : "stelle"}`}
          onClick={() => onChange(n)}
          className="flex h-11 w-11 items-center justify-center active:scale-90"
        >
          <Star size={size} className={cls} strokeWidth={1.8} />
        </button>
      ) : (
        <Star key={n} size={size} className={cls} strokeWidth={1.8} aria-hidden="true" />
      );
    })}
  </div>
);

const missingName = (m: any) => (typeof m === "string" ? m : m?.name ?? String(m));

const SHARE_FEEDBACK: Record<ShareOutcome, string | null> = {
  shared: null,
  cancelled: null,
  copied: "Link copiato: incollalo dove vuoi.",
  error: "Non sono riuscito a condividere. Riprova.",
};

/**
 * Dettaglio di una ricetta con il percorso completo:
 * "Pensi di prepararla?" → "L'ho cucinato!" → festa, voto, foto → condividi o sfida un amico.
 */
export const RecipeDetailSheet = ({
  open,
  onClose,
  recipe,
  recipeId,
  meta,
  onMetaChange,
  onCook,
  onAddShoppingItems,
  footerLeft,
  footerOverride,
}: {
  open: boolean;
  onClose: () => void;
  recipe: Recipe | null;
  recipeId: string | null;
  meta: RecipeMeta;
  onMetaChange?: (patch: Partial<RecipeMeta>) => void;
  onCook?: (ingredients: IngredientUsage[]) => Promise<CookResult | void> | CookResult | void;
  onAddShoppingItems?: AddShopping;
  footerLeft?: React.ReactNode;
  footerOverride?: React.ReactNode;
}) => {
  const [status, setStatus] = useState<RecipeStatus>(meta.status);
  const [rating, setRating] = useState<number | null>(meta.rating);
  const [imageUrl, setImageUrl] = useState<string | null>(meta.imageUrl);
  const [cooking, setCooking] = useState(false);
  const [celebration, setCelebration] = useState<CookResult | null>(null);
  const [missingAdded, setMissingAdded] = useState(false);
  const [sharing, setSharing] = useState<null | "share" | "challenge">(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStatus(meta.status);
    setRating(meta.rating);
    setImageUrl(meta.imageUrl);
    setCelebration(null);
    setMissingAdded(false);
    setFeedback(null);
  }, [recipeId, open]);

  if (!recipe) return null;

  const used = recipe.ingredientsUsed?.length ?? 0;
  const missing = recipe.missingIngredients ?? [];
  const canPersist = !!recipeId;

  const patch = (p: Partial<RecipeMeta>) => onMetaChange?.(p);

  const plan = async () => {
    setStatus("planned");
    patch({ status: "planned" });
    if (recipeId) await updateRecipe(recipeId, { status: "planned" });
  };

  const addMissing = async () => {
    if (!onAddShoppingItems || !missing.length) return;
    await onAddShoppingItems(
      missing.map((m) => {
        const name = missingName(m);
        return { name, category: findFoodGuide(name)?.category ?? Category.PANTRY };
      })
    );
    setMissingAdded(true);
  };

  const cook = async () => {
    if (!onCook || cooking) return;
    setCooking(true);
    const result = (await onCook(recipe.ingredientsUsed ?? [])) || { used: 0, expiring: 0 };
    setCooking(false);
    setStatus("cooked");
    patch({ status: "cooked" });
    setCelebration(result);
    if (recipeId) {
      await updateRecipe(recipeId, {
        status: "cooked",
        cooked_at: new Date().toISOString(),
        saved_items_count: result.used,
      });
    }
  };

  const rate = async (v: number) => {
    setRating(v);
    patch({ rating: v });
    if (recipeId) await updateRecipe(recipeId, { rating: v });
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !recipeId) return;
    setUploading(true);
    try {
      const url = await uploadRecipePhoto(recipeId, file);
      setImageUrl(url);
      patch({ imageUrl: url });
    } catch (err) {
      console.error("upload photo error:", err);
      setFeedback("Caricamento della foto non riuscito. Riprova.");
    } finally {
      setUploading(false);
    }
  };

  const share = async (challenge: boolean) => {
    if (!recipeId) return;
    setSharing(challenge ? "challenge" : "share");
    setFeedback(null);
    const outcome = await shareRecipe({
      recipeId,
      title: recipe.title,
      imageUrl,
      used: celebration?.used ?? used,
      rating,
      challenge,
    });
    setSharing(null);
    setFeedback(SHARE_FEEDBACK[outcome]);
  };

  const photoInput = (
    <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
  );

  const shareButtons = (dark: boolean) => (
    <div className="grid grid-cols-2 gap-2.5">
      <button
        type="button"
        onClick={() => share(false)}
        disabled={!!sharing}
        className={`flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-bold disabled:opacity-60 ${
          dark ? "bg-white text-ink" : "bg-ink text-white"
        }`}
      >
        {sharing === "share" ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} />}
        Condividi
      </button>
      <button
        type="button"
        onClick={() => share(true)}
        disabled={!!sharing}
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-tangerine text-sm font-bold text-ink disabled:opacity-60"
      >
        {sharing === "challenge" ? <Loader2 size={18} className="animate-spin" /> : <Swords size={18} />}
        Sfida un amico
      </button>
    </div>
  );

  // ---------- Riquadro del percorso, in base allo stato ----------
  const journeyCard = (() => {
    if (status === "cooked") {
      return (
        <section className="flex flex-col gap-3 rounded-3xl bg-forest p-4 text-white">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-bold text-[#BFE3CB]">
              <Check size={16} /> L'hai cucinata
            </span>
            {canPersist && <Stars value={rating} onChange={rate} size={22} dark />}
          </div>
          {canPersist && !imageUrl && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-lemon text-sm font-bold text-ink"
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
              Fai vedere com'è venuta
            </button>
          )}
          {canPersist && shareButtons(true)}
        </section>
      );
    }
    if (status === "planned") {
      return (
        <section className="flex flex-col gap-3 rounded-3xl bg-mint p-4">
          <p className="flex items-center gap-2 font-display text-lg font-bold text-[#155A34]">
            <CalendarCheck size={20} /> In programma
          </p>
          <p className="text-sm text-[#1E5A35]">
            Quando l'hai preparata tocca <span className="font-bold">"L'ho cucinato!"</span>: aggiorno la dispensa e
            vediamo quanto hai salvato.
          </p>
          {missing.length > 0 && onAddShoppingItems && (
            <button
              type="button"
              onClick={addMissing}
              disabled={missingAdded}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-bold text-ink disabled:opacity-70"
            >
              {missingAdded ? <Check size={16} /> : <ShoppingCart size={16} />}
              {missingAdded
                ? "Aggiunti alla lista della spesa"
                : `Aggiungi ${missing.length === 1 ? "l'ingrediente mancante" : `i ${missing.length} mancanti`} alla spesa`}
            </button>
          )}
        </section>
      );
    }
    return (
      <section className="flex flex-col gap-3 rounded-3xl bg-lemon p-4 text-ink">
        <p className="font-display text-xl font-extrabold">Pensi di prepararla?</p>
        <p className="text-sm text-[#3D3A1F]">
          {used > 0
            ? `Usa ${used === 1 ? "1 prodotto" : `${used} prodotti`} che hai già in casa`
            : "Una buona idea per la tua prossima cena"}
          {missing.length > 0 ? `; ${missing.length === 1 ? "manca 1 ingrediente" : `mancano ${missing.length} ingredienti`}.` : ", e hai tutto."}
        </p>
        <button
          type="button"
          onClick={plan}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-bold text-white"
        >
          <CalendarCheck size={18} className="text-lemon" /> Sì, la preparo
        </button>
      </section>
    );
  })();

  const footer =
    footerOverride ??
    (onCook ? (
      <div className="flex gap-2.5">
        {footerLeft}
        <button
          type="button"
          onClick={cook}
          disabled={cooking}
          className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[15px] font-bold text-white disabled:opacity-60"
        >
          {cooking ? <Loader2 size={20} className="animate-spin" /> : <Utensils size={20} />}
          {status === "cooked" ? "L'ho rifatta!" : "L'ho cucinato!"}
        </button>
      </div>
    ) : (
      footerLeft ?? null
    ));

  return (
    <>
      <Sheet open={open} onClose={onClose} title={null} footer={footer}>
        <div className="flex flex-col gap-5">
          {imageUrl && (
            <RecipePhoto
              recipeId={recipeId}
              imageUrl={imageUrl}
              title={recipe.title}
              onChange={(url) => {
                setImageUrl(url);
                patch({ imageUrl: url });
              }}
              className="h-56"
            />
          )}
          <h2 className="font-display text-[26px] font-extrabold leading-tight text-ink">{recipe.title}</h2>
          {journeyCard}
          {feedback && !celebration && <p className="text-sm font-semibold text-emerald-700">{feedback}</p>}
          <RecipeContent recipe={recipe} />
        </div>
        {photoInput}
      </Sheet>

      {/* ---------- Festa dopo "L'ho cucinato!" ---------- */}
      {celebration && open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 backdrop-blur-sm animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ricetta cucinata"
            className="flex max-h-[92vh] w-full max-w-md flex-col gap-5 overflow-y-auto rounded-t-4xl bg-forest px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 text-white animate-slide-up"
          >
            <div className="flex flex-col gap-2">
              <span className="self-start rounded-full bg-lemon px-3 py-1 text-xs font-bold text-ink">Ottimo lavoro!</span>
              <h2 className="font-display text-[30px] font-extrabold leading-[1.05]">
                {celebration.used > 0
                  ? `Hai usato ${celebration.used === 1 ? "1 prodotto" : `${celebration.used} prodotti`} di casa`
                  : "Ricetta fatta!"}
              </h2>
              <p className="text-[15px] text-[#BFE3CB]">
                {celebration.expiring > 0
                  ? `${celebration.expiring === 1 ? "Uno stava" : `${celebration.expiring} stavano`} per scadere: salvati dalla spazzatura. La dispensa è già aggiornata.`
                  : "La dispensa è già aggiornata."}
              </p>
            </div>

            {canPersist && (
              <>
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-bold">Com'è venuta?</p>
                  <Stars value={rating} onChange={rate} dark />
                </div>

                {imageUrl ? (
                  <img src={imageUrl} alt={`Il tuo ${recipe.title}`} className="h-48 w-full rounded-3xl object-cover" />
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-3xl border-2 border-dashed border-white/30 text-sm font-bold"
                  >
                    {uploading ? <Loader2 size={24} className="animate-spin" /> : <Camera size={26} className="text-lemon" />}
                    Fai vedere com'è venuta
                    <span className="text-xs font-semibold text-[#BFE3CB]">La foto diventa la copertina nel tuo Ricettario</span>
                  </button>
                )}

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-bold">Fallo sapere</p>
                  {shareButtons(true)}
                  {feedback && <p className="text-sm font-semibold text-lemon">{feedback}</p>}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setCelebration(null)}
              className="h-[52px] rounded-2xl bg-white/10 text-[15px] font-bold text-white"
            >
              Fatto
            </button>
          </div>
          {photoInput}
        </div>
      )}
    </>
  );
};
