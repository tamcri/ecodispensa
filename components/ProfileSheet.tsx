import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { HouseholdCard } from "./HouseholdCard";
import { isAppInstalled, requestInstall } from "./PwaBanners";
import {
  X,
  User,
  Bell,
  BellOff,
  LogOut,
  Loader2,
  CheckCircle2,
  Settings,
  Shield,
  CreditCard,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Users,
  ChefHat,
  Gift,
  Receipt,
  KeyRound,
} from "lucide-react";
import { RecoveryCodeCard } from "./RecoveryCodeCard";
import { PrivacySection } from "./PrivacySection";
import { PlansPanel, type PlanProduct } from "./PlansPanel";
import { CodesCard } from "./CodesCard";
import { displayNameFromEmail } from "../services/household";

type Diet = "omnivore" | "veg" | "vegan";

/** Pagine del Profilo: la principale a righe raggruppate, ogni riga apre la sua */
type Page = "home" | "piano" | "codici" | "acquisti" | "famiglia" | "preferenze" | "password" | "recupero" | "privacy";

const PAGE_TITLE: Record<Exclude<Page, "home">, string> = {
  piano: "Piano e crediti",
  codici: "Codici e inviti",
  acquisti: "Storico acquisti",
  famiglia: "Famiglia",
  preferenze: "Preferenze di EcoChef",
  password: "Cambia password",
  recupero: "Codice di recupero",
  privacy: "Privacy e i miei dati",
};

