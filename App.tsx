import { supabase } from "./services/supabaseClient";
import AuthView from "./components/AuthView";
import React, { useState, useEffect } from "react";
import { Refrigerator, ShoppingCart, ChefHat, BookOpen, Home } from "lucide-react";
import { PantryItem, ShoppingItem, ViewState, Category, IngredientUsage, CookResult } from "./types";
import { PantryView } from "./components/PantryView";
import { ShoppingListView } from "./components/ShoppingListView";
import { ChefView } from "./components/ChefView";
import { ProfileSheet } from "./components/ProfileSheet";
import { RecipeBookView } from "./components/RecipeBookView";
import { HomeView } from "./components/HomeView";
import { acceptSharedRecipe, fetchCredits } from "./services/api";
import { SharedRecipeView } from "./components/SharedRecipeView";
import { ProfileButtonContext } from "./components/ui";
import { redeemCode, redeemMessage, takePendingCode } from "./services/codes";
import { displayNameFromEmail, ensureHousehold, logPantryEvents, Outcome } from "./services/household";
import { enablePush, isPushSupported, PUSH_MESSAGES, refreshPushSubscription } from "./services/push";
import { dateInDays, nameMatchScore } from "./foodGuide";

const normalizeShoppingKey = (name: string, unit?: string | null) =>
  `${name.trim().toLowerCase()}__${(unit ?? "").trim().toLowerCase()}`;

