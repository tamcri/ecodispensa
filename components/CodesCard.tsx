import React, { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, Gift, Share2, Ticket } from "lucide-react";
import { fetchMyInvite, inviteLink, MyInvite, redeemCode, redeemMessage } from "../services/codes";

/**
 * Profilo → "Ho un codice" e "Invita un amico".
 * onRedeemed: dopo un codice valido ricarico crediti e piano.
 */
export const CodesCard = ({ onRedeemed }: { onRedeemed?: () => void }) => {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [invite, setInvite] = useState<MyInvite | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchMyInvite().then(setInvite);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    const r = await redeemCode(code);
    setBusy(false);
    setMsg({ ok: r.ok, text: redeemMessage(r) });
    if (r.ok) {
      setCode("");
      onRedeemed?.();
      fetchMyInvite().then(setInvite);
    }
  };

  const shareText = invite
    ? `Uso EcoDispensa per non buttare il cibo: mi avvisa prima che scada e mi propone ricette con quello che ho. Iscriviti con il mio codice ${invite.code} e ricevi 2 crediti in regalo.`
    : "";

  const share = async () => {
    if (!invite) return;
    const url = inviteLink(invite.code);
    try {
      if (navigator.share) {
        await navigator.share({ title: "EcoDispensa", text: shareText, url });
        return;
      }
    } catch {
      return; // condivisione annullata
    }
    copy();
  };

  const copy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(`${shareText} ${inviteLink(invite.code)}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* appunti non disponibili */
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Ho un codice */}
      <form onSubmit={submit} className="rounded-2xl bg-white p-4">
        <div className="mb-2 flex items-center gap-2">
          <Ticket size={16} className="text-emerald-600" />
          <span className="text-sm font-bold text-ink">Ho un codice</span>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Codici regalo del tuo Comune o della tua azienda, di un creator o di un amico.
        </p>
        <div className="flex gap-2">
          <label htmlFor="redeem-code" className="sr-only">
            Codice
          </label>
          <input
            id="redeem-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Es. VARESE-7KQ2XM"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            className="h-12 min-w-0 flex-1 rounded-2xl bg-ground px-4 font-mono text-[15px] tracking-wider text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={!code.trim() || busy}
            className="h-12 shrink-0 rounded-2xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Attendi…" : "Usa"}
          </button>
        </div>
        {msg && (
          <p
            className={`mt-3 rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug ${
              msg.ok ? "bg-mint text-forest" : "bg-peach text-[#8E3418]"
            }`}
            role="status"
          >
            {msg.text}
          </p>
        )}
      </form>

      {/* Invita un amico */}
      <div className="rounded-2xl bg-white p-4">
        <div className="mb-2 flex items-center gap-2">
          <Gift size={16} className="text-emerald-600" />
          <span className="text-sm font-bold text-ink">Invita un amico</span>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Il tuo amico riceve <b className="text-ink">2 crediti</b> quando si iscrive con il tuo codice. Tu ne ricevi{" "}
          <b className="text-ink">2</b> quando ha messo almeno 5 prodotti in dispensa.
        </p>
        {invite ? (
          <>
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-honey px-4 py-3">
              <span className="font-mono text-lg font-bold tracking-wider text-ink">{invite.code}</span>
              <button
                type="button"
                onClick={copy}
                aria-label="Copia il messaggio di invito"
                className="flex h-9 items-center gap-1.5 rounded-xl bg-white/80 px-3 text-xs font-bold text-ink"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copiato" : "Copia"}
              </button>
            </div>
            <button
              type="button"
              onClick={share}
              className="mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-bold text-white"
            >
              <Share2 size={18} /> Invia l'invito
            </button>
            {invite.invited > 0 && (
              <p className="mt-2.5 text-center text-xs text-muted">
                {invite.invited === 1 ? "1 amico iscritto" : `${invite.invited} amici iscritti`} · {invite.rewarded}{" "}
                {invite.rewarded === 1 ? "premio ricevuto" : "premi ricevuti"}
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-xs text-muted">Preparo il tuo codice…</p>
        )}
      </div>
    </div>
  );
};