const Row = ({ icon, title, value, onClick }: { icon: React.ReactNode; title: string; value?: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex h-[54px] w-full items-center gap-3 border-b border-[#F1EBDD] px-3.5 text-left last:border-b-0"
  >
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-mint text-forest">{icon}</span>
    <span className="flex-1 truncate text-[15px] font-semibold text-ink">{title}</span>
    {value && <span className="max-w-[40%] truncate text-[13px] text-muted">{value}</span>}
    <ChevronRight size={18} className="shrink-0 text-muted" />
  </button>
);

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <p className="mb-1.5 ml-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">{title}</p>
    <div className="overflow-hidden rounded-[20px] bg-white">{children}</div>
  </div>
);

type UserChefPreferences = {
  diet: Diet;
  lactose_free: boolean;
  avoid: string[];
  allergies: string[];
};

const DEFAULT_PREFS: UserChefPreferences = {
  diet: "omnivore",
  lactose_free: false,
  avoid: [],
  allergies: [],
};

type CreditsResponse = {
  eco_credits: number;
  purchased_credits?: number;
  monthly_credits?: number;
  monthly_reset_at?: string | null;
  updated_at: string | null;
};

type BillingProduct = PlanProduct & { is_active: boolean };

type Purchase = {
  id: string;
  purchase_type: "credits_pack" | "credits_topup" | "subscription" | "subscription_renewal";
  product_code: string;
  product_name: string | null;
  amount: number;
  currency: string;
  credits_added: number;
  created_at: string;
};

function parseCommaList(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toCommaString(arr: string[]): string {
  return (arr ?? []).join(", ");
}

async function getAccessToken(): Promise<string | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return null;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return null;

  return sessionData.session?.access_token ?? null;
}

async function fetchCredits(): Promise<CreditsResponse> {
  const token = await getAccessToken();
  if (!token) throw new Error("SESSION_MISSING");

  const r = await fetch("/api/credits", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await r.text();

  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("INVALID_JSON_RESPONSE");
  }

  if (!r.ok) {
    throw new Error(body?.error ?? "CREDITS_FETCH_FAILED");
  }

  return body as CreditsResponse;
}

async function fetchBillingProducts(): Promise<{ products: BillingProduct[]; checkoutEnabled: boolean }> {
  const token = await getAccessToken();
  if (!token) throw new Error("SESSION_MISSING");

  const r = await fetch("/api/billing-products", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await r.text();

  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("INVALID_JSON_RESPONSE");
  }

  if (!r.ok) {
    throw new Error(body?.error ?? "BILLING_PRODUCTS_FETCH_FAILED");
  }

  return {
    products: Array.isArray(body?.products) ? body.products : [],
    checkoutEnabled: Boolean(body?.checkout_enabled),
  };
}

async function fetchPurchases(): Promise<Purchase[]> {
  const token = await getAccessToken();
  if (!token) throw new Error("SESSION_MISSING");

  const r = await fetch("/api/purchases", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await r.text();

  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("INVALID_JSON_RESPONSE");
  }

  if (!r.ok) {
    throw new Error(body?.error ?? "PURCHASES_FETCH_FAILED");
  }

  return Array.isArray(body?.purchases) ? body.purchases : [];
}

export type ProfileSheetProps = {
  open: boolean;
  onClose: () => void;
  userEmail: string | null;
  notificationPermission: NotificationPermission;
  onRequestNotificationPermission: () => Promise<void>;
  pushActive?: boolean;
  onHouseholdChanged?: () => void;
  onLogout: () => Promise<void>;
  /** Pagina da aprire subito (es. "piano" dal pulsante Premium dello scontrino) */
  initialPage?: Page;
};

export const ProfileSheet: React.FC<ProfileSheetProps> = ({
  open,
  onClose,
  userEmail,
  notificationPermission,
  onRequestNotificationPermission,
  pushActive = false,
  onHouseholdChanged,
  onLogout,
  initialPage,
}) => {
  const [page, setPage] = useState<Page>("home");

  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefs, setPrefs] = useState<UserChefPreferences>(DEFAULT_PREFS);
  const [avoidText, setAvoidText] = useState("");
  const [allergiesText, setAllergiesText] = useState("");

  // l'account usa un indirizzo interno "username@example.com": mostriamo solo lo username
  const username = displayNameFromEmail(userEmail);
  const [ecoCredits, setEcoCredits] = useState<number | null>(null);
  const [monthlyCredits, setMonthlyCredits] = useState(0);
  const [purchasedCredits, setPurchasedCredits] = useState(0);
  const [monthlyResetAt, setMonthlyResetAt] = useState<string | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [planType, setPlanType] = useState<"free" | "premium">("free");
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [planCode, setPlanCode] = useState<string | null>(null);
  // abbonamento attivato con un codice (nessun abbonamento Stripe dietro)
  const [hasStripeSub, setHasStripeSub] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [subMsg, setSubMsg] = useState<string | null>(null);
  const [billingProducts, setBillingProducts] = useState<BillingProduct[]>([]);
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [showBillingPanel, setShowBillingPanel] = useState(false);

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const notifLabel = useMemo(() => {
    if (pushActive) return "Attive su questo dispositivo";
    if (notificationPermission === "granted") return "Permesso dato, da completare";
    if (notificationPermission === "denied") return "Bloccate";
    return "Non attive";
  }, [notificationPermission, pushActive]);

  const loadPreferences = async () => {
    try {
      setPrefsLoading(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        setPrefs(DEFAULT_PREFS);
        setAvoidText("");
        setAllergiesText("");
        return;
      }

      const userId = userData.user.id;

      const { data, error: selErr } = await supabase
        .from("user_profiles")
        .select("diet,lactose_free,avoid,allergies,plan_type,premium_until,subscription_cancel_at_period_end,premium_plan_code,stripe_subscription_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (selErr) {
        const { error: upsertErr } = await supabase
          .from("user_profiles")
          .upsert({ user_id: userId }, { onConflict: "user_id" });

        if (upsertErr) throw upsertErr;

        const { data: data2, error: selErr2 } = await supabase
          .from("user_profiles")
          .select("diet,lactose_free,avoid,allergies,plan_type,premium_until,subscription_cancel_at_period_end,premium_plan_code,stripe_subscription_id")
          .eq("user_id", userId)
          .maybeSingle();

        if (selErr2) throw selErr2;

        const loaded2: UserChefPreferences = {
          diet: (data2?.diet as Diet) ?? "omnivore",
          lactose_free: Boolean(data2?.lactose_free ?? false),
          avoid: Array.isArray(data2?.avoid) ? (data2.avoid as string[]) : [],
          allergies: Array.isArray(data2?.allergies) ? (data2.allergies as string[]) : [],
        };

        setPrefs(loaded2);
        setAvoidText(toCommaString(loaded2.avoid));
        setAllergiesText(toCommaString(loaded2.allergies));
        setPlanType((data2?.plan_type as "free" | "premium") ?? "free");
        setPremiumUntil(data2?.premium_until ?? null);
        setCancelAtPeriodEnd(Boolean((data2 as any)?.subscription_cancel_at_period_end));
        setPlanCode((data2 as any)?.premium_plan_code ?? null);
        setHasStripeSub(Boolean((data2 as any)?.stripe_subscription_id));
        return;
      }

      const loaded: UserChefPreferences = {
        diet: (data?.diet as Diet) ?? "omnivore",
        lactose_free: Boolean(data?.lactose_free ?? false),
        avoid: Array.isArray(data?.avoid) ? (data.avoid as string[]) : [],
        allergies: Array.isArray(data?.allergies) ? (data.allergies as string[]) : [],
      };

      setPrefs(loaded);
      setAvoidText(toCommaString(loaded.avoid));
      setAllergiesText(toCommaString(loaded.allergies));
      setPlanType((data?.plan_type as "free" | "premium") ?? "free");
      setPremiumUntil(data?.premium_until ?? null);
      setCancelAtPeriodEnd(Boolean((data as any)?.subscription_cancel_at_period_end));
      setPlanCode((data as any)?.premium_plan_code ?? null);
      setHasStripeSub(Boolean((data as any)?.stripe_subscription_id));
    } catch (e) {
      console.error("prefs load error:", e);
      setPrefs(DEFAULT_PREFS);
      setAvoidText("");
      setAllergiesText("");
    } finally {
      setPrefsLoading(false);
    }
  };

  const refreshCredits = async () => {
    try {
      setCreditsLoading(true);
      const c = await fetchCredits();
      setEcoCredits(c.eco_credits ?? 0);
      setMonthlyCredits(c.monthly_credits ?? 0);
      setPurchasedCredits(c.purchased_credits ?? c.eco_credits ?? 0);
      setMonthlyResetAt(c.monthly_reset_at ?? null);
    } catch (e) {
      console.error("credits load error:", e);
      setEcoCredits(null);
    } finally {
      setCreditsLoading(false);
    }
  };

  const loadBillingProducts = async () => {
  try {
    setBillingLoading(true);
    const { products, checkoutEnabled: enabled } = await fetchBillingProducts();
    setBillingProducts(products);
    setCheckoutEnabled(enabled);
  } catch (e) {
    console.error("billing products load error:", e);
    setBillingProducts([]);
  } finally {
    setBillingLoading(false);
  }
};

  const loadPurchases = async () => {
    try {
      setPurchasesLoading(true);
      setPurchasesError(null);
      const history = await fetchPurchases();
      setPurchases(history);
    } catch (e) {
      console.error("purchases load error:", e);
      setPurchases([]);
      setPurchasesError("Impossibile caricare lo storico acquisti.");
    } finally {
      setPurchasesLoading(false);
    }
  };

const switchToYearly = async () => {
  setSubMsg(null);
  try {
    const token = await getAccessToken();
    if (!token) throw new Error("Sessione scaduta: accedi di nuovo.");
    const r = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "switch_to_yearly", withdrawalWaiver: true }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok || !body?.ok) throw new Error(body?.message ?? "Cambio piano non riuscito. Riprova.");
    setPlanCode("premium_yearly");
    setCancelAtPeriodEnd(false);
    if (body.activeUntil) setPremiumUntil(body.activeUntil);
    setSubMsg("Fatto: ora hai l'abbonamento Annuale.");
    await refreshCredits();
  } catch (e: any) {
    alert(e?.message ?? "Cambio piano non riuscito. Riprova.");
  }
};

