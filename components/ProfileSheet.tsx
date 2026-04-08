import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
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
} from "lucide-react";

type Diet = "omnivore" | "veg" | "vegan";

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
  updated_at: string | null;
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

export type ProfileSheetProps = {
  open: boolean;
  onClose: () => void;
  userEmail: string | null;
  notificationPermission: NotificationPermission;
  onRequestNotificationPermission: () => Promise<void>;
  onLogout: () => Promise<void>;
};

export const ProfileSheet: React.FC<ProfileSheetProps> = ({
  open,
  onClose,
  userEmail,
  notificationPermission,
  onRequestNotificationPermission,
  onLogout,
}) => {
  const [tab, setTab] = useState<"profilo" | "preferenze">("profilo");

  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefs, setPrefs] = useState<UserChefPreferences>(DEFAULT_PREFS);
  const [avoidText, setAvoidText] = useState("");
  const [allergiesText, setAllergiesText] = useState("");

  const [ecoCredits, setEcoCredits] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  const notifLabel = useMemo(() => {
    if (notificationPermission === "granted") return "Attive";
    if (notificationPermission === "denied") return "Bloccate";
    return "Non attive";
  }, [notificationPermission]);

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
        .select("diet,lactose_free,avoid,allergies")
        .eq("user_id", userId)
        .maybeSingle()

      if (selErr) {
        const { error: upsertErr } = await supabase
          .from("user_profiles")
          .upsert({ user_id: userId }, { onConflict: "user_id" });

        if (upsertErr) throw upsertErr;

        const { data: data2, error: selErr2 } = await supabase
          .from("user_profiles")
          .select("diet,lactose_free,avoid,allergies")
          .eq("user_id", userId)
          .maybeSingle()

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
    } catch (e) {
      console.error("credits load error:", e);
      setEcoCredits(null);
    } finally {
      setCreditsLoading(false);
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

      const { error: upsertErr } = await supabase
        .from("user_profiles")
        .upsert(
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
      setTab("profilo");
    } catch (e) {
      console.error("prefs save error:", e);
    } finally {
      setPrefsSaving(false);
    }
  };

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
      } else {
        setEcoCredits(null);
      }

      setTab("profilo");
    };

    init();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up flex flex-col shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex justify-between items-center z-10 sm:rounded-t-2xl rounded-t-2xl">
          <div className="min-w-0 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <User size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-lg text-gray-800 truncate">Profilo</h3>
              <p className="text-xs text-gray-500 truncate">{userEmail ?? "—"}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
            title="Chiudi"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 pb-0">
          <div className="flex p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setTab("profilo")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === "profilo" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
              type="button"
            >
              Account
            </button>
            <button
              onClick={() => setTab("preferenze")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === "preferenze" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
              type="button"
            >
              Preferenze EcoChef
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {tab === "profilo" && (
            <>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Mail size={16} className="text-emerald-600" />
                  <div className="text-sm font-bold text-gray-800">Account</div>
                </div>

                <div className="text-sm text-gray-600">
                  <div className="text-xs text-gray-400 mb-1">Email</div>
                  <div className="font-semibold text-gray-800">{userEmail ?? "—"}</div>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard size={16} className="text-emerald-600" />
                  <div className="text-sm font-bold text-gray-800">Piano</div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Stato</div>
                    <div className="font-semibold text-gray-800">Free</div>
                  </div>

                  <button
                    type="button"
                    disabled
                    className="px-4 py-2 rounded-xl bg-gray-200 text-gray-500 font-bold text-sm cursor-not-allowed"
                    title="Arriverà in uno step successivo"
                  >
                    Gestisci piano
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <Settings size={16} className="text-emerald-600" />
                    <div>
                      <div className="text-xs text-gray-400">Crediti EcoChef</div>
                      <div className="font-bold text-gray-800">
                        {creditsLoading ? "…" : ecoCredits === null ? "—" : ecoCredits}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={refreshCredits}
                    className="text-sm font-bold text-emerald-700 hover:text-emerald-800"
                  >
                    aggiorna
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  {notificationPermission === "granted" ? (
                    <Bell size={16} className="text-emerald-600" />
                  ) : (
                    <BellOff size={16} className="text-gray-400" />
                  )}
                  <div className="text-sm font-bold text-gray-800">Notifiche scadenza</div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Stato</div>
                    <div className="font-semibold text-gray-800">{notifLabel}</div>
                  </div>

                  <button
                    type="button"
                    onClick={onRequestNotificationPermission}
                    className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${
                      notificationPermission === "granted"
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                    title={notificationPermission === "denied" ? "Sbloccala dalle impostazioni del browser" : "Attiva notifiche"}
                  >
                    {notificationPermission === "granted" ? "Attive" : "Attiva"}
                  </button>
                </div>

                {notificationPermission === "denied" && (
                  <div className="mt-3 text-xs text-gray-500">
                    Le notifiche sono bloccate dal browser. Per riattivarle, sbloccale nelle impostazioni del sito.
                  </div>
                )}
              </div>

              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={16} className="text-emerald-600" />
                  <div className="text-sm font-bold text-gray-800">Privacy</div>
                </div>

                <div className="text-sm text-gray-600">
                  Qui potrai gestire consenso e dati personali. (Lo completiamo in uno step successivo.)
                </div>
              </div>

              <button
                onClick={onLogout}
                className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
                type="button"
                title="Esci"
              >
                <LogOut size={18} />
                Esci
              </button>
            </>
          )}

          {tab === "preferenze" && (
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Settings size={16} className="text-emerald-600" />
                <div className="text-sm font-bold text-gray-800">Preferenze EcoChef</div>
              </div>

              {prefsLoading ? (
                <div className="text-center py-6">
                  <Loader2 className="animate-spin mx-auto text-emerald-600 mb-2" size={28} />
                  <p className="text-gray-500 text-sm font-medium">Caricamento...</p>
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
                              : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300"
                          }`}
                        >
                          {d === "omnivore" ? "Onnivora" : d === "veg" ? "Vegetariana" : "Vegana"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-xl p-4">
                    <div>
                      <div className="text-sm font-bold text-gray-800">Senza lattosio</div>
                      <div className="text-xs text-gray-500">Evita ingredienti con lattosio.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, lactose_free: !p.lactose_free }))}
                      className={`w-14 h-8 rounded-full transition-colors relative ${
                        prefs.lactose_free ? "bg-emerald-600" : "bg-gray-300"
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
                      className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-emerald-500 transition-colors text-sm bg-white"
                      value={avoidText}
                      onChange={(e) => setAvoidText(e.target.value)}
                    />
                    <p className="text-[11px] text-gray-400 mt-2">Separati da virgola.</p>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">
                      Allergie (opzionale)
                    </div>
                    <input
                      type="text"
                      placeholder="es. arachidi, crostacei"
                      className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-emerald-500 transition-colors text-sm bg-white"
                      value={allergiesText}
                      onChange={(e) => setAllergiesText(e.target.value)}
                    />
                    <p className="text-[11px] text-gray-400 mt-2">Separati da virgola.</p>
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
        </div>
      </div>
    </div>
  );
};
