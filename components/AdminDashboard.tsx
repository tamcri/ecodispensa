import React, { useEffect, useState } from "react";
import { ChevronLeft, Gift, LogOut, Loader2, RefreshCw, Search } from "lucide-react";
import {
  AdminDashboard as Dash,
  AdminSubs,
  AdminUser,
  fetchAdminDashboard,
  fetchAdminSubscriptions,
  fetchAdminUsers,
  giftCredits,
} from "../services/codes";
import { AdminCodesPanel } from "./AdminCodesPanel";

type Tab = "overview" | "subs" | "users" | "codes";

const euro = (n: number) => Number(n || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dateIt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("it-IT") : "—");
const pct = (a: number, b: number) => (a + b > 0 ? Math.round((a / (a + b)) * 100) : null);

const PLAN_CHIP: Record<AdminUser["plan"], string> = {
  gratis: "bg-stone text-[#5A5246]",
  mensile: "bg-mint text-forest",
  annuale: "bg-forest text-white",
  codice: "bg-honey text-[#6E5208]",
};

/** Un numero grande con la sua etichetta */
const Stat = ({ value, label, strong = false }: { value: React.ReactNode; label: string; strong?: boolean }) => (
  <div className="flex flex-col gap-0.5 rounded-2xl bg-ground p-3">
    <span className={`font-display text-[24px] font-extrabold leading-none ${strong ? "text-forest" : "text-ink"}`}>{value}</span>
    <span className="text-xs text-muted">{label}</span>
  </div>
);

