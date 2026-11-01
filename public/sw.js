/* EcoDispensa service worker
 *
 * - Pagine: prima la rete, se manca la connessione usa l'ultima versione salvata.
 * - File dell'app (/assets/*, hanno un nome che cambia a ogni build): dalla cache, poi rete.
 * - Icone, manifest, font Google: dalla cache aggiornandoli in background.
 * - NON tocca mai /api/*, Supabase, Stripe o richieste diverse da GET:
 *   dati personali e crediti passano sempre dalla rete.
 */

const VERSION = "v2";
const SHELL_CACHE = `ecodispensa-shell-${VERSION}`;
const ASSET_CACHE = `ecodispensa-assets-${VERSION}`;
const FONT_CACHE = `ecodispensa-fonts-${VERSION}`;
const KNOWN_CACHES = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE];

const SHELL_URLS = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("ecodispensa-") && !KNOWN_CACHES.includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// La pagina chiede di attivare subito la nuova versione (pulsante "Aggiorna")
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Font Google
  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }

  // Tutto il resto fuori dal nostro dominio (Supabase, Stripe, ...) va diretto in rete
  if (url.origin !== self.location.origin) return;

  // API: mai in cache
  if (url.pathname.startsWith("/api/")) return;

  // Navigazione tra pagine
  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
    return;
  }

  // File della build con hash nel nome: non cambiano mai
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(req, ASSET_CACHE));
    return;
  }

  // Icone, manifest e altri file statici
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
  }
});

async function networkFirstPage(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put("/", res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match("/");
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) {
    await cache.put(req, res.clone());
    trimCache(cache, 60);
  }
  return res;
}

// Le build vecchie lasciano file non più usati: tiene solo i più recenti
async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i++) await cache.delete(keys[i]);
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  return cached || (await network) || fetch(req);
}

// ---------------------------------------------------------------
// Notifiche push (scadenze)
// ---------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "EcoDispensa";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Hai prodotti da usare presto.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "ecodispensa-expiry",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          await client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});
