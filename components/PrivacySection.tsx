import React, { useState } from "react";
import { ChevronDown, Loader2, Trash2 } from "lucide-react";
import { deleteMyAccount } from "../services/account";

const DATA_WE_KEEP: Array<[string, string]> = [
  ["Account", "Username e password (cifrata). Nessuna email, nessun nome reale."],
  ["Dispensa e spesa", "I prodotti, le quantità, le scadenze e la lista della spesa della tua casa."],
  ["Ricette", "Le ricette salvate, i voti e le foto dei piatti che carichi tu."],
  ["Casa condivisa", "Con chi condividi dispensa e spesa (solo se inviti qualcuno)."],
  ["Crediti", "Il saldo crediti EcoChef e lo storico di utilizzo."],
  ["Notifiche", "Il collegamento al telefono per gli avvisi di scadenza, se li attivi."],
];

export const PrivacySection = () => {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    const err = await deleteMyAccount();
    setBusy(false);
    if (err) setError(err);
    else window.location.replace("/");
  };

  return (
    <div className="flex flex-col gap-3 text-sm text-muted">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center justify-between text-left font-semibold text-ink">
        Quali dati salviamo
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="flex flex-col gap-2">
          {DATA_WE_KEEP.map(([title, text]) => (
            <p key={title}>
              <b className="text-ink">{title}:</b> {text}
            </p>
          ))}
          <p>
            I dati sono conservati su Supabase (server in Europa) e servono solo a far funzionare l'app: non li vendiamo e non facciamo
            pubblicità. Per creare le ricette, a EcoChef inviamo solo i nomi dei prodotti, mai il tuo username.
          </p>
          <p>Le ricette che condividi con un link sono visibili a chi riceve il link.</p>
        </div>
      )}

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white font-bold text-red-600"
        >
          <Trash2 size={16} /> Elimina il mio account
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="font-bold text-red-700">Sei sicuro? Non si può annullare.</p>
          <p className="text-red-700">
            Cancelliamo account, dispensa, spesa, ricette, foto e crediti rimasti. Se condividi la casa con altri, loro mantengono la
            dispensa comune.
          </p>
          <label htmlFor="delete-confirm" className="text-xs font-bold text-red-700">
            Scrivi ELIMINA per confermare
          </label>
          <input
            id="delete-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            className="h-11 rounded-xl bg-white px-3 text-ink outline-none ring-1 ring-red-200 focus:ring-2 focus:ring-red-400"
            autoCapitalize="characters"
            autoCorrect="off"
          />
          {error && <p className="font-semibold text-red-700">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setTyped("");
                setError(null);
              }}
              className="h-11 rounded-xl bg-white font-bold text-ink"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={typed.trim() !== "ELIMINA" || busy}
              onClick={remove}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 font-bold text-white disabled:opacity-50"
            >
              {busy && <Loader2 size={16} className="animate-spin" />} Elimina
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