const Card = ({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) => (
  <section className="flex flex-col gap-3 rounded-[24px] bg-white p-4">
    <h2 className="font-display text-lg font-extrabold text-ink">{title}</h2>
    {children}
    {note && <p className="text-[11px] leading-snug text-muted">{note}</p>}
  </section>
);

/** Area riservata dell'amministratore: numeri dell'app, elenco iscritti e codici */
export const AdminDashboard = ({
  onClose,
  onLogout,
  standalone = false,
}: {
  onClose?: () => void;
  onLogout?: () => void;
  /** Account amministratore: la dashboard è tutta l'app */
  standalone?: boolean;
}) => {
  const [tab, setTab] = useState<Tab>("overview");
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [subs, setSubs] = useState<AdminSubs | null>(null);
  const [giftFor, setGiftFor] = useState<string | null>(null);
  const [giftAmount, setGiftAmount] = useState(5);
  const [giftMsg, setGiftMsg] = useState<string | null>(null);

  useEffect(() => {
    if (tab === "subs") fetchAdminSubscriptions().then(setSubs);
  }, [tab]);

  const sendGift = async (username: string) => {
    setGiftMsg(null);
    const r = await giftCredits(username, giftAmount);
    if (r.error) {
      setGiftMsg(r.error);
      return;
    }
    setGiftMsg(`Regalati ${giftAmount} crediti a ${username}: ora ne ha ${r.credits}.`);
    setGiftFor(null);
    fetchAdminUsers(search).then(setUsers);
  };

  const loadDash = async () => {
    setLoading(true);
    setDash(await fetchAdminDashboard());
    setLoading(false);
  };

  useEffect(() => {
    loadDash();
  }, []);

  useEffect(() => {
    if (tab !== "users") return;
    const t = window.setTimeout(() => fetchAdminUsers(search).then(setUsers), 250);
    return () => window.clearTimeout(t);
  }, [tab, search]);

  const maxDay = Math.max(1, ...(dash?.users.by_day ?? []).map((d) => d.n));
  const savedPct = dash ? pct(dash.waste.used_30d, dash.waste.wasted_30d) : null;

  return (
    <div className={standalone ? "min-h-screen bg-ground" : "fixed inset-0 z-[60] overflow-y-auto bg-ground"}>
      <div className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-16 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))]">
        <div className="flex items-center justify-between">
          {standalone ? (
            <span className="flex items-center gap-2">
              <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-xl" />
              <span className="font-display text-lg font-extrabold text-ink">EcoDispensa</span>
            </span>
          ) : (
            <button type="button" onClick={onClose} className="flex h-11 items-center gap-1 pr-3 text-sm font-bold text-ink">
              <ChevronLeft size={20} /> Profilo
            </button>
          )}
          {standalone ? (
            <button
              type="button"
              onClick={onLogout}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-bold text-[#8E3418]"
            >
              <LogOut size={16} /> Esci
            </button>
          ) : (
            <span className="rounded-full bg-forest px-3 py-1 text-xs font-bold text-white">Area riservata</span>
          )}
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[30px] font-extrabold leading-tight tracking-tight text-ink">Dashboard</h1>
            <p className="text-[13px] text-muted">Account amministratore: qui hai il controllo di tutta l'app.</p>
          </div>
          {tab === "overview" && (
            <button
              type="button"
              onClick={loadDash}
              aria-label="Aggiorna i numeri"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink"
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
          )}
        </div>

        <div role="tablist" aria-label="Sezioni" className="grid grid-cols-4 gap-1 rounded-2xl bg-stone p-1">
          {(
            [
              ["overview", "Panoramica"],
              ["subs", "Abbonati"],
              ["users", "Iscritti"],
              ["codes", "Codici"],
            ] as Array<[Tab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`h-10 rounded-xl text-[12px] ${tab === id ? "bg-white font-extrabold text-ink shadow-sm" : "font-semibold text-[#4A5448]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" &&
          (loading && !dash ? (
            <Loader2 size={22} className="mx-auto mt-6 animate-spin text-muted" />
          ) : !dash ? (
            <p className="rounded-2xl bg-peach p-4 text-sm text-[#8E3418]">Non riesco a caricare i numeri. Riprova.</p>
          ) : (
            <>
              <Card title="Iscritti">
                <div className="grid grid-cols-3 gap-2">
                  <Stat value={dash.users.total} label="in totale" strong />
                  <Stat value={`+${dash.users.new_7d}`} label="ultimi 7 giorni" />
                  <Stat value={`+${dash.users.new_30d}`} label="ultimi 30 giorni" />
                </div>
                <div>
                  <div className="flex h-16 items-end gap-[3px]" aria-label="Nuovi iscritti negli ultimi 30 giorni">
                    {dash.users.by_day.map((d) => (
                      <div
                        key={d.day}
                        title={`${dateIt(d.day)}: ${d.n}`}
                        className={`flex-1 rounded-t ${d.n > 0 ? "bg-emerald-500" : "bg-stone"}`}
                        style={{ height: `${Math.max(6, (d.n / maxDay) * 100)}%` }}
                      />
                    ))}
                  </div>
                  <p className="mt-1 flex justify-between text-[11px] text-muted">
                    <span>30 giorni fa</span>
                    <span>oggi</span>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat value={dash.users.active_7d} label="entrati negli ultimi 7 giorni" />
                  <Stat value={dash.users.active_30d} label="entrati negli ultimi 30 giorni" />
                </div>
              </Card>

              <Card title="Abbonati" note="Con codice = abbonamenti regalati da Comuni, aziende o altri accordi.">
                <div className="grid grid-cols-3 gap-2">
                  <Stat value={dash.plans.monthly} label="mensili" strong />
                  <Stat value={dash.plans.yearly} label="annuali" strong />
                  <Stat value={dash.plans.gift} label="con codice" />
                </div>
                {dash.plans.cancelling > 0 && (
                  <p className="rounded-2xl bg-peach px-3.5 py-2.5 text-[13px] text-[#8E3418]">
                    {dash.plans.cancelling === 1 ? "1 abbonamento disdetto" : `${dash.plans.cancelling} abbonamenti disdetti`}: restano
                    attivi fino alla scadenza, poi non si rinnovano.
                  </p>
                )}
              </Card>

              <Card title="Incassi" note="Importi IVA inclusa, prima delle commissioni Stripe. Finché Stripe è in modalità prova sono pagamenti di test.">
                <div className="grid grid-cols-3 gap-2">
                  <Stat value={euro(dash.revenue.this_month)} label="questo mese" strong />
                  <Stat value={euro(dash.revenue.last_30d)} label="ultimi 30 giorni" />
                  <Stat value={euro(dash.revenue.total)} label="in totale" />
                </div>
                <p className="text-xs text-muted">
                  {dash.revenue.payments_30d} pagamenti negli ultimi 30 giorni, di cui {dash.revenue.topups_30d} ricariche.
                </p>
              </Card>

              <Card title="EcoChef · ultimi 30 giorni">
                <div className="grid grid-cols-3 gap-2">
                  <Stat value={dash.usage.recipes_30d} label="richieste di ricette" />
                  <Stat value={dash.usage.menus_30d} label="menu settimanali" />
                  <Stat value={dash.usage.credits_30d} label="crediti usati" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat value={dash.usage.saved_recipes} label="ricette salvate" />
                  <Stat value={dash.usage.cooked_recipes} label="cucinate" strong />
                  <Stat value={dash.usage.recipe_photos} label="con la foto" />
                </div>
              </Card>

              <Card title="Spreco · ultimi 30 giorni" note="Dai prodotti tolti dalla dispensa: «L'ho usato» o «L'ho buttato».">
                <div className="grid grid-cols-3 gap-2">
                  <Stat value={savedPct === null ? "–" : `${savedPct}%`} label="salvato" strong />
                  <Stat value={dash.waste.used_30d} label="prodotti usati" />
                  <Stat value={dash.waste.wasted_30d} label="buttati" />
                </div>
                {dash.waste.top_wasted.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-bold text-muted">I più buttati (ultimi 90 giorni)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {dash.waste.top_wasted.map((w) => (
                        <span key={w.name} className="rounded-full bg-peach px-2.5 py-1 text-xs font-bold text-[#8E3418]">
                          {w.name} · {w.n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted">{dash.waste.pantry_items} prodotti nelle dispense in questo momento.</p>
              </Card>

              <Card title="Famiglie e avvisi">
                <div className="grid grid-cols-3 gap-2">
                  <Stat value={dash.households.total} label="dispense" />
                  <Stat value={dash.households.shared} label="condivise in famiglia" />
                  <Stat value={dash.push} label="con avvisi attivi" />
                </div>
              </Card>
            </>
          ))}

        {tab === "subs" &&
          (!subs ? (
            <Loader2 size={22} className="mx-auto mt-6 animate-spin text-muted" />
          ) : (
            <>
              <Card title="Abbonamenti attivi">
                <div className="grid grid-cols-3 gap-2">
                  <Stat value={subs.active.monthly} label="mensili" strong />
                  <Stat value={subs.active.yearly} label="annuali" strong />
                  <Stat value={subs.active.paying} label="paganti in totale" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat value={subs.active.gift} label="con codice (non pagano)" />
                  <Stat value={subs.active.cancelling} label="disdetti, attivi fino a scadenza" />
                </div>
              </Card>

              <Card
                title="Entrate dagli abbonamenti"
                note={`Calcolo: mensili × ${euro(subs.prices.monthly)} + annuali × ${euro(subs.prices.yearly)} ÷ 12. IVA inclusa, prima delle commissioni Stripe. Comprende i disdetti finché restano attivi.`}
              >
                <div className="grid grid-cols-2 gap-2">
                  <Stat value={euro(subs.monthly_recurring)} label="in media ogni mese" strong />
                  <Stat value={euro(subs.yearly_recurring)} label="in un anno, se restano tutti" />
                </div>
              </Card>

              <Card title="Venduti dall'inizio" note="Prima sottoscrizione di ogni abbonamento; i rinnovi automatici non sono contati qui.">
                <div className="grid grid-cols-2 gap-2">
                  <Stat value={subs.sold.monthly.count} label={`mensili · ${euro(subs.sold.monthly.amount)}`} />
                  <Stat value={subs.sold.yearly.count} label={`annuali · ${euro(subs.sold.yearly.amount)}`} />
                  <Stat value={subs.sold.switches.count} label={`passaggi all'annuale · ${euro(subs.sold.switches.amount)}`} />
                  <Stat value={subs.sold.topups.count} label={`ricariche · ${euro(subs.sold.topups.amount)}`} />
                </div>
              </Card>

              <Card title="Chi è abbonato">
                {subs.list.length === 0 ? (
                  <p className="text-sm text-muted">Nessun abbonamento attivo.</p>
                ) : (
                  subs.list.map((x) => (
                    <div key={x.username} className="flex items-center gap-3 rounded-2xl bg-ground p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-ink">{x.username}</p>
                        <p className="text-xs text-muted">
                          {x.cancelling || x.plan === "codice" ? "Scade il" : "Si rinnova il"} {dateIt(x.until)}
                          {x.since ? ` · dal ${dateIt(x.since)}` : ""}
                          {x.code ? ` · ${x.code}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${PLAN_CHIP[x.plan]}`}>
                          {x.plan}
                          {x.cancelling ? " · disdetto" : ""}
                        </span>
                        <span className="text-xs font-bold text-ink">{euro(x.paid)}</span>
                      </div>
                    </div>
                  ))
                )}
              </Card>
            </>
          ))}

        {tab === "users" && (
          <>
            <label className="flex h-12 items-center gap-2.5 rounded-2xl bg-white px-4 text-muted">
              <Search size={20} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per username"
                aria-label="Cerca per username"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none"
              />
            </label>
            {users === null ? (
              <Loader2 size={22} className="mx-auto mt-6 animate-spin text-muted" />
            ) : users.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Nessun iscritto trovato.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">
                  {users.length === 1 ? "1 iscritto" : `${users.length} iscritti`} · dal più recente
                </p>
                {giftMsg && <p className="rounded-2xl bg-mint px-3.5 py-2.5 text-[13px] text-forest">{giftMsg}</p>}
                {users.map((u) => (
                  <div key={u.username} className="flex flex-col gap-2 rounded-[18px] bg-white p-3">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">
                        {u.username}
                        {u.admin && <span className="ml-1.5 text-xs font-bold text-emerald-600">admin</span>}
                      </span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${PLAN_CHIP[u.plan]}`}>
                        {u.plan}
                        {u.cancelling ? " · disdetto" : ""}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      Iscritto il {dateIt(u.created_at)} · ultimo accesso {dateIt(u.last_sign_in_at)}
                      {u.premium_until ? ` · piano fino al ${dateIt(u.premium_until)}` : ""}
                    </p>
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      <span className="rounded-xl bg-ground py-1.5 text-xs">
                        <b className="block text-sm text-ink">{u.credits}</b>
                        <span className="text-muted">crediti</span>
                      </span>
                      <span className="rounded-xl bg-ground py-1.5 text-xs">
                        <b className="block text-sm text-ink">{u.pantry}</b>
                        <span className="text-muted">dispensa</span>
                      </span>
                      <span className="rounded-xl bg-ground py-1.5 text-xs">
                        <b className="block text-sm text-ink">{u.recipes}</b>
                        <span className="text-muted">ricette</span>
                      </span>
                      <span className="rounded-xl bg-ground py-1.5 text-xs">
                        <b className="block text-sm text-ink">{euro(u.spent)}</b>
                        <span className="text-muted">pagato</span>
                      </span>
                    </div>
                    {u.code && <p className="text-xs text-muted">Codice usato: <b className="font-mono text-ink">{u.code}</b></p>}
                    {!u.admin &&
                      (giftFor === u.username ? (
                        <div className="flex items-center gap-2">
                          <label htmlFor={`gift-${u.username}`} className="sr-only">
                            Crediti da regalare
                          </label>
                          <input
                            id={`gift-${u.username}`}
                            type="number"
                            min={1}
                            max={200}
                            value={giftAmount}
                            onChange={(e) => setGiftAmount(Number(e.target.value))}
                            className="h-10 w-20 rounded-xl bg-ground px-3 text-sm text-ink outline-none ring-1 ring-black/5"
                          />
                          <button
                            type="button"
                            onClick={() => sendGift(u.username)}
                            className="h-10 flex-1 rounded-xl bg-emerald-600 text-xs font-bold text-white"
                          >
                            Regala {giftAmount} crediti
                          </button>
                          <button type="button" onClick={() => setGiftFor(null)} className="h-10 rounded-xl bg-ground px-3 text-xs font-bold text-ink">
                            Annulla
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setGiftFor(u.username);
                            setGiftMsg(null);
                          }}
                          className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-ground text-xs font-bold text-ink"
                        >
                          <Gift size={14} /> Regala crediti
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "codes" && <AdminCodesPanel embedded />}
      </div>
    </div>
  );
};
