import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

/**
 * Avviso giornaliero delle scadenze (lanciato dal cron di Vercel, vedi vercel.json).
 * Per ogni dispositivo iscritto manda al massimo una notifica al giorno,
 * se nella dispensa della famiglia qualcosa scade oggi o nei prossimi 2 giorni.
 */

const TZ = "Europe/Rome";

function romeDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  // en-CA dà il formato YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

function buildMessage(items: Array<{ name: string; expiry_date: string }>, today: string, tomorrow: string) {
  const todayItems = items.filter((i) => i.expiry_date === today).map((i) => i.name);
  const tomorrowItems = items.filter((i) => i.expiry_date === tomorrow).map((i) => i.name);
  const names = items.map((i) => i.name);

  const list = (arr: string[]) =>
    arr.length <= 2 ? arr.join(" e ") : `${arr.slice(0, 2).join(", ")} e altri ${arr.length - 2}`;

  let title = "Da usare presto";
  if (todayItems.length) title = todayItems.length === 1 ? `${todayItems[0]} scade oggi` : `${todayItems.length} prodotti scadono oggi`;
  else if (tomorrowItems.length) title = tomorrowItems.length === 1 ? `${tomorrowItems[0]} scade domani` : `${tomorrowItems.length} prodotti scadono domani`;

  const body = `${list(names)}: tocca qui e EcoChef ti propone cosa cucinarci.`;
  return { title, body };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel invia "Authorization: Bearer <CRON_SECRET>" alle chiamate del cron
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: "Missing environment variables" });
  }

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://ecodispensa.vercel.app", vapidPublic, vapidPrivate);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const today = romeDate(0);
  const tomorrow = romeDate(1);
  const limit = romeDate(2);

  const { data: subs, error: subsErr } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, last_notified_on")
    .or(`last_notified_on.is.null,last_notified_on.lt.${today}`);
  if (subsErr) return res.status(500).json({ error: subsErr.message });
  if (!subs?.length) return res.status(200).json({ sent: 0 });

  // famiglia di ogni utente
  const userIds = [...new Set(subs.map((s) => s.user_id))];
  const { data: members } = await supabase.from("household_members").select("user_id, household_id").in("user_id", userIds);
  const householdOf = new Map<string, string>((members ?? []).map((m: any) => [m.user_id, m.household_id]));

  // prodotti in scadenza per famiglia
  const householdIds = [...new Set((members ?? []).map((m) => m.household_id))];
  const { data: items } = await supabase
    .from("pantry_items")
    .select("household_id, name, expiry_date")
    .in("household_id", householdIds.length ? householdIds : ["00000000-0000-0000-0000-000000000000"])
    .gte("expiry_date", today)
    .lte("expiry_date", limit)
    .gt("quantity", 0)
    .order("expiry_date", { ascending: true });

  const itemsByHousehold = new Map<string, Array<{ name: string; expiry_date: string }>>();
  for (const it of items ?? []) {
    const list = itemsByHousehold.get(it.household_id) ?? [];
    list.push({ name: it.name, expiry_date: it.expiry_date });
    itemsByHousehold.set(it.household_id, list);
  }

  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    const hid = householdOf.get(sub.user_id);
    const list = hid ? itemsByHousehold.get(hid) : undefined;
    if (!list?.length) continue;

    const { title, body } = buildMessage(list, today, tomorrow);
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url: "/?view=chef", tag: `expiry-${today}` }),
        { TTL: 12 * 3600, urgency: "normal" }
      );
      sent++;
      await supabase.from("push_subscriptions").update({ last_notified_on: today }).eq("id", sub.id);
    } catch (e: any) {
      // 404/410: il dispositivo ha revocato l'iscrizione
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        removed++;
      } else {
        console.error("push send error:", e?.statusCode, e?.body ?? e?.message);
      }
    }
  }

  return res.status(200).json({ sent, removed, checked: subs.length });
}
