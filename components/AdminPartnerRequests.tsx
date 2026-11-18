import React, { useEffect, useState } from "react";
import { Building2, GraduationCap, Landmark, Loader2, Mail, Phone, RefreshCw, Users } from "lucide-react";
import { supabase } from "../services/supabaseClient";

type Status = "nuova" | "in_corso" | "chiusa";

type PartnerRequest = {
  id: string;
  created_at: string;
  kind: "comune" | "azienda" | "scuola" | "altro";
  organization: string;
  contact_name: string;
  role: string | null;
  email: string;
  phone: string | null;
  city: string;
  families: number | null;
  message: string | null;
  status: Status;
};

const KIND: Record<PartnerRequest["kind"], [string, React.ComponentType<{ size?: number; className?: string }>]> = {
  comune: ["Comune", Landmark],
  azienda: ["Azienda", Building2],
  scuola: ["Scuola", GraduationCap],
  altro: ["Altro", Users],
};

const STATUS: Array<[Status, string]> = [
  ["nuova", "Nuova"],
  ["in_corso", "In corso"],
  ["chiusa", "Chiusa"],
];

const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Dashboard admin: le richieste arrivate dal modulo "Diventa partner" del sito */
export const AdminPartnerRequests = () => {
  const [rows, setRows] = useState<PartnerRequest[] | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setError(false);
    const { data, error: err } = await supabase.rpc("admin_partner_requests");
    if (err) {
      console.error("admin_partner_requests error:", err);
      setError(true);
      setRows([]);
      return;
    }
    setRows((data ?? []) as PartnerRequest[]);
  };

  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id: string, status: Status) => {
    setSaving(id);
    const { error: err } = await supabase.rpc("admin_set_partner_request_status", { p_id: id, p_status: status });
    setSaving(null);
    if (err) {
      console.error("admin_set_partner_request_status error:", err);
      return;
    }
    setRows((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const fresh = (rows ?? []).filter((r) => r.status === "nuova").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold text-ink">Richieste partner</h2>
          <p className="text-sm text-muted">
            Dal modulo «Diventa partner» del sito{rows ? ` · ${fresh === 1 ? "1 nuova" : `${fresh} nuove`}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRows(null);
            load();
          }}
          aria-label="Aggiorna"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-ink"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {rows === null && <Loader2 size={22} className="mx-auto mt-6 animate-spin text-muted" />}
      {error && <p className="rounded-2xl bg-peach p-3 text-sm font-semibold text-[#8E3418]">Non riesco a caricare le richieste. Riprova tra poco.</p>}
      {rows && !error && rows.length === 0 && (
        <p className="rounded-2xl bg-white p-4 text-sm text-muted">Nessuna richiesta per ora. Arriveranno qui quando qualcuno compila il modulo del sito.</p>
      )}

      {(rows ?? []).map((r) => {
        const [kindLabel, Icon] = KIND[r.kind] ?? KIND.altro;
        return (
          <article key={r.id} className={`flex flex-col gap-3 rounded-[22px] bg-white p-4 ${r.status === "chiusa" ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-mint text-forest">
                  <Icon size={20} />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-ink">{r.organization}</p>
                  <p className="text-sm text-muted">
                    {kindLabel} · {r.city}
                    {r.families ? ` · circa ${r.families.toLocaleString("it-IT")} famiglie` : ""}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted">{when(r.created_at)}</span>
            </div>

            <div className="flex flex-col gap-1 text-sm text-ink">
              <p>
                <span className="font-semibold">{r.contact_name}</span>
                {r.role ? <span className="text-muted"> · {r.role}</span> : null}
              </p>
              <a href={`mailto:${r.email}`} className="flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline">
                <Mail size={14} /> {r.email}
              </a>
              {r.phone && (
                <a href={`tel:${r.phone}`} className="flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline">
                  <Phone size={14} /> {r.phone}
                </a>
              )}
            </div>

            {r.message && <p className="whitespace-pre-line rounded-2xl bg-ground p-3 text-sm text-[#3D4A3B]">{r.message}</p>}

            <div className="flex items-center gap-2">
              {STATUS.map(([s, label]) => (
                <button
                  key={s}
                  type="button"
                  disabled={saving === r.id}
                  onClick={() => setStatus(r.id, s)}
                  aria-pressed={r.status === s}
                  className={`h-9 rounded-xl px-3 text-xs font-bold ${r.status === s ? "bg-forest text-white" : "bg-ground text-ink"}`}
                >
                  {label}
                </button>
              ))}
              {saving === r.id && <Loader2 size={14} className="animate-spin text-muted" />}
            </div>
          </article>
        );
      })}
    </div>
  );
};
