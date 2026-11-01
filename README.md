<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1L9--2lMn9I75ZRRuNXkBBcjX1eAoHcAA

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in [.env.local](.env.local). Server functions in `api/` also need `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `OPENAI_API_KEY`
3. Run the app:
   `npm run dev`

## App installabile (PWA)

EcoDispensa si può installare sul telefono come un'app:

- **Android / Chrome desktop**: compare il banner "Installa EcoDispensa" (oppure menu del browser → Installa app).
- **iPhone / iPad**: da Safari, Condividi → Aggiungi alla schermata Home.

File coinvolti:

- `public/manifest.webmanifest` e `public/icons/`: nome, colori e icone dell'app.
- `public/sw.js`: service worker. L'app si apre anche senza rete; `/api/*`, Supabase e Stripe non vengono mai messi in cache.
- `components/PwaBanners.tsx`: registra il service worker, propone l'installazione e avvisa quando c'è una nuova versione.

Il service worker è attivo solo nella build di produzione (`npm run build && npm run preview`), non con `npm run dev`.
Se modifichi le regole di cache in `sw.js`, incrementa `VERSION` in cima al file.

## Foto dei piatti e riconoscimento prodotti

- `api/product.ts` (POST): riconosce un prodotto da una foto (fotocamera in Dispensa e Spesa) usando OpenAI sul server. La chiave non arriva mai nel browser.
- L'utente può scattare la foto del piatto che ha cucinato: viene caricata nel bucket Supabase `recipe-images`, nella cartella dell'utente, e collegata alla ricetta.

Variabile opzionale sul server: `OPENAI_VISION_MODEL` (default `OPENAI_MODEL` o `gpt-4o-mini`).

## Anti-spreco: famiglia, notifiche, codice a barre

- **Famiglia**: dispensa, lista spesa e statistiche sono legate a una famiglia (`households`, `household_members`). Ogni utente ne ha una personale; con il codice invito (Profilo → Famiglia) si entra in quella di un altro. Le regole RLS filtrano per famiglia.
- **Consumato/buttato**: ogni prodotto tolto dalla dispensa può essere registrato in `pantry_events`; la home mostra il riepilogo del mese.
- **Scadenze stimate e consigli**: `foodGuide.ts` contiene giorni di conservazione e consigli per i prodotti freschi (frutta, verdura, pane, banco). Solo per questi la scadenza viene proposta in automatico.
- **Notifiche push**: `api/cron-expiry.ts` gira ogni mattina (cron in `vercel.json`, solo in produzione) e avvisa i dispositivi iscritti se qualcosa scade entro 2 giorni. Variabili: `VAPID_PUBLIC_KEY` (e la stessa come `VITE_VAPID_PUBLIC_KEY` per l'app), `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Codice a barre**: lettura con il `BarcodeDetector` del browser o, dove manca (iPhone), con `barcode-detector` (WebAssembly). Il prodotto viene cercato su Open Food Facts tramite `api/product.ts` (GET `?code=`).

Nota: il piano Vercel gratuito accetta al massimo 12 funzioni in `api/` (i file in `api/_lib/` non contano).
