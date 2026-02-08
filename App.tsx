import { LogOut } from "lucide-react";
import { supabase } from "./services/supabaseClient";
import AuthView from "./components/AuthView";
import { useState, useEffect } from "react";
import { Refrigerator, ShoppingCart, ChefHat, Bell, BellOff } from "lucide-react";
import { PantryItem, ShoppingItem, ViewState, Category, IngredientUsage } from "./types";
import { PantryView } from "./components/PantryView";
import { ShoppingListView } from "./components/ShoppingListView";
import { ChefView } from "./components/ChefView";

const App = () => {
  const [view, setView] = useState<ViewState>("pantry");
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");

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

  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
    setAuthReady(true);
  });

  return () => {
    sub.subscription.unsubscribe();
  };
}, []);

  // Load from local storage
  useEffect(() => {
    // Check notification permission status
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

  // --- Notification Logic ---

  const checkExpirationsAndNotify = () => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const lastNotifiedDate = localStorage.getItem("eco-last-notification-date");

    // Avoid spamming: notify only once per day
    if (lastNotifiedDate === todayStr) return;

    const expiringItems = pantryItems.filter((item) => {
      if (!item.expiryDate) return false;
      const expiry = new Date(item.expiryDate);
      const diffTime = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      // Notify for items expiring today or within next 3 days
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
          icon: "/favicon.ico", // Fallback icon
          tag: "expiry-notification",
        });
        // Mark as notified for today
        localStorage.setItem("eco-last-notification-date", todayStr);
      } catch (e) {
        console.error("Notification error:", e);
      }
    }
  };

  // Run check when items change or permission is granted
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

  // --- Actions ---

  const addPantryItem = async (item: Omit<PantryItem, "id" | "addedAt">) => {
  // UI immediata (optimistic)
  const tempId = crypto.randomUUID();
  const newItem: PantryItem = {
    ...item,
    id: tempId,
    addedAt: Date.now(),
  };
  setPantryItems((prev) => [newItem, ...prev]);

  // Supabase insert
  const { error } = await supabase.from("pantry_items").insert({
    user_id: session.user.id,                // ✅ fondamentale
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    expiry_date: item.expiryDate ?? null,    // mapping campo
    category: item.category,
  });

  if (error) {
    console.error("Supabase pantry insert error:", error);
    // rollback UI se fallisce
    setPantryItems((prev) => prev.filter((i) => i.id !== tempId));
    return;
  }

  // ricarico per prendere l'ID vero dal DB
  await loadPantryFromSupabase();
};


 const updatePantryItem = async (id: string, updates: Partial<PantryItem>) => {
  // UI immediata
  setPantryItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));

  const payload: any = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.quantity !== undefined) payload.quantity = updates.quantity;
  if (updates.unit !== undefined) payload.unit = updates.unit;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.expiryDate !== undefined) payload.expiry_date = updates.expiryDate ?? null;

  // niente da salvare
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase
    .from("pantry_items")
    .update(payload)
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (error) {
    console.error("Supabase pantry update error:", error);
    await loadPantryFromSupabase(); // riallineo in caso di errori
  }
};


  const removePantryItem = async (id: string) => {
  // UI immediata
  setPantryItems((prev) => prev.filter((item) => item.id !== id));

  const { error } = await supabase
    .from("pantry_items")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (error) {
    console.error("Supabase pantry delete error:", error);
    await loadPantryFromSupabase(); // riallineo
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

 const addShoppingItem = async (name: string, category: Category) => {
  // UI immediata
  const tempId = crypto.randomUUID();
  setShoppingItems((prev) => [{ id: tempId, name, category, isChecked: false }, ...prev]);

  // Inserimento reale su Supabase
  const { error } = await supabase.from("shopping_items").insert({
    user_id: session.user.id,   // ✅ fondamentale
    name,
    category,
    is_checked: false,
  });

  if (error) {
    console.error("Supabase insert error:", error);
    // opzionale: rollback del temp item
    setShoppingItems((prev) => prev.filter((i) => i.id !== tempId));
    return;
  }

  // Ricarica la lista dal DB per prendere l'ID vero
  await loadShoppingFromSupabase();
};



 const toggleShoppingItem = async (id: string) => {
  // UI immediata
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
    // ricarico per riallineare
    await loadShoppingFromSupabase();
  }
};


  const clearCompletedShopping = async () => {
  // UI immediata
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
  // 1) Inserisci in Dispensa (DB)
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

  // 2) Elimina dalla Spesa (DB)
  const { error: delErr } = await supabase
    .from("shopping_items")
    .delete()
    .in("id", shoppingIdsToRemove)
    .eq("user_id", session.user.id);

  if (delErr) {
    console.error("Supabase shopping delete (move) error:", delErr);
    // A questo punto l'item è già in dispensa DB, quindi riallineiamo tutto
    await loadPantryFromSupabase();
    await loadShoppingFromSupabase();
    return;
  }

  // 3) Ricarica liste dal DB (fonte di verità)
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
    .select("id, name, category, is_checked")
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
    })) || [];

  setShoppingItems(items);
};

  // ✅ Guard: aspetta che Supabase risponda, poi se non loggato mostra login
  if (!authReady) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="text-sm text-gray-600">
        Caricamento…
      </div>
    </div>
  );
}

if (!session) return <AuthView />;


  // --- Render ---

  return (
    <div className="min-h-screen max-w-md mx-auto bg-gray-50 flex flex-col relative border-x border-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2 text-emerald-700">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
            E
          </div>
          <h1 className="font-bold text-xl tracking-tight">EcoDispensa</h1>
        </div>

        {/* Notification Bell */}
        <button
          onClick={requestNotificationPermission}
          className={`p-2 rounded-full transition-colors ${
            notificationPermission === "granted"
              ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
              : "text-gray-400 bg-gray-100 hover:bg-gray-200"
          }`}
          title={notificationPermission === "granted" ? "Notifiche attive" : "Attiva notifiche scadenza"}
        >
          {notificationPermission === "granted" ? <Bell size={20} /> : <BellOff size={20} />}
        </button>
<button
  onClick={handleLogout}
  className="p-2 rounded-full text-gray-400 bg-gray-100 hover:bg-gray-200 transition-colors"
  title="Esci"
>
  <LogOut size={20} />
</button>


      </header>

      {/* Content */}
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
        {view === "chef" && <ChefView items={pantryItems} onCook={consumePantryItems} />}
      </main>

      {/* Navigation */}
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
    </div>
  );
};

export default App;
