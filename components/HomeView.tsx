import React, { useEffect, useMemo, useState } from "react";
import { ChefHat, ChevronRight, Lightbulb, Plus } from "lucide-react";
import { PantryItem, ShoppingItem, ViewState } from "../types";
import { daysUntil, expiryLabel, expiryTone, EXPIRY_TONE_CLASS } from "../constants";
import { Monogram, ProfileButton } from "./ui";
import { fetchSavedRecipes, SavedRecipe } from "../services/api";
import { tintFor } from "./RecipePhoto";
import { fetchMonthStats, Outcome, WasteStats } from "../services/household";
import { findFoodGuide } from "../foodGuide";
import { RecoveryCodeCard } from "./RecoveryCodeCard";

interface HomeViewProps {
  pantryItems: PantryItem[];
  shoppingItems: ShoppingItem[];
  credits: number | null;
  userInitial: string;
  onOpenProfile: () => void;
  onNavigate: (view: ViewState) => void;
  onOpenRecipe?: (id: string) => void;
  onResolveExpired?: (id: string, outcome: Outcome) => void;
  onPostpone?: (id: string, days: number) => void;
  statsVersion?: number;
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
  onResolveExpired,
  onPostpone,
  statsVersion = 0,
}) => {
  const [recipes, setRecipes] = useState<SavedRecipe[] | null>(null);
  const [stats, setStats] = useState<WasteStats | null>(null);

  useEffect(() => {
    fetchMonthStats().then(setStats);
  }, [statsVersion]);

  useEffect(() => {
    fetchSavedRecipes()
      // prima quelle in programma: sono le prossime da cucinare
      .then((r) => setRecipes([...r].sort((a, b) => Number(b.status === "planned") - Number(a.status === "planned")).slice(0, 6)))
      .catch(() => setRecipes([]));
  }, []);

  const withDays = useMemo(
    () => pantryItems.map((item) => ({ item, days: daysUntil(item.expiryDate) })),
    [pantryItems]
  );

  // Da salvare: scadono oggi o nei prossimi 3 giorni
  const expiring = useMemo(
    () =>
      withDays
        .filter((x) => x.days !== null && (x.days as number) >= 0 && (x.days as number) <= 3)
        .sort((a, b) => (a.days as number) - (b.days as number)),
    [withDays]
  );

  // Già scaduti: chiediamo all'utente cosa ne è stato, così la dispensa resta vera
  const expired = useMemo(
    () => withDays.filter((x) => x.days !== null && (x.days as number) < 0).sort((a, b) => (a.days as number) - (b.days as number)),
    [withDays]
  );

  // Consiglio di conservazione per il primo prodotto da salvare che la guida conosce
  const tip = useMemo(() => {
    for (const { item } of expiring) {
      const g = findFoodGuide(item.name);
      if (g) return { name: item.name, text: g.tip };
    }
    for (const item of pantryItems) {
      const g = findFoodGuide(item.name);
      if (g) return { name: item.name, text: g.tip };
    }
    return null;
  }, [expiring, pantryItems]);

  const totalEvents = stats ? stats.consumed + stats.wasted : 0;
  const savedPct = stats && totalEvents ? Math.round((stats.consumed / totalEvents) * 100) : null;

  const toBuy = shoppingItems.filter((i) => !i.isChecked).length;

  const shown = expiring.slice(0, 3);
  const extra = expiring.length - shown.length;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted">{todayLabel()}</p>
          <h1 className="mt-0.5 font-display text-[30px] font-extrabold leading-[1.05] tracking-tight text-ink">
            {greeting()}
            <br />
            Cosa salviamo oggi?
          </h1>
        </div>
        <ProfileButton />
      </div>

      <RecoveryCodeCard compact />

      {/* Prodotti da salvare: un solo riquadro principale */}
      <section className="flex flex-col gap-3 rounded-[26px] bg-white p-[18px] shadow-[0_6px_20px_rgba(47,74,44,0.06)]">
        {pantryItems.length === 0 ? (
          <>
            <span className="self-start rounded-full bg-honey px-2.5 py-1 text-xs font-bold text-[#6E5208]">Primo passo</span>
            <h2 className="font-display text-[22px] font-extrabold leading-tight text-ink">Raccontami cosa hai in casa</h2>
            <p className="text-sm text-muted">
              Aggiungi i prodotti della dispensa: ti avviso prima che scadano e EcoChef ti propone cosa cucinare.
            </p>
            <button
              type="button"
              onClick={() => onNavigate("pantry")}
              className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-bold text-white"
            >
              <Plus size={20} /> Aggiungi prodotti
            </button>
          </>
        ) : expiring.length === 0 ? (
          <>
            <span className="self-start rounded-full bg-mint px-2.5 py-1 text-xs font-bold text-forest">Tutto sotto controllo</span>
            <h2 className="font-display text-[22px] font-extrabold leading-tight text-ink">Niente scade nei prossimi 3 giorni</h2>
            <p className="text-sm text-muted">Hai {pantryItems.length} prodotti in dispensa. Vuoi un'idea per cucinarli?</p>
            <button
              type="button"
              onClick={() => onNavigate("chef")}
              className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-bold text-white"
            >
              <ChefHat size={20} /> Cosa ci cucino?
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-peach px-2.5 py-1 text-xs font-bold text-[#8E3418]">Da usare presto</span>
              <button type="button" onClick={() => onNavigate("pantry")} className="text-[13px] font-bold text-emerald-600">
                Vedi tutti
              </button>
            </div>
            <h2 className="font-display text-[22px] font-extrabold leading-tight text-ink">
              {expiring.length === 1
                ? "1 prodotto scade entro 3 giorni"
                : `${expiring.length} prodotti scadono entro 3 giorni`}
            </h2>
            <div className="flex flex-col gap-2">
              {shown.map(({ item, days }) => (
                <div key={item.id} className="flex items-center gap-3">
                  <Monogram name={item.name} category={item.category} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{item.name}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${EXPIRY_TONE_CLASS[expiryTone(days)]}`}>
                    {expiryLabel(days)}
                  </span>
                </div>
              ))}
            </div>
            {extra > 0 && <p className="-mt-1 text-xs font-semibold text-muted">e altri {extra}</p>}
            <button
              type="button"
              onClick={() => onNavigate("chef")}
              className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-bold text-white active:scale-[0.99]"
            >
              <ChefHat size={20} /> Cosa ci cucino?
            </button>
          </>
        )}
      </section>

      {expired.length > 0 && onResolveExpired && (
        <section className="flex flex-col gap-3 rounded-4xl bg-white p-4">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">
              {expired.length === 1 ? "Questo è scaduto" : `${expired.length} prodotti sono scaduti`}
            </h2>
            <p className="text-[13px] text-muted">Dimmi cosa ne è stato: così la dispensa resta aggiornata.</p>
          </div>
          {expired.slice(0, 4).map(({ item, days }) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-2xl bg-ground p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-bold text-ink">{item.name}</span>
                <span className="shrink-0 text-xs font-bold text-[#8A1F2B]">{expiryLabel(days)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onResolveExpired(item.id, "consumed")}
                  className="h-10 rounded-xl bg-mint text-[13px] font-bold text-[#2F4A2C]"
                >
                  Usato
                </button>
                <button
                  type="button"
                  onClick={() => onResolveExpired(item.id, "wasted")}
                  className="h-10 rounded-xl bg-[#F3D3D3] text-[13px] font-bold text-[#8A1F2B]"
                >
                  Buttato
                </button>
                {onPostpone && (
                  <button
                    type="button"
                    onClick={() => onPostpone(item.id, 2)}
                    className="h-10 rounded-xl bg-white text-[13px] font-bold text-ink ring-1 ring-black/5"
                    title="È ancora buono: ricordamelo tra 2 giorni"
                  >
                    Ancora buono
                  </button>
                )}
              </div>
            </div>
          ))}
          {expired.length > 4 && (
            <button type="button" onClick={() => onNavigate("pantry")} className="text-left text-[13px] font-semibold text-emerald-700">
              e altri {expired.length - 4} in dispensa
            </button>
          )}
        </section>
      )}

      {/* I numeri in una riga */}
      <div className="grid grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => onNavigate("pantry")}
          className="flex flex-col items-start gap-0.5 rounded-[20px] bg-white p-3 text-left"
        >
          <span className="font-display text-[26px] font-extrabold leading-none text-forest">
            {savedPct !== null ? `${savedPct}%` : "–"}
          </span>
          <span className="text-xs text-muted">salvato questo mese</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("pantry")}
          className="flex flex-col items-start gap-0.5 rounded-[20px] bg-white p-3 text-left"
        >
          <span className="font-display text-[26px] font-extrabold leading-none text-ink">{pantryItems.length}</span>
          <span className="text-xs text-muted">in dispensa</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("shopping")}
          className="flex flex-col items-start gap-0.5 rounded-[20px] bg-white p-3 text-left"
        >
          <span className="font-display text-[26px] font-extrabold leading-none text-ink">{toBuy}</span>
          <span className="text-xs text-muted">da comprare</span>
        </button>
      </div>

      {tip && (
        <section className="flex gap-3 rounded-3xl bg-honey p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-[#6E5208]">
            <Lightbulb size={20} />
          </span>
          <span className="text-sm text-[#3D3A1F]">
            <span className="block font-bold text-ink">Per {tip.name.toLowerCase()}</span>
            {tip.text}
          </span>
        </section>
      )}

      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-xl font-bold text-ink">
          {recipes?.some((r) => r.status === "planned") ? "Da cucinare" : "Dal tuo ricettario"}
        </h3>
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
                <span className={`h-2 w-full ${tintFor(r.title)}`} aria-hidden="true" />
              )}
              <span className="flex flex-1 flex-col gap-1 p-3.5">
                {r.status === "planned" && (
                  <span className="mb-0.5 self-start rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold text-[#2F4A2C]">In programma</span>
                )}
                <span className="line-clamp-3 font-display text-[17px] font-bold leading-tight text-ink">{r.title}</span>
                <span className="text-xs text-muted">{[r.time, r.difficulty].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
