import React, { useEffect, useMemo, useState } from "react";
import { ChefHat, ChevronRight, Plus } from "lucide-react";
import { PantryItem, ShoppingItem, ViewState } from "../types";
import { daysUntil, expiryLabel, getCategoryTheme, getInitial } from "../constants";
import { CreditsBadge } from "./ui";
import { fetchSavedRecipes, SavedRecipe } from "../services/api";
import { tintFor } from "./RecipePhoto";

interface HomeViewProps {
  pantryItems: PantryItem[];
  shoppingItems: ShoppingItem[];
  credits: number | null;
  userInitial: string;
  onOpenProfile: () => void;
  onNavigate: (view: ViewState) => void;
  onOpenRecipe?: (id: string) => void;
}

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Buongiorno!";
  if (h < 18) return "Buon pomeriggio!";
  return "Buonasera!";
};

const todayLabel = () => {
  const s = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const HomeView: React.FC<HomeViewProps> = ({
  pantryItems,
  shoppingItems,
  credits,
  userInitial,
  onOpenProfile,
  onNavigate,
  onOpenRecipe,
}) => {
  const [recipes, setRecipes] = useState<SavedRecipe[] | null>(null);

  useEffect(() => {
    fetchSavedRecipes()
      .then((r) => setRecipes(r.slice(0, 6)))
      .catch(() => setRecipes([]));
  }, []);

  const expiring = useMemo(
    () =>
      pantryItems
        .map((item) => ({ item, days: daysUntil(item.expiryDate) }))
        .filter((x) => x.days !== null && (x.days as number) <= 3)
        .sort((a, b) => (a.days as number) - (b.days as number)),
    [pantryItems]
  );

  const categoriesCount = useMemo(() => new Set(pantryItems.map((i) => i.category)).size, [pantryItems]);
  const toBuy = shoppingItems.filter((i) => !i.isChecked).length;
  const inCart = shoppingItems.length - toBuy;
  const cartPct = shoppingItems.length ? Math.round((inCart / shoppingItems.length) * 100) : 0;

  const shown = expiring.slice(0, 3);
  const extra = expiring.length - shown.length;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted">{todayLabel()}</p>
          <h1 className="mt-0.5 font-display text-[32px] font-extrabold leading-[1.05] tracking-tight text-ink">
            {greeting()}
            <br />
            Cosa salviamo oggi?
          </h1>
        </div>
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Profilo e impostazioni"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink font-display text-lg font-extrabold text-lemon"
        >
          {userInitial}
        </button>
      </div>

      <div>
        <CreditsBadge credits={credits} onClick={() => onNavigate("chef")} />
      </div>

      {/* Prodotti da salvare */}
      <section className="flex flex-col gap-3.5 rounded-4xl bg-forest p-5 text-white">
        {pantryItems.length === 0 ? (
          <>
            <span className="self-start rounded-full bg-lemon px-2.5 py-1 text-xs font-bold text-ink">Primo passo</span>
            <h2 className="font-display text-2xl font-bold leading-tight">Raccontami cosa hai in casa</h2>
            <p className="text-sm text-[#BFE3CB]">
              Aggiungi i prodotti della dispensa: ti avviso prima che scadano e EcoChef ti propone cosa cucinare.
            </p>
            <button
              type="button"
              onClick={() => onNavigate("pantry")}
              className="flex h-[50px] items-center justify-center gap-2 rounded-2xl bg-lemon font-bold text-ink"
            >
              <Plus size={20} /> Aggiungi prodotti
            </button>
          </>
        ) : expiring.length === 0 ? (
          <>
            <span className="self-start rounded-full bg-[#BFE3CB] px-2.5 py-1 text-xs font-bold text-ink">Tutto sotto controllo</span>
            <h2 className="font-display text-2xl font-bold leading-tight">Niente scade nei prossimi 3 giorni</h2>
            <p className="text-sm text-[#BFE3CB]">Hai {pantryItems.length} prodotti in dispensa. Vuoi un'idea per cucinarli?</p>
            <button
              type="button"
              onClick={() => onNavigate("chef")}
              className="flex h-[50px] items-center justify-center gap-2 rounded-2xl bg-lemon font-bold text-ink"
            >
              <ChefHat size={20} /> Cosa ci cucino?
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-tangerine px-2.5 py-1 text-xs font-bold text-ink">Da salvare</span>
              <button type="button" onClick={() => onNavigate("pantry")} className="text-[13px] font-semibold text-[#BFE3CB]">
                Vedi dispensa
              </button>
            </div>
            <h2 className="font-display text-2xl font-bold leading-tight">
              {expiring.length === 1
                ? "1 prodotto scade a breve"
                : `${expiring.length} prodotti scadono a breve`}
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {shown.map(({ item, days }) => (
                <div key={item.id} className="flex min-w-0 flex-col items-start gap-2 rounded-[18px] bg-white/[0.08] px-2.5 py-3">
                  <span
                    className={`flex h-[38px] w-[38px] items-center justify-center rounded-xl font-display text-lg font-extrabold ${getCategoryTheme(item.category).tile}`}
                  >
                    {getInitial(item.name)}
                  </span>
                  <span className="w-full truncate text-sm font-bold">{item.name}</span>
                  <span className={`text-xs font-bold ${(days as number) < 0 ? "text-[#FF9AA5]" : "text-[#FFB27F]"}`}>
                    {(days as number) === 0 ? "oggi" : (days as number) === 1 ? "domani" : expiryLabel(days).replace("Tra", "tra").replace("Scaduto", "scaduto")}
                  </span>
                </div>
              ))}
            </div>
            {extra > 0 && <p className="-mt-1 text-xs font-semibold text-[#BFE3CB]">e altri {extra}</p>}
            <button
              type="button"
              onClick={() => onNavigate("chef")}
              className="flex h-[50px] items-center justify-center gap-2 rounded-2xl bg-lemon font-bold text-ink active:scale-[0.99]"
            >
              <ChefHat size={20} /> Cosa ci cucino?
            </button>
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onNavigate("pantry")}
          className="flex flex-col items-start gap-1 rounded-3xl bg-mint p-4 text-left"
        >
          <span className="text-[13px] font-semibold text-[#1E5A35]">In dispensa</span>
          <span className="font-display text-[34px] font-extrabold leading-none text-ink">{pantryItems.length}</span>
          <span className="text-[13px] text-[#1E5A35]">
            {categoriesCount === 1 ? "in 1 categoria" : `in ${categoriesCount} categorie`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("shopping")}
          className="flex flex-col items-start gap-1 rounded-3xl bg-peach p-4 text-left"
        >
          <span className="text-[13px] font-semibold text-[#8A3B0C]">Lista spesa</span>
          <span className="font-display text-[34px] font-extrabold leading-none text-ink">{toBuy}</span>
          <span className="text-[13px] text-[#8A3B0C]">{toBuy === 1 ? "da prendere" : "da prendere"}</span>
          <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
            <span className="block h-1.5 rounded-full bg-tangerine" style={{ width: `${cartPct}%` }} />
          </span>
        </button>
      </div>

      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-xl font-bold text-ink">Dal tuo ricettario</h3>
        <button type="button" onClick={() => onNavigate("recipeBook")} className="flex items-center text-[13px] font-semibold text-emerald-600">
          Tutte <ChevronRight size={16} />
        </button>
      </div>

      {recipes === null ? (
        <div className="flex gap-3">
          <div className="h-[170px] flex-[0_0_210px] animate-pulse rounded-3xl bg-stone" />
          <div className="h-[170px] flex-[0_0_210px] animate-pulse rounded-3xl bg-stone" />
        </div>
      ) : recipes.length === 0 ? (
        <button
          type="button"
          onClick={() => onNavigate("chef")}
          className="flex items-center gap-3 rounded-3xl bg-white p-4 text-left"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lemon text-ink">
            <ChefHat size={22} />
          </span>
          <span className="text-sm text-muted">
            <span className="block font-bold text-ink">Ancora nessuna ricetta</span>
            Chiedi a EcoChef un'idea con quello che hai.
          </span>
        </button>
      ) : (
        <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 no-scrollbar">
          {recipes.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => (onOpenRecipe ? onOpenRecipe(r.id) : onNavigate("recipeBook"))}
              className="flex flex-[0_0_210px] snap-start flex-col overflow-hidden rounded-3xl bg-white text-left"
            >
              {r.image_url ? (
                <img src={r.image_url} alt="" className="h-[100px] w-full object-cover" loading="lazy" />
              ) : (
                <span className={`flex h-[100px] items-end px-4 pb-2 font-display text-5xl font-extrabold text-ink/20 ${tintFor(r.title)}`}>
                  {getInitial(r.title)}
                </span>
              )}
              <span className="flex flex-col gap-1 p-3.5">
                <span className="line-clamp-2 font-display text-[17px] font-bold leading-tight text-ink">{r.title}</span>
                <span className="text-xs text-muted">{[r.time, r.difficulty].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