const App = () => {
  // ?view=chef (es. dalla notifica di scadenza) apre direttamente quella schermata
  const [view, setView] = useState<ViewState>(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("view");
      if (v === "chef" || v === "pantry" || v === "shopping" || v === "recipeBook") {
        window.history.replaceState(null, "", window.location.pathname);
        return v;
      }
    } catch {
      /* ignora */
    }
    return "home";
  });
  const [credits, setCredits] = useState<number | null>(null);

  // Ricetta aperta da un link condiviso: ?ricetta=TOKEN (&sfida=1 se è una sfida)
  const [shared, setShared] = useState<{ token: string; challenge: boolean } | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("ricetta");
      if (token && /^[a-z0-9]{12}$/.test(token)) {
        window.history.replaceState(null, "", window.location.pathname);
        return { token, challenge: params.get("sfida") === "1" };
      }
    } catch {
      /* ignora */
    }
    return null;
  });
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");

  const [profileOpen, setProfileOpen] = useState(false);
  const [pushActive, setPushActive] = useState(false);
  const [statsVersion, setStatsVersion] = useState(0);

  // ✅ Supabase session
  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .catch((e) => {
        console.error("getSession error:", e);
      })
      .finally(() => {
        setAuthReady(true);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Famiglia: la crea al primo accesso; poi carica dispensa e spesa (condivise)
  useEffect(() => {
    if (!session) return;
    const name = displayNameFromEmail(session.user?.email);
    ensureHousehold(name).finally(() => {
      loadPantryFromSupabase();
      loadShoppingFromSupabase();
    });
    refreshPushSubscription().then(setPushActive);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let pending: string | null = null;
    try {
      pending = localStorage.getItem("eco-pending-shared-recipe");
      if (pending) localStorage.removeItem("eco-pending-shared-recipe");
    } catch {
      /* storage non disponibile */
    }
    if (!pending) return;
    acceptSharedRecipe(pending).then((id) => {
      if (id) {
        setOpenRecipeId(id);
        setView("recipeBook");
      }
    });
  }, [session]);

  const acceptShared = async () => {
    if (!shared) return;
    if (!session) {
      try {
        localStorage.setItem("eco-pending-shared-recipe", shared.token);
      } catch {
        /* senza storage la ricetta andrà riaperta dal link dopo il login */
      }
      setShared(null);
      return;
    }
    const id = await acceptSharedRecipe(shared.token);
    setShared(null);
    if (id) {
      setOpenRecipeId(id);
      setView("recipeBook");
    }
  };

  // Quando si torna sull'app ricarica: un familiare potrebbe aver cambiato qualcosa
  useEffect(() => {
    if (!session) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadPantryFromSupabase();
        loadShoppingFromSupabase();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session]);

  // Codice inserito alla registrazione: lo uso al primo accesso e mostro com'è andata
  const [codeNotice, setCodeNotice] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!session) return;
    const code = takePendingCode(displayNameFromEmail(session.user?.email));
    if (!code) return;
    redeemCode(code).then((r) => {
      setCodeNotice({ ok: r.ok, text: redeemMessage(r) });
      fetchCredits().then((c) => {
        if (c !== null) setCredits(c);
      });
    });
    // il link di invito non serve più nella barra degli indirizzi
    if (window.location.search.includes("codice=")) window.history.replaceState(null, "", window.location.pathname);
  }, [session]);

  // Crediti EcoChef mostrati nella schermata Oggi
  useEffect(() => {
    if (!session || view !== "home") return;
    fetchCredits().then((c) => {
      if (c !== null) setCredits(c);
    });
  }, [session, view]);

  // Avviso locale solo dove le notifiche push non esistono
  const checkExpirationsAndNotify = () => {
    if (pushActive || isPushSupported()) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    let lastNotifiedDate: string | null = null;
    try {
      lastNotifiedDate = localStorage.getItem("eco-last-notification-date");
    } catch {
      /* storage non disponibile */
    }
    if (lastNotifiedDate === todayStr) return;

    const expiringItems = pantryItems.filter((item) => {
      if (!item.expiryDate) return false;
      const diffDays = Math.ceil((new Date(item.expiryDate).getTime() - now.getTime()) / 86_400_000);
      return diffDays >= 0 && diffDays <= 2;
    });

    if (expiringItems.length > 0) {
      const itemNames = expiringItems.map((i) => i.name).slice(0, 2).join(", ");
      const suffix = expiringItems.length > 2 ? ` e altri ${expiringItems.length - 2}` : "";
      try {
        new Notification("EcoDispensa", {
          body: `Da usare presto: ${itemNames}${suffix}. Apri EcoChef per un'idea!`,
          icon: "/icons/icon-192.png",
          tag: "expiry-notification",
        });
        localStorage.setItem("eco-last-notification-date", todayStr);
      } catch (e) {
        console.error("Notification error:", e);
      }
    }
  };

  useEffect(() => {
    if (notificationPermission === "granted" && pantryItems.length > 0) {
      checkExpirationsAndNotify();
    }
  }, [pantryItems, notificationPermission, pushActive]);

  const requestNotificationPermission = async () => {
    const result = await enablePush();
    if ("Notification" in window) setNotificationPermission(Notification.permission);
    if (result.ok === true) {
      setPushActive(true);
      return;
    }
    if (result.ok === false) {
      // Dove le push non esistono resta l'avviso all'apertura dell'app
      if (result.reason === "unsupported" && "Notification" in window) {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === "granted") return;
      }
      alert(PUSH_MESSAGES[result.reason]);
    }
  };

  const addPantryItem = async (item: Omit<PantryItem, "id" | "addedAt">) => {
    const tempId = crypto.randomUUID();
    const newItem: PantryItem = {
      ...item,
      id: tempId,
      addedAt: Date.now(),
    };
    setPantryItems((prev) => [newItem, ...prev]);

    const { error } = await supabase.from("pantry_items").insert({
      user_id: session.user.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      expiry_date: item.expiryDate ?? null,
      category: item.category,
      barcode: item.barcode ?? null,
      long_life: !!item.longLife,
    });

    if (error) {
      console.error("Supabase pantry insert error:", error);
      setPantryItems((prev) => prev.filter((i) => i.id !== tempId));
      return;
    }

    await loadPantryFromSupabase();
  };

  const updatePantryItem = async (id: string, updates: Partial<PantryItem>) => {
    setPantryItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));

    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.quantity !== undefined) payload.quantity = updates.quantity;
    if (updates.unit !== undefined) payload.unit = updates.unit;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.expiryDate !== undefined) payload.expiry_date = updates.expiryDate ?? null;
    if (updates.longLife !== undefined) payload.long_life = !!updates.longLife;

    if (Object.keys(payload).length === 0) return;

    const { error } = await supabase
      .from("pantry_items")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.error("Supabase pantry update error:", error);
      await loadPantryFromSupabase();
    }
  };

  /**
   * Toglie un prodotto dalla dispensa.
   * outcome: "consumed" (usato) o "wasted" (buttato) finiscono nelle statistiche; null = eliminato per errore.
   */
  const removePantryItem = async (id: string, outcome: Outcome | null = null) => {
    const item = pantryItems.find((i) => i.id === id);
    setPantryItems((prev) => prev.filter((i) => i.id !== id));

    const { error } = await supabase.from("pantry_items").delete().eq("id", id);

    if (error) {
      console.error("Supabase pantry delete error:", error);
      await loadPantryFromSupabase();
      return;
    }
    if (item && outcome) {
      await logPantryEvents([
        { name: item.name, category: item.category, quantity: item.quantity, unit: item.unit, outcome },
      ]);
      setStatsVersion((v) => v + 1);
    }
  };

  /** Converte una quantità nell'unità del prodotto in dispensa (null se le unità non sono confrontabili). */
  const convertQuantity = (qty: number, from: string, to: string): number | null => {
    const f = (from || "").trim().toLowerCase();
    const t = (to || "").trim().toLowerCase();
    if (!f || f === t) return qty;
    if (t === "kg" && f === "g") return qty / 1000;
    if (t === "g" && f === "kg") return qty * 1000;
    if (t === "l" && f === "ml") return qty / 1000;
    if (t === "ml" && f === "l") return qty * 1000;
    if (t === "l" && f === "cl") return qty / 100;
    return null;
  };

  /**
   * "L'ho cucinato!": scala gli ingredienti usati dalla dispensa e lo salva davvero.
   * Usa per primo il prodotto che scade prima; i prodotti finiti vengono tolti.
   */
  const consumePantryItems = async (usedIngredients: IngredientUsage[]): Promise<CookResult> => {
    const byExpiry = [...pantryItems].sort((a, b) => {
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    });

    const changes = new Map<string, { item: PantryItem; newQty: number; used: number }>();

    for (const usage of usedIngredients) {
      let best: PantryItem | null = null;
      let bestScore = 1;
      for (const p of byExpiry) {
        if (changes.get(p.id)?.newQty === 0) continue;
        const score = nameMatchScore(usage.name, p.name);
        if (score > bestScore) {
          best = p;
          bestScore = score;
        }
      }
      if (!best) continue;

      const current = changes.get(best.id)?.newQty ?? best.quantity;
      const amount = convertQuantity(Number(usage.quantity) || 0, usage.unit, best.unit);
      // unità non confrontabili (es. "2 pz" contro "500 g"): non tocco la quantità
      if (amount === null || amount <= 0) {
        if (!changes.has(best.id)) changes.set(best.id, { item: best, newQty: current, used: 0 });
        continue;
      }
      const newQty = Math.max(0, parseFloat((current - amount).toFixed(3)));
      changes.set(best.id, { item: best, newQty, used: (changes.get(best.id)?.used ?? 0) + (current - newQty) });
    }

    if (changes.size === 0) return { used: 0, expiring: 0 };

    const finished = [...changes.values()].filter((c) => c.newQty <= 0);
    const reduced = [...changes.values()].filter((c) => c.newQty > 0 && c.used > 0);

    setPantryItems((prev) =>
      prev
        .filter((p) => !finished.some((f) => f.item.id === p.id))
        .map((p) => {
          const r = reduced.find((c) => c.item.id === p.id);
          return r ? { ...p, quantity: r.newQty } : p;
        })
    );

    let failed = false;
    if (finished.length) {
      const { error } = await supabase.from("pantry_items").delete().in("id", finished.map((f) => f.item.id));
      if (error) failed = true;
    }
    for (const r of reduced) {
      const { error } = await supabase.from("pantry_items").update({ quantity: r.newQty }).eq("id", r.item.id);
      if (error) failed = true;
    }
    if (failed) {
      console.error("Aggiornamento dispensa dopo cottura non riuscito");
      await loadPantryFromSupabase();
    }

    await logPantryEvents(
      [...changes.values()].map((c) => ({
        name: c.item.name,
        category: c.item.category,
        quantity: c.used || null,
        unit: c.item.unit,
        outcome: "consumed" as const,
      }))
    );
    setStatsVersion((v) => v + 1);

    const touched = [...changes.values()];
    const expiring = touched.filter((c) => {
      if (!c.item.expiryDate) return false;
      const d = Math.ceil((new Date(c.item.expiryDate).getTime() - Date.now()) / 86_400_000);
      return d <= 3;
    }).length;
    return { used: touched.length, expiring };
  };

  const addShoppingItem = async (
    name: string,
    category: Category,
    quantity?: number | null,
    unit?: string | null,
    opts: { barcode?: string | null; checked?: boolean } = {}
  ) => {
    const tempId = crypto.randomUUID();
    const checked = !!opts.checked;
    setShoppingItems((prev) => [
      { id: tempId, name, category, isChecked: checked, quantity: quantity ?? null, unit: unit ?? null, barcode: opts.barcode ?? null },
      ...prev,
    ]);

    const { error } = await supabase.from("shopping_items").insert({
      user_id: session.user.id,
      name,
      category,
      is_checked: checked,
      quantity: quantity ?? null,
      unit: unit ?? null,
      barcode: opts.barcode ?? null,
    });

    if (error) {
      console.error("Supabase insert error:", error);
      setShoppingItems((prev) => prev.filter((i) => i.id !== tempId));
      return;
    }

    await loadShoppingFromSupabase();
  };

  const addShoppingItemsBulk = async (
    itemsToAdd: Array<{
      name: string;
      category: Category;
      quantity?: number | null;
      unit?: string | null;
    }>
  ) => {
    if (!session?.user?.id || itemsToAdd.length === 0) return;

    const { data: existingRows, error: existingError } = await supabase
      .from("shopping_items")
      .select("id, name, category, is_checked, quantity, unit")
      .eq("is_checked", false);

    if (existingError) {
      console.error("Supabase fetch existing shopping items error:", existingError);
      throw new Error(existingError.message);
    }

    const existingMap = new Map<
      string,
      {
        id: string;
        name: string;
        category: Category;
        quantity: number | null;
        unit: string | null;
      }
    >();

    (existingRows ?? []).forEach((row: any) => {
      existingMap.set(normalizeShoppingKey(row.name, row.unit), {
        id: row.id,
        name: row.name,
        category: row.category,
        quantity: row.quantity != null ? Number(row.quantity) : null,
        unit: row.unit ?? null,
      });
    });

    const updates: Array<{ id: string; quantity: number | null }> = [];
    const inserts: Array<{
      user_id: string;
      name: string;
      category: Category;
      is_checked: boolean;
      quantity: number | null;
      unit: string | null;
    }> = [];

    for (const item of itemsToAdd) {
      const key = normalizeShoppingKey(item.name, item.unit);
      const existing = existingMap.get(key);

      if (existing) {
        const currentQty = existing.quantity != null ? Number(existing.quantity) : 0;
        const addQty = item.quantity != null ? Number(item.quantity) : 0;
        const nextQty = Number((currentQty + addQty).toFixed(2));

        updates.push({
          id: existing.id,
          quantity: nextQty > 0 ? nextQty : existing.quantity ?? null,
        });

        existingMap.set(key, {
          ...existing,
          quantity: nextQty > 0 ? nextQty : existing.quantity ?? null,
        });
      } else {
        inserts.push({
          user_id: session.user.id,
          name: item.name,
          category: item.category,
          is_checked: false,
          quantity: item.quantity ?? null,
          unit: item.unit ?? null,
        });

        existingMap.set(key, {
          id: "",
          name: item.name,
          category: item.category,
          quantity: item.quantity ?? null,
          unit: item.unit ?? null,
        });
      }
    }

    for (const update of updates) {
      const { error } = await supabase
        .from("shopping_items")
        .update({ quantity: update.quantity })
        .eq("id", update.id);

      if (error) {
        console.error("Supabase bulk update error:", error);
        await loadShoppingFromSupabase();
        throw new Error(error.message);
      }
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from("shopping_items").insert(inserts);

      if (error) {
        console.error("Supabase bulk insert error:", error);
        await loadShoppingFromSupabase();
        throw new Error(error.message);
      }
    }

    await loadShoppingFromSupabase();
  };

  /** Scansione al supermercato: mette l'articolo nel carrello e ne ricorda il codice a barre. */
  const checkShoppingFromScan = async (id: string, barcode: string | null) => {
    setShoppingItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isChecked: true, barcode: barcode ?? item.barcode ?? null } : item))
    );
    const payload: any = { is_checked: true };
    if (barcode) payload.barcode = barcode;
    const { error } = await supabase.from("shopping_items").update(payload).eq("id", id);
    if (error) {
      console.error("Supabase scan check error:", error);
      await loadShoppingFromSupabase();
    }
  };

  const toggleShoppingItem = async (id: string) => {
    setShoppingItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isChecked: !item.isChecked } : item))
    );

    const item = shoppingItems.find((i) => i.id === id);
    const nextChecked = item ? !item.isChecked : true;

    const { error } = await supabase
      .from("shopping_items")
      .update({ is_checked: nextChecked })
      .eq("id", id);

    if (error) {
      console.error("Supabase toggle error:", error);
      await loadShoppingFromSupabase();
    }
  };

  const clearCompletedShopping = async () => {
    setShoppingItems((prev) => prev.filter((item) => !item.isChecked));

    const { error } = await supabase
      .from("shopping_items")
      .delete()
      .eq("is_checked", true);

    if (error) {
      console.error("Supabase clear error:", error);
      await loadShoppingFromSupabase();
    }
  };

  const moveShoppingToPantry = async (
    itemsToAdd: Omit<PantryItem, "id" | "addedAt">[],
    shoppingIdsToRemove: string[]
  ) => {
    const pantryRows = itemsToAdd.map((item) => ({
      user_id: session.user.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      expiry_date: item.expiryDate ?? null,
      category: item.category,
      barcode: item.barcode ?? null,
      long_life: !!item.longLife,
    }));

    const { error: insErr } = await supabase.from("pantry_items").insert(pantryRows);

    if (insErr) {
      console.error("Supabase pantry insert (move) error:", insErr);
      await loadPantryFromSupabase();
      await loadShoppingFromSupabase();
      return;
    }

    const { error: delErr } = await supabase
      .from("shopping_items")
      .delete()
      .in("id", shoppingIdsToRemove);

    if (delErr) {
      console.error("Supabase shopping delete (move) error:", delErr);
      await loadPantryFromSupabase();
      await loadShoppingFromSupabase();
      return;
    }

    await loadPantryFromSupabase();
    await loadShoppingFromSupabase();
    setView("pantry");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const loadPantryFromSupabase = async () => {
    const { data, error } = await supabase
      .from("pantry_items")
      .select("id, name, quantity, unit, expiry_date, category, added_at, barcode, long_life")
      .order("added_at", { ascending: false });

    if (error) {
      console.error("Supabase pantry load error:", error);
      return;
    }

    const items: PantryItem[] = (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      quantity: Number(r.quantity ?? 0),
      unit: r.unit,
      expiryDate: r.expiry_date ?? null,
      category: r.category,
      addedAt: r.added_at ? new Date(r.added_at).getTime() : Date.now(),
      barcode: r.barcode ?? null,
      longLife: !!r.long_life,
    }));

    setPantryItems(items);
  };

  const loadShoppingFromSupabase = async () => {
    const { data, error } = await supabase
      .from("shopping_items")
      .select("id, name, category, is_checked, quantity, unit, barcode")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase shopping load error:", error);
      return;
    }

    const items: ShoppingItem[] =
      (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        isChecked: !!r.is_checked,
        quantity: r.quantity != null ? Number(r.quantity) : null,
        unit: r.unit ?? null,
        barcode: r.barcode ?? null,
      })) || [];

    setShoppingItems(items);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 bg-ground">
        <img src="/icons/icon-192.png" alt="" className="h-16 w-16 rounded-2xl animate-pulse" />
        <div className="text-sm font-semibold text-muted">Caricamento…</div>
      </div>
    );
  }

  if (shared) {
    return (
      <SharedRecipeView
        token={shared.token}
        challenge={shared.challenge}
        loggedIn={!!session}
        onAccept={acceptShared}
        onClose={() => setShared(null)}
      />
    );
  }

  if (!session) return <AuthView />;

  const userInitial = (session?.user?.email ?? "?").trim().charAt(0).toUpperCase();

  const navItems: Array<{ id: ViewState; label: string; icon: React.ReactNode }> = [
    { id: "home", label: "Oggi", icon: <Home size={20} /> },
    { id: "pantry", label: "Dispensa", icon: <Refrigerator size={20} /> },
    { id: "chef", label: "EcoChef", icon: <ChefHat size={24} /> },
    { id: "shopping", label: "Spesa", icon: <ShoppingCart size={20} /> },
    { id: "recipeBook", label: "Ricette", icon: <BookOpen size={20} /> },
  ];

  const goTo = (next: ViewState) => {
    setView(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <ProfileButtonContext.Provider value={{ initial: userInitial, open: () => setProfileOpen(true) }}>
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col bg-ground">
      {codeNotice && (
        <div
          role="status"
          className={`fixed inset-x-0 top-0 z-[55] mx-auto flex max-w-md items-start gap-3 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_8px_20px_rgba(31,42,30,0.12)] ${
            codeNotice.ok ? "bg-mint text-forest" : "bg-peach text-[#8E3418]"
          }`}
        >
          <p className="flex-1 pt-2 text-sm font-semibold leading-snug">{codeNotice.text}</p>
          <button type="button" onClick={() => setCodeNotice(null)} className="h-9 shrink-0 rounded-xl bg-white/70 px-3 text-xs font-bold">
            Ok
          </button>
        </div>
      )}
      <main className="flex-1 px-5 pb-40 pt-[max(3.25rem,calc(env(safe-area-inset-top)+1.25rem))]">
        {view === "home" && (
          <HomeView
            pantryItems={pantryItems}
            shoppingItems={shoppingItems}
            credits={credits}
            userInitial={userInitial}
            onOpenProfile={() => setProfileOpen(true)}
            onNavigate={goTo}
            onOpenRecipe={(id) => {
              setOpenRecipeId(id);
              goTo("recipeBook");
            }}
            onResolveExpired={removePantryItem}
            onPostpone={(id, days) => updatePantryItem(id, { expiryDate: dateInDays(days) })}
            statsVersion={statsVersion}
          />
        )}
        {view === "pantry" && (
          <PantryView items={pantryItems} onAdd={addPantryItem} onUpdate={updatePantryItem} onRemove={removePantryItem} />
        )}
        {view === "shopping" && (
          <ShoppingListView
            items={shoppingItems}
            pantryItems={pantryItems}
            onScanCheck={checkShoppingFromScan}
            onAdd={addShoppingItem}
            onToggle={toggleShoppingItem}
            onClearCompleted={clearCompletedShopping}
            onMoveToPantry={moveShoppingToPantry}
          />
        )}
        {view === "chef" && (
          <ChefView
            items={pantryItems}
            onCook={consumePantryItems}
            onAddShoppingItems={addShoppingItemsBulk}
            onCreditsChange={setCredits}
          />
        )}
        {view === "recipeBook" && (
          <RecipeBookView
            onCreditsChange={setCredits}
            onCook={consumePantryItems}
            onAddShoppingItems={addShoppingItemsBulk}
            initialRecipeId={openRecipeId}
            onInitialRecipeShown={() => setOpenRecipeId(null)}
          />
        )}
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto h-36 max-w-md bg-gradient-to-b from-ground/0 via-ground/90 to-ground" />

      <nav
        aria-label="Navigazione principale"
        className="fixed inset-x-0 z-40 mx-auto grid h-[68px] max-w-[calc(28rem-2rem)] grid-cols-5 items-center rounded-[28px] bg-white shadow-[0_10px_30px_rgba(47,74,44,0.14)]"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 14px)", left: "1rem", right: "1rem" }}
      >
        {navItems.map((item) => {
          const active = view === item.id;
          if (item.id === "chef") {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goTo("chef")}
                aria-label="EcoChef"
                aria-current={active ? "page" : undefined}
                className={`-mt-8 flex h-[60px] w-[60px] items-center justify-center justify-self-center rounded-full border-[5px] border-ground shadow-[0_8px_18px_rgba(79,107,74,0.35)] transition-transform active:scale-95 ${
                  active ? "bg-forest text-honey" : "bg-emerald-600 text-white"
                }`}
              >
                {item.icon}
              </button>
            );
          }
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => goTo(item.id)}
              aria-current={active ? "page" : undefined}
              className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
                active ? "font-extrabold text-forest" : "font-semibold text-muted"
              }`}
            >
              <span className={`flex h-7 w-11 items-center justify-center rounded-full ${active ? "bg-mint" : ""}`}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <ProfileSheet
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        userEmail={session?.user?.email ?? null}
        notificationPermission={notificationPermission}
        onRequestNotificationPermission={requestNotificationPermission}
        pushActive={pushActive}
        onHouseholdChanged={() => {
          loadPantryFromSupabase();
          loadShoppingFromSupabase();
          setStatsVersion((v) => v + 1);
        }}
        onLogout={handleLogout}
      />
    </div>
    </ProfileButtonContext.Provider>
  );
};

export default App;