const changeSubscription = async (action: "cancel_subscription" | "resume_subscription") => {
  setSubBusy(true);
  setSubMsg(null);
  try {
    const token = await getAccessToken();
    if (!token) throw new Error("Sessione scaduta: accedi di nuovo.");
    const r = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok || !body?.ok) throw new Error(body?.message ?? "Operazione non riuscita. Riprova.");
    setCancelAtPeriodEnd(Boolean(body.cancelAtPeriodEnd));
    setConfirmCancel(false);
    setSubMsg(
      body.cancelAtPeriodEnd
        ? "Disdetta registrata: l'abbonamento resta attivo fino alla fine del periodo già pagato."
        : "Rinnovo riattivato."
    );
  } catch (e: any) {
    setSubMsg(e?.message ?? "Operazione non riuscita. Riprova.");
  } finally {
    setSubBusy(false);
  }
};

const startCheckout = async (productCode: string, quantity?: number) => {
  try {
    const token = await getAccessToken();

    if (!token) {
      alert("Sessione scaduta. Effettua di nuovo il login.");
      return;
    }

    const r = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ productCode, quantity, withdrawalWaiver: true }),
    });

    const body = await r.json();

    if (!r.ok || !body?.url) {
      throw new Error(body?.message ?? "Non riesco ad aprire il pagamento. Riprova.");
    }

    window.location.href = body.url;
  } catch (e: any) {
    console.error("checkout error:", e);
    alert(e?.message ?? "Non riesco ad aprire il pagamento. Riprova.");
  }
};

  const savePreferences = async () => {
    try {
      setPrefsSaving(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      const userId = userError || !userData?.user ? null : userData.user.id;
      if (!userId) return;

      const updated: UserChefPreferences = {
        diet: prefs.diet,
        lactose_free: prefs.lactose_free,
        avoid: parseCommaList(avoidText),
        allergies: parseCommaList(allergiesText),
      };

      const { error: upsertErr } = await supabase.from("user_profiles").upsert(
        {
          user_id: userId,
          diet: updated.diet,
          lactose_free: updated.lactose_free,
          avoid: updated.avoid,
          allergies: updated.allergies,
        },
        { onConflict: "user_id" }
      );

      if (upsertErr) throw upsertErr;

      setPrefs(updated);
      setPage("home");
    } catch (e) {
      console.error("prefs save error:", e);
    } finally {
      setPrefsSaving(false);
    }
  };

  const resetPasswordForm = () => {
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage(null);
    setPasswordError(null);
    setShowPassword(false);
  };

  const changePassword = async () => {
    try {
      setPasswordSaving(true);
      setPasswordMessage(null);
      setPasswordError(null);

      const cleanPassword = newPassword.trim();
      const cleanConfirm = confirmPassword.trim();

      if (cleanPassword.length < 8) {
        setPasswordError("La nuova password deve contenere almeno 8 caratteri.");
        return;
      }

      if (cleanPassword !== cleanConfirm) {
        setPasswordError("Le password non coincidono.");
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: cleanPassword,
      });

      if (error) throw error;

      setPasswordMessage("Password aggiornata correttamente.");
      setNewPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowPasswordForm(false);
    } catch (e: any) {
      console.error("password update error:", e);
      setPasswordError(e?.message ?? "Errore durante l'aggiornamento della password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPage(initialPage ?? "home");
    if (initialPage === "piano") setShowBillingPanel(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const init = async () => {
      await loadPreferences();

      let token: string | null = null;
      for (let i = 0; i < 5; i++) {
        token = await getAccessToken();
        if (token) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (token) {
        await refreshCredits();
        await loadBillingProducts();
        await loadPurchases();
      } else {
        setEcoCredits(null);
        setPurchases([]);
        setPurchasesError(null);
      }

      setPage("home");
      resetPasswordForm();
      setShowPasswordForm(false);
    };

    init();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reloadKey]);

  const premiumUntilDate = premiumUntil ? new Date(premiumUntil) : null;
  // il server tiene 1 giorno di margine per i ritardi di pagamento: la data reale di rinnovo/scadenza è il giorno prima
  const premiumUntilLabel = premiumUntilDate
    ? new Date(premiumUntilDate.getTime() - 86_400_000).toLocaleDateString("it-IT")
    : null;

  const isPremiumActive =
    planType === "premium" &&
    premiumUntilDate !== null &&
    !Number.isNaN(premiumUntilDate.getTime()) &&
    premiumUntilDate.getTime() > Date.now();

  const isGift = isPremiumActive && !hasStripeSub;

  const isPremiumExpired =
    planType === "premium" &&
    premiumUntilDate !== null &&
    !Number.isNaN(premiumUntilDate.getTime()) &&
    premiumUntilDate.getTime() <= Date.now();

  const creditProducts = billingProducts.filter((product) => product.type === "credits_pack");
const subscriptionProducts = billingProducts.filter((product) => product.type === "subscription");

const formatPrice = (priceCents: number, currency: string) => {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
  }).format(priceCents / 100);
};

const formatPurchaseAmount = (amount: number, currency: string) => {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: currency || "EUR",
  }).format(Number(amount ?? 0));
};

