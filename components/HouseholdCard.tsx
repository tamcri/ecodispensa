import React, { useEffect, useState } from "react";
import { Copy, Home, Loader2, RefreshCw, Share2, Users } from "lucide-react";
import {
  displayNameFromEmail,
  fetchHousehold,
  Household,
  joinHousehold,
  leaveHousehold,
  regenerateInviteCode,
} from "../services/household";

/** Sezione "Famiglia" del profilo: membri, codice invito, entra/esci. */
export const HouseholdCard = ({
  userEmail,
  onChanged,
}: {
  userEmail: string | null;
  onChanged?: () => void;
}) => {
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const load = async () => {
    setLoading(true);
    setHousehold(await fetchHousehold());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const shareText = household
    ? `Unisciti alla mia dispensa su EcoDispensa: apri l'app, vai su Profilo → Famiglia e inserisci il codice ${household.invite_code}`
    : "";

  const share = async () => {
    if (!household) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "EcoDispensa", text: shareText });
        return;
      }
    } catch {
      /* condivisione annullata */
    }
    try {
      await navigator.clipboard.writeText(household.invite_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* appunti non disponibili */
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setMessage(null);
    const err = await joinHousehold(code, displayNameFromEmail(userEmail));
    setBusy(false);
    if (err) {
      setMessage({ text: err, tone: "error" });
      return;
    }
    setCode("");
    setMessage({ text: "Fatto! Ora dispensa e lista della spesa sono condivise.", tone: "ok" });
    await load();
    onChanged?.();
  };

  const leave = async () => {
    setBusy(true);
    setMessage(null);
    const err = await leaveHousehold();
    setBusy(false);
    setConfirmLeave(false);
    if (err) {
      setMessage({ text: err, tone: "error" });
      return;
    }
    setMessage({ text: "Sei uscito dalla famiglia. I prodotti restano agli altri membri.", tone: "ok" });
    await load();
    onChanged?.();
  };

  const newCode = async () => {
    setBusy(true);
    const c = await regenerateInviteCode();
    setBusy(false);
    if (c && household) setHousehold({ ...household, invite_code: c });
  };

  const alone = (household?.members.length ?? 0) <= 1;

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users size={16} className="text-emerald-600" />
        <div className="text-sm font-bold text-ink">Famiglia</div>
      </div>

      {loading ? (
        <div className="py-4 text-center">
          <Loader2 className="mx-auto animate-spin text-emerald-600" size={22} />
        </div>
      ) : !household ? (
        <p className="text-sm text-muted">Non riesco a caricare la famiglia. Riprova più tardi.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            {alone
              ? "Condividi dispensa e lista della spesa con chi vive con te: così nessuno compra due volte la stessa cosa."
              : "Dispensa, lista della spesa e statistiche sono condivise con:"}
          </p>

          {!alone && (
            <ul className="flex flex-col gap-1.5">
              {household.members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-2 text-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest font-display text-sm font-extrabold text-honey">
                    {(m.display_name ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="font-semibold text-ink">{m.display_name ?? "Membro"}</span>
                  {m.role === "owner" && <Home size={14} className="text-muted" aria-label="Ha creato la famiglia" />}
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-2xl bg-ground p-3.5">
            <div className="mb-1 text-xs font-bold text-muted">Il tuo codice invito</div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-2xl font-extrabold tracking-[0.18em] text-ink">{household.invite_code}</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={newCode}
                  disabled={busy}
                  aria-label="Genera un nuovo codice"
                  title="Nuovo codice (quello vecchio smette di funzionare)"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-ink"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  type="button"
                  onClick={share}
                  className="flex h-10 items-center gap-1.5 rounded-xl bg-forest px-3 text-sm font-bold text-white"
                >
                  {copied ? <Copy size={16} /> : <Share2 size={16} />}
                  {copied ? "Copiato" : "Invita"}
                </button>
              </div>
            </div>
          </div>

          <form onSubmit={join} className="flex flex-col gap-2">
            <label htmlFor="household-code" className="text-xs font-bold text-muted">
              Hai ricevuto un codice? Entra nella sua famiglia
            </label>
            <div className="flex gap-2">
              <input
                id="household-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ES. 4F7A9C21"
                maxLength={8}
                autoCapitalize="characters"
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-xl bg-ground px-3 font-display text-lg font-bold tracking-[0.15em] text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={busy || code.trim().length < 6}
                className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : "Entra"}
              </button>
            </div>
            {alone && (
              <p className="text-xs text-muted">I prodotti che hai adesso verranno portati nella dispensa condivisa.</p>
            )}
          </form>

          {!alone &&
            (confirmLeave ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-[#F3D3D3] p-3">
                <p className="text-sm text-[#8A1F2B]">
                  Uscendo ripartirai con una dispensa vuota; i prodotti restano agli altri membri.
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirmLeave(false)} className="h-10 flex-1 rounded-xl bg-white text-sm font-bold text-ink">
                    Annulla
                  </button>
                  <button type="button" onClick={leave} disabled={busy} className="h-10 flex-1 rounded-xl bg-[#C23A4E] text-sm font-bold text-white">
                    Esci dalla famiglia
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmLeave(true)} className="self-start text-xs font-semibold text-muted underline underline-offset-2">
                Esci dalla famiglia
              </button>
            ))}

          {message && (
            <p className={`text-sm font-semibold ${message.tone === "ok" ? "text-emerald-700" : "text-[#8A1F2B]"}`}>{message.text}</p>
          )}
        </div>
      )}
    </div>
  );
};
