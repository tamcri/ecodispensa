import React, { useEffect, useState, type FormEvent } from "react";
import { Check, ChevronLeft, Copy, Download, Loader2 } from "lucide-react";
import {
  BatchRow,
  CodesOverview,
  createActivationCodes,
  createCreatorCode,
  fetchBatchCodes,
  fetchCodesOverview,
  setBatchActive,
  setCodeActive,
} from "../services/codes";

const field =
  "h-12 w-full rounded-2xl bg-ground px-4 text-[15px] text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-emerald-500";
const label = "mb-1.5 block text-xs font-bold text-muted";
const dateIt = (iso: string) => new Date(iso).toLocaleDateString("it-IT");

/** Scarica un elenco di codici come file CSV (si apre con Excel o Fogli Google) */
function downloadCsv(name: string, codes: Array<{ code: string; used?: boolean }>) {
  const rows = ["codice;usato", ...codes.map((c) => `${c.code};${c.used ? "sì" : "no"}`)];
  const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "codici"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Area riservata: crea codici per Comuni, aziende e creator e controlla quanti sono stati usati */
export const AdminCodesPanel = ({ onClose, embedded = false }: { onClose?: () => void; embedded?: boolean }) => {
  const [data, setData] = useState<CodesOverview | null>(null);
  const [loading, setLoading] = useState(true);

  // codici di attivazione
  const [aLabel, setALabel] = useState("");
  const [aPrefix, setAPrefix] = useState("");
  const [aCount, setACount] = useState(100);
  const [aMonths, setAMonths] = useState(12);
  const [aBusy, setABusy] = useState(false);
  const [aMsg, setAMsg] = useState<string | null>(null);
  const [created, setCreated] = useState<{ label: string; codes: string[] } | null>(null);

  // codici creator
  const [cCode, setCCode] = useState("");
  const [cLabel, setCLabel] = useState("");
  const [cBonus, setCBonus] = useState(10);
  const [cBusy, setCBusy] = useState(false);
  const [cMsg, setCMsg] = useState<string | null>(null);

  const [openBatch, setOpenBatch] = useState<{ batch: BatchRow; codes: Array<{ code: string; used: boolean }> } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setData(await fetchCodesOverview());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const createBatch = async (e: FormEvent) => {
    e.preventDefault();
    if (aBusy) return;
    setABusy(true);
    setAMsg(null);
    const r = await createActivationCodes(aLabel, aPrefix, aCount, aMonths);
    setABusy(false);
    if (r.error) {
      setAMsg(r.error);
      return;
    }
    setCreated({ label: aLabel || aPrefix, codes: r.codes ?? [] });
    setALabel("");
    setAPrefix("");
    load();
  };

  const createCreator = async (e: FormEvent) => {
    e.preventDefault();
    if (cBusy) return;
    setCBusy(true);
    setCMsg(null);
    const r = await createCreatorCode(cCode, cLabel, cBonus);
    setCBusy(false);
    if (r.error) {
      setCMsg(r.error);
      return;
    }
    setCMsg(`Codice ${r.code} creato.`);
    setCCode("");
    setCLabel("");
    load();
  };

  const copyCodes = async (codes: string[]) => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* appunti non disponibili */
    }
  };

  const showBatch = async (batch: BatchRow) => {
    setOpenBatch({ batch, codes: await fetchBatchCodes(batch.batch_id) });
  };

  return (
    <div className={embedded ? "" : "fixed inset-0 z-[60] overflow-y-auto bg-ground"}>
      <div className={embedded ? "flex flex-col gap-4" : "mx-auto flex max-w-md flex-col gap-4 px-5 pb-16 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))]"}>
        {!embedded && (
          <>
            <div className="flex items-center justify-between">
              <button type="button" onClick={onClose} className="flex h-11 items-center gap-1 pr-3 text-sm font-bold text-ink">
                <ChevronLeft size={20} /> Profilo
              </button>
              <span className="rounded-full bg-forest px-3 py-1 text-xs font-bold text-white">Area riservata</span>
            </div>
            <div>
              <h1 className="font-display text-[30px] font-extrabold leading-tight tracking-tight text-ink">Codici</h1>
              <p className="text-[13px] text-muted">Visibile solo a te. Crea i codici per accordi e creator e guarda quanti li usano.</p>
            </div>
          </>
        )}

        {/* ---------- Comuni e aziende ---------- */}
        <section className="flex flex-col gap-3 rounded-[24px] bg-white p-4">
          <h2 className="font-display text-lg font-extrabold text-ink">Codici per Comuni e aziende</h2>
          <p className="text-xs leading-relaxed text-muted">
            Ogni codice si usa una volta sola e dà l'abbonamento con 25 crediti al mese per la durata scelta. Nessuna carta e
            nessun rinnovo automatico.
          </p>
          <form onSubmit={createBatch} className="flex flex-col gap-3">
            <div>
              <label className={label} htmlFor="a-label">Nome dell'accordo</label>
              <input id="a-label" className={field} value={aLabel} onChange={(e) => setALabel(e.target.value)} placeholder="Es. Comune di Varese" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3">
                <label className={label} htmlFor="a-prefix">Inizio del codice</label>
                <input
                  id="a-prefix"
                  className={`${field} font-mono uppercase`}
                  value={aPrefix}
                  onChange={(e) => setAPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
                  placeholder="Es. VARESE → VARESE-7KQ2XM"
                />
              </div>
              <div className="col-span-2">
                <label className={label} htmlFor="a-count">Quanti codici</label>
                <input id="a-count" type="number" min={1} max={2000} className={field} value={aCount} onChange={(e) => setACount(Number(e.target.value))} />
              </div>
              <div>
                <label className={label} htmlFor="a-months">Mesi</label>
                <input id="a-months" type="number" min={1} max={24} className={field} value={aMonths} onChange={(e) => setAMonths(Number(e.target.value))} />
              </div>
            </div>
            <button type="submit" disabled={aBusy || !aPrefix} className="h-12 rounded-2xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50">
              {aBusy ? "Creo i codici…" : `Crea ${aCount || 0} codici`}
            </button>
            {aMsg && <p className="rounded-2xl bg-peach px-3.5 py-2.5 text-[13px] text-[#8E3418]">{aMsg}</p>}
          </form>

          {created && (
            <div className="flex flex-col gap-2 rounded-2xl bg-mint p-3.5">
              <p className="text-sm font-bold text-forest">
                {created.codes.length} codici creati per {created.label}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => copyCodes(created.codes)} className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white text-xs font-bold text-ink">
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiati" : "Copia tutti"}
                </button>
                <button
                  type="button"
                  onClick={() => downloadCsv(created.label, created.codes.map((c) => ({ code: c })))}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white text-xs font-bold text-ink"
                >
                  <Download size={14} /> Scarica elenco
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <Loader2 size={20} className="mx-auto animate-spin text-muted" />
          ) : (
            (data?.batches ?? []).map((b) => (
              <div key={b.batch_id} className="flex flex-col gap-2 rounded-2xl bg-ground p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-bold text-ink">{b.label}</span>
                  <span className="shrink-0 text-xs text-muted">{dateIt(b.created_at)}</span>
                </div>
                <p className="text-xs text-muted">
                  {b.used} usati su {b.total} · {b.months} mesi{b.active ? "" : " · disattivati"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => showBatch(b)} className="h-9 rounded-xl bg-white text-xs font-bold text-ink">
                    Vedi codici
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await setBatchActive(b.batch_id, !b.active);
                      load();
                    }}
                    className="h-9 rounded-xl bg-white text-xs font-bold text-[#8E3418]"
                  >
                    {b.active ? "Disattiva" : "Riattiva"}
                  </button>
                </div>
              </div>
            ))
          )}
        </section>

        {/* ---------- Creator ---------- */}
        <section className="flex flex-col gap-3 rounded-[24px] bg-white p-4">
          <h2 className="font-display text-lg font-extrabold text-ink">Codici dei creator</h2>
          <p className="text-xs leading-relaxed text-muted">
            Chi si iscrive con il codice riceve i crediti in regalo (solo account nuovi, una volta). Qui vedi quanti iscritti e
            abbonati porta ogni creator.
          </p>
          <form onSubmit={createCreator} className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className={label} htmlFor="c-code">Codice</label>
                <input
                  id="c-code"
                  className={`${field} font-mono uppercase`}
                  value={cCode}
                  onChange={(e) => setCCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32))}
                  placeholder="GIULIA10"
                />
              </div>
              <div>
                <label className={label} htmlFor="c-bonus">Crediti</label>
                <input id="c-bonus" type="number" min={1} max={100} className={field} value={cBonus} onChange={(e) => setCBonus(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="c-label">Nome del creator</label>
              <input id="c-label" className={field} value={cLabel} onChange={(e) => setCLabel(e.target.value)} placeholder="Es. Giulia – Cucina di casa" />
            </div>
            <button type="submit" disabled={cBusy || cCode.length < 4} className="h-12 rounded-2xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50">
              {cBusy ? "Attendi…" : "Crea codice creator"}
            </button>
            {cMsg && <p className="rounded-2xl bg-ground px-3.5 py-2.5 text-[13px] text-ink">{cMsg}</p>}
          </form>

          {(data?.creators ?? []).map((c) => (
            <div key={c.code} className="flex items-center gap-3 rounded-2xl bg-ground p-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono font-bold text-ink">{c.code}</p>
                <p className="truncate text-xs text-muted">
                  {c.label} · {c.bonus} crediti{c.active ? "" : " · disattivato"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-ink">{c.signups} iscritti</p>
                <p className="text-xs text-muted">{c.subscribers} abbonati</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await setCodeActive(c.code, !c.active);
                  load();
                }}
                className="h-9 shrink-0 rounded-xl bg-white px-2.5 text-xs font-bold text-[#8E3418]"
              >
                {c.active ? "Ferma" : "Riattiva"}
              </button>
            </div>
          ))}
        </section>

        {/* ---------- Inviti ---------- */}
        <section className="flex items-center justify-between rounded-[24px] bg-white p-4">
          <div>
            <h2 className="font-display text-lg font-extrabold text-ink">Inviti tra amici</h2>
            <p className="text-xs text-muted">Premio a chi invita dopo 5 prodotti in dispensa</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-ink">{data?.invites.total ?? 0} iscritti</p>
            <p className="text-xs text-muted">{data?.invites.rewarded ?? 0} premiati</p>
          </div>
        </section>
      </div>

      {openBatch && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40" onClick={() => setOpenBatch(null)}>
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col gap-3 rounded-t-[28px] bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-ink">{openBatch.batch.label}</h3>
              <button type="button" onClick={() => setOpenBatch(null)} className="h-10 rounded-xl bg-ground px-3 text-sm font-bold text-ink">
                Chiudi
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => copyCodes(openBatch.codes.filter((c) => !c.used).map((c) => c.code))}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-ground text-xs font-bold text-ink"
              >
                <Copy size={14} /> Copia i non usati
              </button>
              <button
                type="button"
                onClick={() => downloadCsv(openBatch.batch.label, openBatch.codes)}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-ground text-xs font-bold text-ink"
              >
                <Download size={14} /> Scarica elenco
              </button>
            </div>
            <div className="flex-1 overflow-y-auto rounded-2xl bg-ground p-3 font-mono text-sm">
              {openBatch.codes.map((c) => (
                <div key={c.code} className="flex justify-between py-1">
                  <span className={c.used ? "text-muted line-through" : "text-ink"}>{c.code}</span>
                  <span className="text-xs text-muted">{c.used ? "usato" : ""}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
