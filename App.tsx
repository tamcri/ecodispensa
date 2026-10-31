import { supabase } from "./services/supabaseClient";
import AuthView from "./components/AuthView";
import React, { useState, useEffect } from "react";
import { Refrigerator, ShoppingCart, ChefHat, BookOpen, Home } from "lucide-react";
import { PantryItem, ShoppingItem, ViewState, Category, IngredientUsage } from "./types";
import { PantryView } from "./components/PantryView";
import { ShoppingListView } from "./components/ShoppingListView";
import { ChefView } from "./components/ChefView";
import { ProfileSheet } from "./components/ProfileSheet";
import { RecipeBookView } from "./components/RecipeBookView";
import { HomeView } from "./components/HomeView";
import { fetchCredits } from "./services/api";

const normalizeShoppingKey = (name: string, unit?: string | null) =>
  `${name.trim().toLowerCase()}__${(unit ?? "").trim().toLowerCase()}`;

const App = () => {
  const [view, setView] = useState<ViewState>("home");
  const [credits, setCredits] = useState<number | null>(null);
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");

  const [profileOpen, setProfileOpen] = useState(false);

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

  useEffect(() => {
    if (!session) return;
    loadShoppingFromSupabase();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadPantryFromSupabase();
  }, [session]);

  // Crediti EcoChef mostrati nella schermata Oggi
  useEffect(() => {
    if (!session || view !== "home") return;
    fetchCredits().then((c) => {
      if (c !== null) setCredits(c);
    });
  }, [session, view]);

  const checkExpirationsAndNotify = () => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const lastNotifiedDate = localStorage.getItem("eco-last-notification-date");

    if (lastNotifiedDate === todayStr) return;

    const expiringItems = pantryItems.filter((item) => {
      if (!item.expiryDate) return false;
      const expiry = new Date(item.expiryDate);
      const diffTime = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 3;
    });

    if (expiringItems.length > 0) {
      const itemNames = expiringItems
        .map((i) => i.name)
        .slice(0, 2)
        .join(", ");
      const suffix = expiringItems.length > 2 ? ` e altri ${expiringItems.length - 2}` : "";
      const bodyText = `Hai ${expiringItems.length} prodotti in scadenza: ${itemNames}${suffix}. Cucinali subito con EcoChef!`;

      try {
        new Notification("EcoDispensa - Anti Spreco ⚠️", {
          body: bodyText,
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
  }, [pantryItems, notificationPermission]);

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      alert("Il tuo browser non supporta le notifiche.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      checkExpirationsAndNotify();
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

    if (Object.keys(payload).length === 0) return;

    const { error } = await supabase
      .from("pantry_items")
      .update(payload)
      .eq("id", id)
      .eq("user_id", session.user.id);

    if (error) {
      console.error("Supabase pantry update error:", error);
      await loadPantryFromSupabase();
    }
  };

  const removePantryItem = async (id: string) => {
    setPantryItems((prev) => prev.filter((item) => item.id !== id));

    const { error } = await supabase
      .from("pantry_items")
      .delete()
      .eq("id", id)
      .eq("user_id", session.user.id);

    if (error) {
      console.error("Supabase pantry delete error:", error);
      await loadPantryFromSupabase();
    }
  };

  const consumePantryItems = (usedIngredients: IngredientUsage[]) => {
    setPantryItems((prevItems) => {
      return prevItems.map((pantryItem) => {
        const usage = usedIngredients.find(
          (u) =>
            u.name.toLowerCase().includes(pantryItem.name.toLowerCase()) ||
            pantryItem.name.toLowerCase().includes(u.name.toLowerCase())
        );

        if (usage) {
          let amountToSubtract = usage.quantity;

          if (usage.unit !== pantryItem.unit) {
            if (pantryItem.unit === "kg" && usage.unit === "g") amountToSubtract = usage.quantity / 1000;
            else if (pantryItem.unit === "g" && usage.unit === "kg") amountToSubtract = usage.quantity * 1000;
            else if (pantryItem.unit === "l" && usage.unit === "ml") amountToSubtract = usage.quantity / 1000;
            else if (pantryItem.unit === "ml" && usage.unit === "l") amountToSubtract = usage.quantity * 1000;
          }

          const newQuantity = Math.max(0, parseFloat((pantryItem.quantity - amountToSubtract).toFixed(2)));
          return { ...pantryItem, quantity: newQuantity };
        }
        return pantryItem;
      });
    });
  };

  const addShoppingItem = async (
    name: string,
    category: Category,
    quantity?: number | null,
    unit?: string | null
  ) => {
    const tempId = crypto.randomUUID();
    setShoppingItems((prev) => [
      { id: tempId, name, category, isChecked: false, quantity: quantity ?? null, unit: unit ?? null },
      ...prev,
    ]);

    const { error } = await supabase.from("shopping_items").insert({
      user_id: session.user.id,
      name,
      category,
      is_checked: false,
      quantity: quantity ?? null,
      unit: unit ?? null,
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
      .eq("user_id", session.user.id)
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
        .eq("id", update.id)
        .eq("user_id", session.user.id);

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

  const toggleShoppingItem = async (id: string) => {
    setShoppingItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isChecked: !item.isChecked } : item))
    );

    const item = shoppingItems.find((i) => i.id === id);
    const nextChecked = item ? !item.isChecked : true;

    const { error } = await supabase
      .from("shopping_items")
      .update({ is_checked: nextChecked })
      .eq("id", id)
      .eq("user_id", session.user.id);

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
      .eq("user_id", session.user.id)
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
      .in("id", shoppingIdsToRemove)
      .eq("user_id", session.user.id);

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
      .select("id, name, quantity, unit, expiry_date, category, added_at")
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
    }));

    setPantryItems(items);
  };

  const loadShoppingFromSupabase = async () => {
    const { data, error } = await supabase
      .from("shopping_items")
      .select("id, name, category, is_checked, quantity, unit")
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

  if (!session) return <AuthView />;

  const userInitial = (session?.user?.email ?? "?").trim().charAt(0).toUpperCase();

  const navItems: Array<{ id: ViewState; label: string; icon: React.ReactNode }> = [
    { id: "home", label: "Oggi", icon: <Home size={22} /> },
    { id: "pantry", label: "Dispensa", icon: <Refrigerator size={22} /> },
    { id: "chef", label: "EcoChef", icon: <ChefHat size={26} /> },
    { id: "shopping", label: "Spesa", icon: <ShoppingCart size={22} /> },
    { id: "recipeBook", label: "Ricette", icon: <BookOpen size={22} /> },
  ];

  const goTo = (next: ViewState) => {
    setView(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col bg-ground">
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
          />
        )}
        {view === "pantry" && (
          <PantryView items={pantryItems} onAdd={addPantryItem} onUpdate={updatePantryItem} onRemove={removePantryItem} />
        )}
        {view === "shopping" && (
          <ShoppingListView
            items={shoppingItems}
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
            initialRecipeId={openRecipeId}
            onInitialRecipeShown={() => setOpenRecipeId(null)}
          />
        )}
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto h-36 max-w-md bg-gradient-to-b from-ground/0 via-ground/90 to-ground" />

      <nav
        aria-label="Navigazione principale"
        className="fixed inset-x-0 z-40 mx-auto grid h-[68px] max-w-[calc(28rem-2rem)] grid-cols-5 items-center rounded-[34px] bg-ink shadow-[0_12px_32px_rgba(23,32,26,0.28)]"
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
                className={`-mt-8 flex h-[62px] w-[62px] items-center justify-center justify-self-center rounded-full border-[5px] border-ground transition-transform active:scale-95 ${
                  active ? "bg-emerald-600 text-white" : "bg-lemon text-ink"
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
                active ? "font-bold text-lemon" : "font-semibold text-[#A9B3AC]"
              }`}
            >
              {item.icon}
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
        onLogout={handleLogout}
      />
    </div>
  );
};

export default App;
