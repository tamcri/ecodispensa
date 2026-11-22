# EcoDispensa per Alexa

- **Server della skill**: funzione Supabase `alexa` (`supabase/functions/alexa`), senza verifica JWT di Supabase:
  controlla la firma di Amazon e lo Skill ID.
  - Endpoint della skill: `https://hqcbmghfpwrzrubshffb.supabase.co/functions/v1/alexa`
  - Token (collegamento account): `https://hqcbmghfpwrzrubshffb.supabase.co/functions/v1/alexa/token`
- **Collegamento account** (OAuth, Auth Code Grant)
  - Authorization URI: `https://ecodispensa.it/app/alexa`
  - Client ID: `ecodispensa-alexa`
  - Secret: scelto dal titolare, salvato in Supabase come segreto `ALEXA_CLIENT_SECRET`
  - Autenticazione client: HTTP Basic (anche nel corpo va bene)
  - Scope: `dispensa`
- **Tabelle**: `alexa_auth_codes`, `alexa_tokens` (solo hash dei codici/token, RLS senza policy).
  Funzioni: `alexa_create_code`, `alexa_status`, `alexa_unlink`.
- **Modello vocale**: `interaction-model-it-IT.json` (da incollare in Interaction Model → JSON Editor).
- **Buongiorno del mattino**: Routine dell'app Alexa → azione "Personalizzata": `apri eco dispensa`.