const formatPurchaseDate = (createdAt: string) => {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "Data non disponibile";
  }

  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const getPurchaseTitle = (purchase: Purchase) => {
  if (purchase.purchase_type === "credits_pack" || purchase.purchase_type === "credits_topup") {
    const baseName = purchase.product_name || "Pacchetto crediti";
    return purchase.credits_added > 0
      ? `${baseName} +${purchase.credits_added} crediti`
      : baseName;
  }

  return purchase.product_name || "Abbonamento EcoChef";
};

  if (!open) return null;

  const isYearly = planCode === "premium_yearly";
  const planLine = isPremiumActive
    ? isGift
      ? `Attivato con un codice · fino al ${premiumUntilLabel ?? "—"}`
      : cancelAtPeriodEnd
      ? `Disdetto · attivo fino al ${premiumUntilLabel ?? "—"}`
      : `Piano ${isYearly ? "Annuale" : "Mensile"}${premiumUntilLabel ? ` · si rinnova il ${premiumUntilLabel}` : ""}`
    : isPremiumExpired
    ? "Abbonamento scaduto"
    : "Piano gratuito";
  const creditsLine = isPremiumActive
    ? `${monthlyCredits} del mese + ${purchasedCredits} tuoi, che non scadono`
    : "1 credito = 4 ricette · un menu settimanale ne usa 4";
  const go = (next: Page) => setPage(next);
  const openPlans = () => {
    setShowBillingPanel(true);
    setPage("piano");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm animate-fade-in">
      <div className="flex max-h-[92vh] max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-4xl bg-ground pb-safe animate-slide-up">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-4xl bg-ground px-5 pb-3 pt-5">
          {page === "home" ? (
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-display text-2xl font-extrabold text-white">
                {(username ?? "?").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h3 className="truncate font-display text-[22px] font-extrabold leading-tight text-ink">{username ?? "Profilo"}</h3>
                <p className="truncate text-[13px] text-muted">{planLine}</p>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setPage("home")}
                aria-label="Torna al Profilo"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-ink"
              >
                <ChevronLeft size={20} />
              </button>
              <h3 className="truncate pl-2 font-display text-xl font-extrabold text-ink">{PAGE_TITLE[page]}</h3>
            </div>
          )}

          <button
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-ink"
            aria-label="Chiudi"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 px-5 pb-8 pt-2">
          {page === "home" && (
            <>
              <div className="flex items-center gap-3.5 rounded-[22px] bg-forest p-4 text-white">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[28px] font-extrabold leading-tight text-honey">
                    {creditsLoading || ecoCredits === null ? "…" : ecoCredits === 1 ? "1 credito" : `${ecoCredits} crediti`}
                  </p>
                  <p className="mt-0.5 text-[13px] text-[#CFDCC6]">{creditsLine}</p>
                </div>
                <button
                  type="button"
                  onClick={openPlans}
                  className="h-11 shrink-0 rounded-[14px] bg-honey px-4 text-sm font-bold text-ink"
                >
                  Piani
                </button>
              </div>

              {!isAppInstalled() && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    window.setTimeout(requestInstall, 250);
                  }}
                  className="flex items-center gap-3 rounded-2xl bg-forest p-4 text-left text-white"
                >
                  <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
                  <span className="flex-1 text-sm text-white/80">
                    <span className="block text-base font-bold text-white">Installa l'app sul telefono</span>
                    Si apre dall'icona, a schermo intero, e ricevi gli avvisi di scadenza.
                  </span>
                </button>
              )}

              <Group title="La mia cucina">
                <Row icon={<Users size={18} />} title="Famiglia" value="dispensa condivisa" onClick={() => go("famiglia")} />
                <Row icon={<ChefHat size={18} />} title="Preferenze di EcoChef" value="dieta, allergie" onClick={() => go("preferenze")} />
                <div className="flex min-h-[54px] items-center gap-3 px-3.5 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-mint text-forest">
                    {pushActive ? <Bell size={18} /> : <BellOff size={18} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">Avvisi di scadenza</span>
                    <span className="block truncate text-xs text-muted">{notifLabel}</span>
                  </span>
                  <button
                    type="button"
                    onClick={onRequestNotificationPermission}
                    title={notificationPermission === "denied" ? "Sbloccali dalle impostazioni del browser" : "Attiva gli avvisi"}
                    className={`h-9 shrink-0 rounded-xl px-3.5 text-sm font-bold ${
                      pushActive ? "bg-mint text-forest" : "bg-emerald-600 text-white"
                    }`}
                  >
                    {pushActive ? "Attivi" : "Attiva"}
                  </button>
                </div>
              </Group>
              {notificationPermission === "denied" && (
                <p className="-mt-3 px-1 text-xs text-muted">
                  Gli avvisi sono bloccati dal browser: per riattivarli, sbloccali nelle impostazioni del sito.
                </p>
              )}

              <Group title="Abbonamento e crediti">
                <Row
                  icon={<CreditCard size={18} />}
                  title="Piano e crediti"
                  value={isPremiumActive ? (isGift ? "con codice" : isYearly ? "Annuale" : "Mensile") : "Gratis"}
                  onClick={() => go("piano")}
                />
                <Row icon={<Gift size={18} />} title="Ho un codice · Invita un amico" onClick={() => go("codici")} />
                <Row icon={<Receipt size={18} />} title="Storico acquisti" onClick={() => go("acquisti")} />
              </Group>

              <Group title="Account e sicurezza">
                <Row icon={<KeyRound size={18} />} title="Codice di recupero" onClick={() => go("recupero")} />
                <Row
                  icon={<Lock size={18} />}
                  title="Cambia password"
                  onClick={() => {
                    resetPasswordForm();
                    go("password");
                  }}
                />
                <Row icon={<Shield size={18} />} title="Privacy e i miei dati" onClick={() => go("privacy")} />
              </Group>

              <button
                onClick={onLogout}
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-white font-bold text-[#8E3418]"
                type="button"
              >
                <LogOut size={18} />
                Esci
              </button>
            </>
          )}

          {page === "piano" && (
            <div className="rounded-2xl bg-white p-4">
              {isPremiumActive ? (
                <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-base"
                          aria-hidden="true"
                        >
                          ⭐
                        </span>
                        <div>
                          <div className="text-xs font-extrabold tracking-wider text-amber-700">
                            ABBONAMENTO ATTIVO
                          </div>
                          <div className="text-xs text-muted mt-0.5">
                            {isGift
                              ? `Attivato con un codice: valido fino al ${premiumUntilLabel ?? "—"}, senza rinnovo`
                              : premiumUntilLabel
                              ? cancelAtPeriodEnd
                                ? `Disdetto: attivo fino al ${premiumUntilLabel}`
                                : `Rinnovo automatico il ${premiumUntilLabel}`
                              : "Abbonamento attivo"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={refreshCredits}
                      className="shrink-0 text-xs font-bold text-emerald-700 hover:text-emerald-800"
                    >
                      aggiorna
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    <div className="bg-white/90 border border-amber-100 rounded-xl p-3">
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span className="text-base" aria-hidden="true">
                          📅
                        </span>
                        Crediti del mese
                      </div>
                      <div className="mt-1 text-lg font-extrabold text-ink">
                        {creditsLoading ? "…" : monthlyCredits}
                      </div>
                      {monthlyResetAt && (
                        <div className="text-[11px] text-muted">
                          Tornano a 25 il {new Date(monthlyResetAt).toLocaleDateString("it-IT")}
                        </div>
                      )}
                    </div>

                    <div className="bg-white/90 border border-emerald-100 rounded-xl p-3">
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span className="text-base" aria-hidden="true">
                          💳
                        </span>
                        Crediti extra (non scadono)
                      </div>
                      <div className="mt-1 text-lg font-extrabold text-ink">
                        {creditsLoading ? "…" : purchasedCredits}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                    Usiamo prima i crediti del mese: quelli non usati si azzerano al rinnovo. I crediti extra restano tuoi.
                  </div>

                  <button
                    type="button"
                    className="w-full mt-3 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors"
                    onClick={() => setShowBillingPanel((value) => !value)}
                  >
                    {showBillingPanel ? "Chiudi" : "Ricarica crediti"}
                  </button>

                  {isGift ? null : cancelAtPeriodEnd ? (
                    <button
                      type="button"
                      disabled={subBusy}
                      onClick={() => changeSubscription("resume_subscription")}
                      className="w-full mt-2 py-3 rounded-xl border border-emerald-200 bg-white text-emerald-700 font-bold text-sm disabled:opacity-50"
                    >
                      {subBusy ? "Attendi…" : "Riattiva il rinnovo"}
                    </button>
                  ) : !confirmCancel ? (
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(true)}
                      className="w-full mt-2 py-2.5 text-sm font-semibold text-muted underline"
                    >
                      Disdici l'abbonamento
                    </button>
                  ) : (
                    <div className="mt-2 rounded-xl border border-black/10 bg-white p-3 text-sm text-ink">
                      <p className="font-bold text-ink">Vuoi disdire?</p>
                      <p className="mt-1">
                        Resta tutto attivo fino al {premiumUntilLabel ?? "termine del periodo pagato"}, poi non paghi più nulla.
                        I crediti del mese si azzerano alla scadenza; quelli ricaricati o regalati restano tuoi. Non sono previsti rimborsi
                        per il periodo già pagato.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmCancel(false)}
                          className="h-10 rounded-xl bg-stone font-bold text-ink"
                        >
                          Annulla
                        </button>
                        <button
                          type="button"
                          disabled={subBusy}
                          onClick={() => changeSubscription("cancel_subscription")}
                          className="h-10 rounded-xl bg-forest font-bold text-white disabled:opacity-50"
                        >
                          {subBusy ? "Attendi…" : "Sì, disdici"}
                        </button>
                      </div>
                    </div>
                  )}
                  {subMsg && <p className="mt-2 text-xs font-semibold text-muted">{subMsg}</p>}
                </div>
              ) : (
                <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div
                        className={`text-xs font-extrabold tracking-wider ${
                          isPremiumExpired ? "text-amber-700" : "text-muted"
                        }`}
                      >
                        {isPremiumExpired ? "ABBONAMENTO SCADUTO" : "PIANO GRATUITO"}
                      </div>
                      <div className="text-sm text-muted mt-1">
                        {isPremiumExpired && premiumUntilLabel
                          ? `Scaduto il ${premiumUntilLabel}. Puoi usare i crediti extra rimasti.`
                          : "Usa i tuoi crediti per le generazioni EcoChef."}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={refreshCredits}
                      className="shrink-0 text-xs font-bold text-emerald-700 hover:text-emerald-800"
                    >
                      aggiorna
                    </button>
                  </div>

                  <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                    <div className="text-xs font-medium text-emerald-800">
                      Crediti disponibili
                    </div>
                    <div className="mt-1 text-3xl font-extrabold text-ink">
                      {creditsLoading ? "…" : ecoCredits ?? 0}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      1 credito = 4 richieste di ricette · menu settimanale = 4 crediti
                    </div>
                  </div>

                  <div className="mt-3 text-sm text-muted leading-relaxed">
                    {isPremiumExpired
                      ? "Riattiva l'abbonamento per avere di nuovo 25 crediti ogni mese."
                      : "Con l'abbonamento hai 25 crediti ogni mese: per esempio 4 menu settimanali e altre 36 richieste di ricette. Se finiscono, puoi aggiungere una ricarica."}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowBillingPanel((value) => !value)}
                    className="w-full mt-3 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold text-sm hover:bg-emerald-100 transition-colors"
                  >
                    {showBillingPanel
                      ? "Chiudi"
                      : isPremiumExpired
                      ? "Riattiva l'abbonamento"
                      : "Scopri l'abbonamento"}
                  </button>
                </div>
              )}

              {showBillingPanel && (
                <div className="mt-4">
                  <PlansPanel
                    products={billingProducts}
                    loading={billingLoading}
                    checkoutEnabled={checkoutEnabled}
                    isSubscribed={isPremiumActive}
                    onCheckout={startCheckout}
                    currentPlanCode={planCode}
                    cancelAtPeriodEnd={cancelAtPeriodEnd}
                    activeUntilLabel={premiumUntilLabel}
                    onSwitchToYearly={switchToYearly}
                    isGift={isGift}
                  />
                </div>
              )}
            </div>
          )}

          {page === "codici" && (
            <CodesCard
              onRedeemed={() => {
                refreshCredits();
                setReloadKey((k) => k + 1);
              }}
            />
          )}

          {page === "acquisti" && (
            <div className="bg-white rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <CreditCard size={16} className="text-emerald-600" />
                  <div className="text-sm font-bold text-ink">Storico acquisti</div>
                </div>

                {!purchasesLoading && (
                  <button
                    type="button"
                    onClick={loadPurchases}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800"
                  >
                    aggiorna
                  </button>
                )}
              </div>

              <div className="text-xs text-muted mb-3">
                Gli ultimi acquisti effettuati su EcoDispensa.
              </div>

              {purchasesLoading ? (
                <div className="py-5 flex items-center justify-center gap-2 text-sm text-muted">
                  <Loader2 size={18} className="animate-spin text-emerald-600" />
                  Caricamento acquisti...
                </div>
              ) : purchasesError ? (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3">
                  <div className="text-sm text-red-700">{purchasesError}</div>
                  <button
                    type="button"
                    onClick={loadPurchases}
                    className="mt-2 text-xs font-bold text-red-700 hover:text-red-800"
                  >
                    Riprova
                  </button>
                </div>
              ) : purchases.length === 0 ? (
                <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-muted">
                  Nessun acquisto registrato.
                </div>
              ) : (
                <div className="space-y-2">
                  {purchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="rounded-xl border border-black/10 bg-white p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-ink truncate">
                          {getPurchaseTitle(purchase)}
                        </div>
                        <div className="text-xs text-muted mt-1">
                          {formatPurchaseDate(purchase.created_at)}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="font-bold text-sm text-ink">
                          {formatPurchaseAmount(purchase.amount, purchase.currency)}
                        </div>
                        <div
                          className={`text-[11px] font-semibold mt-1 ${
                            purchase.purchase_type === "subscription"
                              ? "text-amber-700"
                              : "text-emerald-700"
                          }`}
                        >
                          {purchase.purchase_type === "subscription" || purchase.purchase_type === "subscription_renewal"
                            ? "Abbonamento"
                            : "Crediti EcoChef"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {page === "famiglia" && <HouseholdCard userEmail={userEmail} onChanged={onHouseholdChanged} />}

          {page === "preferenze" && (
            <div className="rounded-2xl bg-white p-4">
            {prefsLoading ? (
              <div className="text-center py-6">
                <Loader2 className="animate-spin mx-auto text-emerald-600 mb-2" size={28} />
                <p className="text-muted text-sm font-medium">Caricamento...</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Dieta</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["omnivore", "veg", "vegan"] as Diet[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPrefs((p) => ({ ...p, diet: d }))}
                        className={`px-3 py-2 rounded-xl text-sm font-bold border transition-colors ${
                          prefs.diet === d
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-ink border-black/10 hover:border-emerald-400"
                        }`}
                      >
                        {d === "omnivore" ? "Onnivora" : d === "veg" ? "Vegetariana" : "Vegana"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 bg-white border border-black/10 rounded-xl p-4">
                  <div>
                    <div className="text-sm font-bold text-ink">Senza lattosio</div>
                    <div className="text-xs text-muted">Evita ingredienti con lattosio.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPrefs((p) => ({ ...p, lactose_free: !p.lactose_free }))}
                    className={`w-14 h-8 rounded-full transition-colors relative ${
                      prefs.lactose_free ? "bg-emerald-600" : "bg-[#D6CFBE]"
                    }`}
                    aria-label="toggle senza lattosio"
                  >
                    <span
                      className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${
                        prefs.lactose_free ? "left-7" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                <div>
                  <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">
                    Ingredienti da evitare (opzionale)
                  </div>
                  <input
                    type="text"
                    placeholder="es. cipolla, aglio, peperoncino"
                    className="w-full p-3 rounded-xl border border-black/10 outline-none focus:border-emerald-500 transition-colors text-sm bg-white"
                    value={avoidText}
                    onChange={(e) => setAvoidText(e.target.value)}
                  />
                  <p className="text-[11px] text-muted mt-2">Separati da virgola.</p>
                </div>

                <div>
                  <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">
                    Allergie (opzionale)
                  </div>
                  <input
                    type="text"
                    placeholder="es. arachidi, crostacei"
                    className="w-full p-3 rounded-xl border border-black/10 outline-none focus:border-emerald-500 transition-colors text-sm bg-white"
                    value={allergiesText}
                    onChange={(e) => setAllergiesText(e.target.value)}
                  />
                  <p className="text-[11px] text-muted mt-2">Separati da virgola.</p>
                </div>

                <button
                  type="button"
                  onClick={savePreferences}
                  disabled={prefsSaving || prefsLoading}
                  className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 disabled:opacity-50"
                >
                  {prefsSaving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                  Salva preferenze
                </button>
              </div>
            )}
            </div>
          )}

          {page === "password" && (
            <div className="rounded-2xl bg-white p-4">
              <p className="mb-4 text-sm text-muted">Scegli una nuova password per il tuo account.</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted font-bold mb-1 block">Nuova password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full p-3 pr-11 rounded-xl border border-black/10 outline-none focus:border-emerald-500 transition-colors text-sm bg-white"
                      placeholder="Almeno 8 caratteri"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-muted"
                      title={showPassword ? "Nascondi password" : "Mostra password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted font-bold mb-1 block">Conferma password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-3 rounded-xl border border-black/10 outline-none focus:border-emerald-500 transition-colors text-sm bg-white"
                    placeholder="Ripeti la nuova password"
                  />
                </div>

                {passwordError && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
                    {passwordError}
                  </div>
                )}

                {passwordMessage && (
                  <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                    {passwordMessage}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={changePassword}
                    disabled={passwordSaving}
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {passwordSaving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                    Salva
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      resetPasswordForm();
                      setShowPasswordForm(false);
                    }}
                    disabled={passwordSaving}
                    className="px-4 bg-stone text-ink py-3 rounded-xl font-bold hover:bg-[#E2D9C5] transition-all disabled:opacity-50"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            </div>
          )}

          {page === "recupero" && <RecoveryCodeCard />}

          {page === "privacy" && (
            <div className="rounded-2xl bg-white p-4">
              <PrivacySection />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
