import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, Check, Copy, Download, Loader2, Plus, School, Trash2, Trophy } from "lucide-react";
import {
  PartnerRow,
  RankingRow,
  SchoolClassRow,
  createClassCodes,
  deleteSchoolItem,
  fetchClassCodes,
  fetchSchoolRanking,
  fetchSchoolTree,
  saveClass,
  savePartner,
  saveSchool,
} from "../services/schools";
import { downloadCsv } from "./AdminCodesPanel";
import { RankingList } from "./ClassRanking";

const field =
  "h-12 w-full rounded-2xl bg-ground px-4 text-[15px] text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-emerald-500";
const label = "mb-1.5 block text-xs font-bold text-muted";
const euro = (cents: number) => (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

const Box = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <section className="flex flex-col gap-3 rounded-[24px] bg-white p-4">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-display text-lg font-extrabold text-ink">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const SmallButton = ({ children, onClick, tone = "plain" }: { children: React.ReactNode; onClick: () => void; tone?: "plain" | "green" | "danger" }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold ${
      tone === "green" ? "bg-emerald-600 text-white" : tone === "danger" ? "bg-peach text-[#8E3418]" : "bg-ground text-ink"
    }`}
  >
    {children}
  </button>
);

/**
 * Progetto scuole: Partner (azienda o Comune) → Istituti → Classi → "Crea codici" (uno per alunno).
 * Si sceglie il partner, poi l'istituto, e compaiono le sue classi.
 */
export const AdminSchoolsPanel = () => {
  const [tree, setTree] = useState<PartnerRow[] | null>(null);
  const [partnerId, setPartnerId] = useState<string>("");
  const [schoolId, setSchoolId] = useState<string>("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // moduli "nuovo"
  const [newPartner, setNewPartner] = useState<{ name: string; kind: "azienda" | "comune"; price: string } | null>(null);
  const [newSchool, setNewSchool] = useState<{ name: string; city: string } | null>(null);
  const [newClass, setNewClass] = useState<{ name: string; students: string } | null>(null);

  const [codes, setCodes] = useState<{ cls: SchoolClassRow; list: Array<{ code: string; used: boolean }> } | null>(null);
  const [copied, setCopied] = useState(false);
  const [ranking, setRanking] = useState<{ period: "month" | "year"; rows: RankingRow[] } | null>(null);

  const load = async () => {
    const t = await fetchSchoolTree();
    setTree(t);
    return t;
  };

  useEffect(() => {
    load().then((t) => {
      if (t && t.length === 1) setPartnerId(t[0].id);
    });
  }, []);

  const partner = useMemo(() => tree?.find((p) => p.id === partnerId) ?? null, [tree, partnerId]);
  const school = useMemo(() => partner?.schools.find((s) => s.id === schoolId) ?? null, [partner, schoolId]);

  // istituto scelto da solo se ce n'è uno; azzerato se non appartiene al partner
  useEffect(() => {
    if (!partner) {
      if (schoolId) setSchoolId("");
      return;
    }
    if (!schoolId && partner.schools.length === 1) setSchoolId(partner.schools[0].id);
    else if (schoolId && !partner.schools.some((s) => s.id === schoolId)) setSchoolId("");
  }, [partnerId, tree]);

  // cambiando partner o istituto si chiudono codici e classifica aperti
  useEffect(() => {
    setCodes(null);
    setRanking(null);
  }, [partnerId, schoolId]);

  const partnerCodes = partner
    ? partner.schools.reduce((n, s) => n + s.classes.reduce((m, c) => m + c.codes, 0), 0)
    : 0;
  const partnerUsed = partner ? partner.schools.reduce((n, s) => n + s.classes.reduce((m, c) => m + c.used, 0), 0) : 0;

  const submitPartner = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPartner) return;
    const cents = Math.round(Number(newPartner.price.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setMsg({ ok: false, text: "Scrivi il prezzo per codice, per esempio 20." });
      return;
    }
    setBusy("partner");
    const r = await savePartner({ name: newPartner.name, kind: newPartner.kind, priceCents: cents });
    setBusy(null);
    if (r.error) return setMsg({ ok: false, text: r.error });
    setNewPartner(null);
    setMsg({ ok: true, text: `Partner "${newPartner.name.trim()}" creato.` });
    await load();
    setPartnerId(r.id!);
  };

  const submitSchool = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSchool || !partner) return;
    setBusy("school");
    const r = await saveSchool({ partnerId: partner.id, name: newSchool.name, city: newSchool.city });
    setBusy(null);
    if (r.error) return setMsg({ ok: false, text: r.error });
    setNewSchool(null);
    setMsg({ ok: true, text: `Istituto "${newSchool.name.trim()}" aggiunto a ${partner.name}.` });
    await load();
    setSchoolId(r.id!);
  };

  const submitClass = async (e: FormEvent) => {
    e.preventDefault();
    if (!newClass || !school) return;
    setBusy("class");
    const r = await saveClass({ schoolId: school.id, name: newClass.name, students: Number(newClass.students) });
    setBusy(null);
    if (r.error) return setMsg({ ok: false, text: r.error });
    setNewClass(null);
    setMsg({ ok: true, text: `Classe ${newClass.name.trim().toUpperCase()} aggiunta.` });
    await load();
  };

  const makeCodes = async (c: SchoolClassRow) => {
    setBusy(c.id);
    setMsg(null);
    const r = await createClassCodes(c.id);
    setBusy(null);
    if (r.error) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: `Creati ${r.created} codici per la classe ${c.name}: valgono 12 mesi di abbonamento.` });
    const t = await load();
    const updated = t?.flatMap((p) => p.schools).flatMap((s) => s.classes).find((x) => x.id === c.id) ?? c;
    showCodes(updated);
  };

  const showCodes = async (c: SchoolClassRow) => {
    setCopied(false);
    setRanking(null);
    setCodes({ cls: c, list: await fetchClassCodes(c.id) });
  };

  const remove = async (kind: "partner" | "school" | "class", id: string, name: string) => {
    setMsg(null);
    const err = await deleteSchoolItem(kind, id);
    if (err) return setMsg({ ok: false, text: err });
    setMsg({ ok: true, text: `${name} eliminato.` });
    if (kind === "partner") setPartnerId("");
    if (kind === "school") setSchoolId("");
    await load();
  };

  const openRanking = async (period: "month" | "year") => {
    if (!school) return;
    setCodes(null);
    setRanking({ period, rows: await fetchSchoolRanking(school.id, period) });
  };

  const copyCodes = async () => {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes.list.map((c) => c.code).join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (!tree) return <Loader2 size={22} className="mx-auto mt-6 animate-spin text-muted" />;

  return (
    <div className="flex flex-col gap-4">
      {msg && (
        <p role="status" className={`rounded-2xl px-4 py-3 text-sm font-semibold ${msg.ok ? "bg-mint text-forest" : "bg-peach text-[#8E3418]"}`}>
          {msg.text}
        </p>
      )}

      {/* 1. Partner */}
      <Box
        title="1. Partner"
        action={
          !newPartner && (
            <SmallButton onClick={() => setNewPartner({ name: "", kind: "azienda", price: "20" })}>
              <Plus size={14} /> Nuovo
            </SmallButton>
          )
        }
      >
        <p className="text-[13px] text-muted">L'azienda o il Comune che offre i codici alle famiglie e li paga.</p>
        {newPartner && (
          <form onSubmit={submitPartner} className="flex flex-col gap-3 rounded-2xl bg-ground p-3">
            <div>
              <label htmlFor="np-name" className={label}>
                Nome
              </label>
              <input
                id="np-name"
                className={field + " bg-white"}
                value={newPartner.name}
                onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })}
                placeholder="Es. Comune di Fondi, Pinkopallo"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="np-kind" className={label}>
                  Tipo
                </label>
                <select
                  id="np-kind"
                  className={field + " bg-white"}
                  value={newPartner.kind}
                  onChange={(e) => setNewPartner({ ...newPartner, kind: e.target.value as "azienda" | "comune" })}
                >
                  <option value="azienda">Azienda</option>
                  <option value="comune">Comune</option>
                </select>
              </div>
              <div>
                <label htmlFor="np-price" className={label}>
                  Prezzo per codice (€)
                </label>
                <input
                  id="np-price"
                  className={field + " bg-white"}
                  inputMode="decimal"
                  value={newPartner.price}
                  onChange={(e) => setNewPartner({ ...newPartner, price: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy === "partner"} className="h-11 flex-1 rounded-2xl bg-emerald-600 text-sm font-bold text-white">
                Crea partner
              </button>
              <button type="button" onClick={() => setNewPartner(null)} className="h-11 rounded-2xl bg-white px-4 text-sm font-bold text-ink">
                Annulla
              </button>
            </div>
          </form>
        )}

        {tree.length === 0 ? (
          !newPartner && <p className="text-sm text-muted">Nessun partner ancora: crea il primo.</p>
        ) : (
          <div>
            <label htmlFor="sel-partner" className={label}>
              Scegli il partner
            </label>
            <select id="sel-partner" className={field} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">— Scegli —</option>
              {tree.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.kind === "comune" ? "Comune" : "Azienda"})
                </option>
              ))}
            </select>
          </div>
        )}

        {partner && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-ground p-2.5">
              <p className="font-display text-xl font-extrabold text-ink">{partnerCodes}</p>
              <p className="text-[11px] text-muted">codici creati</p>
            </div>
            <div className="rounded-2xl bg-ground p-2.5">
              <p className="font-display text-xl font-extrabold text-forest">{partnerUsed}</p>
              <p className="text-[11px] text-muted">attivati</p>
            </div>
            <div className="rounded-2xl bg-ground p-2.5">
              <p className="font-display text-xl font-extrabold text-ink">{euro(partnerCodes * partner.price_cents)}</p>
              <p className="text-[11px] text-muted">da fatturare ({euro(partner.price_cents)} l'uno)</p>
            </div>
          </div>
        )}
        {partner && partner.schools.length === 0 && (
          <div className="flex justify-end">
            <SmallButton tone="danger" onClick={() => remove("partner", partner.id, partner.name)}>
              <Trash2 size={14} /> Elimina partner
            </SmallButton>
          </div>
        )}
      </Box>

      {/* 2. Istituto */}
      {partner && (
        <Box
          title="2. Istituto"
          action={
            !newSchool && (
              <SmallButton onClick={() => setNewSchool({ name: "", city: "" })}>
                <Plus size={14} /> Nuovo
              </SmallButton>
            )
          }
        >
          {newSchool && (
            <form onSubmit={submitSchool} className="flex flex-col gap-3 rounded-2xl bg-ground p-3">
              <div>
                <label htmlFor="ns-name" className={label}>
                  Nome dell'istituto
                </label>
                <input
                  id="ns-name"
                  className={field + " bg-white"}
                  value={newSchool.name}
                  onChange={(e) => setNewSchool({ ...newSchool, name: e.target.value })}
                  placeholder="Es. Istituto Pacinotti"
                  required
                />
              </div>
              <div>
                <label htmlFor="ns-city" className={label}>
                  Comune
                </label>
                <input
                  id="ns-city"
                  className={field + " bg-white"}
                  value={newSchool.city}
                  onChange={(e) => setNewSchool({ ...newSchool, city: e.target.value })}
                  placeholder="Es. Fondi"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={busy === "school"} className="h-11 flex-1 rounded-2xl bg-emerald-600 text-sm font-bold text-white">
                  Aggiungi istituto
                </button>
                <button type="button" onClick={() => setNewSchool(null)} className="h-11 rounded-2xl bg-white px-4 text-sm font-bold text-ink">
                  Annulla
                </button>
              </div>
            </form>
          )}

          {partner.schools.length === 0 ? (
            !newSchool && <p className="text-sm text-muted">Nessun istituto per {partner.name}: aggiungi il primo.</p>
          ) : (
            <div>
              <label htmlFor="sel-school" className={label}>
                Istituti di {partner.name}
              </label>
              <select id="sel-school" className={field} value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                <option value="">— Scegli —</option>
                {partner.schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.city ? ` – ${s.city}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Box>
      )}

      {/* 3. Classi */}
      {school && (
        <Box
          title="3. Classi"
          action={
            !newClass && (
              <SmallButton onClick={() => setNewClass({ name: "", students: "" })}>
                <Plus size={14} /> Classe
              </SmallButton>
            )
          }
        >
          <p className="flex items-center gap-1.5 text-[13px] text-muted">
            <School size={15} /> {school.name}
            {school.city ? ` – ${school.city}` : ""}
          </p>

          {newClass && (
            <form onSubmit={submitClass} className="flex flex-col gap-3 rounded-2xl bg-ground p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="nc-name" className={label}>
                    Classe
                  </label>
                  <input
                    id="nc-name"
                    className={field + " bg-white"}
                    value={newClass.name}
                    onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                    placeholder="Es. 1A"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="nc-students" className={label}>
                    Numero alunni
                  </label>
                  <input
                    id="nc-students"
                    className={field + " bg-white"}
                    inputMode="numeric"
                    value={newClass.students}
                    onChange={(e) => setNewClass({ ...newClass, students: e.target.value.replace(/\D/g, "") })}
                    placeholder="Es. 15"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={busy === "class"} className="h-11 flex-1 rounded-2xl bg-emerald-600 text-sm font-bold text-white">
                  Aggiungi classe
                </button>
                <button type="button" onClick={() => setNewClass(null)} className="h-11 rounded-2xl bg-white px-4 text-sm font-bold text-ink">
                  Annulla
                </button>
              </div>
            </form>
          )}

          {school.classes.length === 0 ? (
            !newClass && <p className="text-sm text-muted">Nessuna classe: aggiungi la prima con il numero di alunni.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {school.classes.map((c) => {
                const missing = c.students - c.codes;
                return (
                  <div key={c.id} className="flex flex-col gap-2 rounded-2xl bg-ground p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block font-bold text-ink">
                          Classe {c.name} · {c.students} alunni
                        </span>
                        <span className="block text-xs text-muted">
                          {c.codes === 0 ? "Nessun codice" : `${c.codes} codici · ${c.used} attivati · ${c.families} famiglie`}
                        </span>
                      </span>
                      {missing > 0 ? (
                        <SmallButton tone="green" onClick={() => makeCodes(c)}>
                          {busy === c.id ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                          {c.codes === 0 ? "Crea codici" : `Crea altri ${missing}`}
                        </SmallButton>
                      ) : (
                        <SmallButton onClick={() => showCodes(c)}>Vedi codici</SmallButton>
                      )}
                    </div>
                    {c.codes > 0 && missing > 0 && (
                      <button type="button" onClick={() => showCodes(c)} className="self-start text-xs font-bold text-emerald-700">
                        Vedi i {c.codes} codici già creati
                      </button>
                    )}
                    {c.codes === 0 && (
                      <button
                        type="button"
                        onClick={() => remove("class", c.id, `Classe ${c.name}`)}
                        className="flex items-center gap-1 self-start text-xs font-bold text-[#8E3418]"
                      >
                        <Trash2 size={13} /> Elimina classe
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {school.classes.length > 0 && (
            <div className="flex gap-2">
              <SmallButton onClick={() => openRanking("month")}>
                <Trophy size={14} /> Classifica del mese
              </SmallButton>
              <SmallButton onClick={() => openRanking("year")}>
                <Trophy size={14} /> Anno scolastico
              </SmallButton>
            </div>
          )}
          {school.classes.length === 0 && !newClass && (
            <div className="flex justify-end">
              <SmallButton tone="danger" onClick={() => remove("school", school.id, school.name)}>
                <Trash2 size={14} /> Elimina istituto
              </SmallButton>
            </div>
          )}
        </Box>
      )}

      {codes && (
        <Box title={`Codici della classe ${codes.cls.name}`}>
          <p className="text-[13px] text-muted">
            Uno per alunno: la scuola li consegna alle famiglie. Chi lo attiva ha 12 mesi di abbonamento, offerti da{" "}
            {partner?.name}, ed entra nella classifica della classe.
          </p>
          <div className="flex gap-2">
            <SmallButton onClick={copyCodes}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiati" : "Copia tutti"}
            </SmallButton>
            <SmallButton
              onClick={() => downloadCsv(`${school?.name ?? "scuola"}-${codes.cls.name}`, codes.list)}
            >
              <Download size={14} /> Scarica elenco
            </SmallButton>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {codes.list.map((c) => (
              <span
                key={c.code}
                className={`rounded-xl px-2.5 py-2 text-center font-mono text-[13px] ${c.used ? "bg-mint text-forest line-through" : "bg-ground text-ink"}`}
              >
                {c.code}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted">I codici barrati sono già stati attivati.</p>
        </Box>
      )}

      {ranking && school && (
        <Box title={ranking.period === "month" ? "Classifica del mese" : "Classifica dell'anno scolastico"}>
          <p className="flex items-center gap-1.5 text-[13px] text-muted">
            <Building2 size={15} /> {school.name} · le famiglie vedono questa stessa classifica
          </p>
          <RankingList rows={ranking.rows} />
        </Box>
      )}
    </div>
  );
};
