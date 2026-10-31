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
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
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
