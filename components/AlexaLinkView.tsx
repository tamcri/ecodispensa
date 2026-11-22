import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

/**
 * Collegamento con Alexa (OAuth "authorization code").
 * L'app Alexa apre ecodispensa.it/app/alexa?client_id=…&redirect_uri=…&state=…&response_type=code;
 * l'utente entra nel suo account, conferma, e torna ad Alexa con un codice monouso.
 */
export type AlexaLinkRequest = { redirectUri: string; state: string };

const CLIENT_ID = 'ecodispensa-alexa';
const AMAZON_REDIRECT = /^https:\/\/(layla\.amazon\.com|pitangui\.amazon\.com|alexa\.amazon\.co\.jp)\/api\/skill\/link\/[A-Za-z0-9]+$/;

export function alexaLinkFromUrl(): AlexaLinkRequest | null {
  try {
    if (window.location.pathname.replace(/\/+$/, '') !== '/app/alexa') return null;
    const p = new URLSearchParams(window.location.search);
    const redirectUri = p.get('redirect_uri') ?? '';
    if (p.get('client_id') !== CLIENT_ID || p.get('response_type') !== 'code' || !AMAZON_REDIRECT.test(redirectUri)) return null;
    return { redirectUri, state: p.get('state') ?? '' };
  } catch {
    return null;
  }
}

const back = (req: AlexaLinkRequest, params: Record<string, string>) => {
  const u = new URL(req.redirectUri);
  u.searchParams.set('state', req.state);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  window.location.replace(u.toString());
};

export const AlexaLinkView = ({ req, email }: { req: AlexaLinkRequest; email?: string | null }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allow = async () => {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('alexa_create_code', { p_redirect_uri: req.redirectUri });
    if (error || typeof data !== 'string') {
      setBusy(false);
      setError('Non sono riuscito a collegare Alexa. Riprova tra poco.');
      return;
    }
    back(req, { code: data });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ground px-6 py-10">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-[28px] bg-white p-6 shadow-[0_6px_20px_rgba(47,74,44,0.08)]">
        <img src="/icons/icon-192.png" alt="" className="h-14 w-14 rounded-2xl" />
        <div>
          <h1 className="font-display text-[24px] font-extrabold leading-tight text-ink">Collegare EcoDispensa ad Alexa?</h1>
          {email && <p className="mt-1 text-[13px] text-muted">Account: {email}</p>}
        </div>
        <ul className="flex flex-col gap-2.5 text-[14px] leading-snug text-ink">
          {[
            'Alexa ti dice cosa scade e cosa puoi cucinare',
            'Puoi dirle cosa hai usato o buttato: aggiorna la dispensa',
            'Puoi aggiungere prodotti alla lista della spesa',
          ].map((t) => (
            <li key={t} className="flex gap-2.5">
              <Check size={18} className="mt-0.5 shrink-0 text-emerald-600" />
              {t}
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-muted">Puoi scollegarla quando vuoi dall'app Alexa (Skill → EcoDispensa → Disattiva).</p>
        {error && <p className="rounded-2xl bg-peach px-3.5 py-2.5 text-[13px] text-[#8E3418]">{error}</p>}
        <button
          type="button"
          onClick={allow}
          disabled={busy}
          className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[15px] font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : null} Collega Alexa
        </button>
        <button
          type="button"
          onClick={() => back(req, { error: 'access_denied' })}
          disabled={busy}
          className="h-10 text-[14px] font-semibold text-muted"
        >
          Annulla
        </button>
      </div>
    </div>
  );
};
