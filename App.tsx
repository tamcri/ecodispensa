import { supabase } from "./services/supabaseClient";
import AuthView from "./components/AuthView";
import { useState, useEffect } from "react";
import { Refrigerator, ShoppingCart, ChefHat, User } from "lucide-react";
import { PantryItem, ShoppingItem, ViewState, Category, IngredientUsage } from "./types";
import { PantryView } from "./components/PantryView";
import { ShoppingListView } from "./components/ShoppingListView";
import { ChefView } from "./components/ChefView";
import { ProfileSheet } from "./components/ProfileSheet";

const normalizeShoppingKey = (name: string, unit?: string | null) =>
  `${name.trim().toLowerCase()}__${(unit ?? "").trim().toLowerCase()}`;

const App = () => {
  const [view, setView] = useState<ViewState>("pantry");
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
          icon: "/favicon.ico",
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
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="text-sm text-gray-600">Caricamento…</div>
      </div>
    );
  }

  if (!session) return <AuthView />;

  return (
    <div className="min-h-screen max-w-md mx-auto bg-gray-50 flex flex-col relative border-x border-gray-100">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2 text-emerald-700">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
            E
          </div>
          <h1 className="font-bold text-xl tracking-tight">EcoDispensa</h1>
        </div>

        <button
          onClick={() => setProfileOpen(true)}
          className="p-2 rounded-full text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          title="Profilo"
          type="button"
        >
          <User size={20} />
        </button>
      </header>

      <main className="flex-1 p-6 overflow-y-auto no-scrollbar">
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
          />
        )}
      </main>

      <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 pb-safe">
        <div className="flex justify-around items-center p-2">
          <button
            onClick={() => setView("pantry")}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
              view === "pantry" ? "text-emerald-600 bg-emerald-50" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <Refrigerator size={24} strokeWidth={view === "pantry" ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Dispensa</span>
          </button>
          <button
            onClick={() => setView("shopping")}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
              view === "shopping" ? "text-emerald-600 bg-emerald-50" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <ShoppingCart size={24} strokeWidth={view === "shopping" ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Spesa</span>
          </button>
          <button
            onClick={() => setView("chef")}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
              view === "chef" ? "text-emerald-600 bg-emerald-50" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <ChefHat size={24} strokeWidth={view === "chef" ? 2.5 : 2} />
            <span className="text-[10px] font-medium">EcoChef</span>
          </button>
        </div>
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