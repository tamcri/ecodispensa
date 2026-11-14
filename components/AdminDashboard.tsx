import React, { useEffect, useState } from "react";
import { ChevronLeft, Loader2, RefreshCw, Search } from "lucide-react";
import { AdminDashboard as Dash, AdminUser, fetchAdminDashboard, fetchAdminUsers } from "../services/codes";
import { AdminCodesPanel } from "./AdminCodesPanel";

type Tab = "overview" | "users" | "codes";

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
export const AdminDashboard = ({ onClose }: { onClose: () => void }) => {
  const [tab, setTab] = useState<Tab>("overview");
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");

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
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-ground">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-16 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))]">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="flex h-11 items-center gap-1 pr-3 text-sm font-bold text-ink">
            <ChevronLeft size={20} /> Profilo
          </button>
          <span className="rounded-full bg-forest px-3 py-1 text-xs font-bold text-white">Area riservata</span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[30px] font-extrabold leading-tight tracking-tight text-ink">Dashboard</h1>
            <p className="text-[13px] text-muted">Visibile solo all'amministratore.</p>
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

        <div role="tablist" aria-label="Sezioni" className="grid grid-cols-3 gap-1 rounded-2xl bg-stone p-1">
          {(
            [
              ["overview", "Panoramica"],
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
              className={`h-10 rounded-xl text-[13px] ${tab === id ? "bg-white font-extrabold text-ink shadow-sm" : "font-semibold text-[#4A5448]"}`}
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
