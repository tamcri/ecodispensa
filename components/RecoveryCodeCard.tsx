import React, { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { createRecoveryCode, hasRecoveryCode } from "../services/account";

/**
 * Codice di recupero: l'unico modo per rientrare se si dimentica la password
 * (l'app non chiede l'email). Il codice si vede una volta sola.
 */
export const RecoveryCodeCard = ({ compact = false, onCreated }: { compact?: boolean; onCreated?: () => void }) => {
  const [has, setHas] = useState<boolean | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    hasRecoveryCode().then(setHas);
  }, []);

  const create = async () => {
    setBusy(true);
    const c = await createRecoveryCode();
    setBusy(false);
    if (c) {
      setCode(c);
      setHas(true);
      setSaved(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* appunti non disponibili */
    }
  };

  if (compact && (has === null || (has && !code))) return null;

  return (
    <section className={`flex flex-col gap-3 rounded-3xl p-4 ${compact ? "bg-white ring-2 ring-lemon" : "border border-gray-100 bg-white"}`}>
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-[#C9930A]" />
        <p className="text-sm font-bold text-ink">Codice di recupero</p>
      </div>

      {code ? (
        <>
          <p className="text-sm text-muted">
            Ti serve se dimentichi la password. <b className="text-ink">Lo vedi solo adesso</b>: copialo nelle note del telefono o fai uno screenshot.
          </p>
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-ground p-3">
            <span className="font-mono text-lg font-bold tracking-wider text-ink">{code}</span>
            <button type="button" onClick={copy} className="flex h-10 items-center gap-1.5 rounded-xl bg-ink px-3 text-sm font-bold text-white">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copiato" : "Copia"}
            </button>
          </div>
          {!saved ? (
            <button
              type="button"
              onClick={() => {
                setSaved(true);
                setCode(null);
                onCreated?.();
              }}
              className="h-11 rounded-2xl bg-emerald-600 text-sm font-bold text-white"
            >
              L'ho salvato
            </button>
          ) : null}
        </>
      ) : has ? (
        <>
          <p className="text-sm text-muted">Hai già un codice di recupero. Se l'hai perso, creane uno nuovo: quello vecchio smette di funzionare.</p>
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-ground text-sm font-bold text-ink"
          >
            {busy && <Loader2 size={16} className="animate-spin" />} Crea un nuovo codice
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            {compact
              ? "Proteggi il tuo account: senza questo codice, se dimentichi la password non potrai più rientrare."
              : "Non hai ancora un codice: senza, se dimentichi la password non potrai più rientrare."}
          </p>
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-lemon text-sm font-bold text-ink"
          >
            {busy && <Loader2 size={16} className="animate-spin" />} Crea il codice di recupero
          </button>
        </>
      )}
    </section>
  );
};
