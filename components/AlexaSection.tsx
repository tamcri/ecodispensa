import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChefHat, Loader2, Sunrise } from 'lucide-react';
import { alexaLinked, alexaUnlink, startAlexaLink } from '../services/alexa';
import { ALEXA_PHRASES } from './AlexaLinkView';

/** Profilo → Alexa: collegamento in un tocco, stato, frasi da dire, buongiorno con la Routine */
export const AlexaSection = ({ isPremium, onOpenPlans }: { isPremium: boolean; onOpenPlans: () => void }) => {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    alexaLinked().then(setLinked);
  }, []);

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    const r = await startAlexaLink();
    if ('url' in r) {
      window.location.assign(r.url);
      return;
    }
    setBusy(false);
    setMsg(
      r.error === 'NOT_CONFIGURED'
        ? 'Il collegamento in un tocco non è ancora attivo. Puoi abilitare la skill EcoDispensa dall’app Alexa.'
        : 'Non sono riuscito ad avviare il collegamento. Controlla la connessione e riprova.'
    );
  };

  const disconnect = async () => {
    setBusy(true);
    const ok = await alexaUnlink();
    setBusy(false);
    if (ok) setLinked(false);
    else setMsg('Non sono riuscito a scollegare Alexa. Riprova tra poco.');
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-[22px] bg-white p-4">
        {linked ? (
          <p className="flex items-center gap-2 font-display text-[18px] font-bold text-forest">
            <CheckCircle2 size={22} /> Alexa è collegata
          </p>
        ) : (
          <>
            <h3 className="font-display text-[20px] font-extrabold leading-tight text-ink">Usa EcoDispensa con la voce</h3>
            <p className="text-[14px] leading-snug text-muted">
              Chiedi ad Alexa cosa scade, dille cosa hai usato e detta la lista della spesa mentre cucini. Si collega in un tocco.
            </p>
          </>
        )}
        {linked === null ? (
          <Loader2 size={20} className="animate-spin text-muted" />
        ) : linked ? (
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="h-11 rounded-2xl bg-ground text-[14px] font-bold text-ink disabled:opacity-60"
          >
            Scollega Alexa
          </button>
        ) : (
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#1A98D5] text-[15px] font-bold text-white disabled:opacity-60"
          >
            {busy && <Loader2 size={18} className="animate-spin" />} Collega ad Alexa
          </button>
        )}
        {msg && <p className="rounded-2xl bg-peach px-3.5 py-2.5 text-[13px] text-[#8E3418]">{msg}</p>}
      </section>

      <section className="flex flex-col gap-2 rounded-[22px] bg-white p-4">
        <h4 className="text-[15px] font-bold text-ink">Cosa puoi dire</h4>
        <ul className="flex flex-col gap-1.5">
          {ALEXA_PHRASES.map((t) => (
            <li key={t} className="rounded-xl bg-mint px-3 py-2 text-[14px] font-semibold text-forest">
              «{t}»
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-muted">Dopo «Alexa, apri la mia dispensa» puoi fare più richieste di seguito. Per finire di' «stop».</p>
      </section>

      <section className="flex gap-3 rounded-[22px] bg-white p-4">
        <Sunrise size={22} className="mt-0.5 shrink-0 text-tangerine" />
        <div className="flex flex-col gap-1">
          <h4 className="text-[15px] font-bold text-ink">Il buongiorno con le scadenze</h4>
          <p className="text-[13px] leading-snug text-muted">
            Nell’app Alexa: Altro → Routine → +. Scegli l’ora, poi Aggiungi azione → Personalizzata e scrivi
            «chiedi alla mia dispensa cosa scade oggi». Ogni mattina Alexa ti dirà cosa usare per primo.
          </p>
        </div>
      </section>

      {!isPremium && (
        <button type="button" onClick={onOpenPlans} className="flex gap-3 rounded-[22px] bg-honey p-4 text-left">
          <ChefHat size={22} className="mt-0.5 shrink-0 text-[#6E5208]" />
          <span className="flex flex-col gap-1">
            <span className="text-[15px] font-bold text-[#6E5208]">Lo Chef a voce è nell’abbonamento</span>
            <span className="text-[13px] leading-snug text-[#6E5208]">
              «Cosa posso cucinare oggi?»: lo Chef ti propone tre piatti con quello che hai e mette in lista ciò che manca.
            </span>
          </span>
        </button>
      )}
    </div>
  );
};
