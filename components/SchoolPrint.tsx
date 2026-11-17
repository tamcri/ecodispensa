import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { qrcodegen } from "../lib/qrcodegen";
import { SchoolReport } from "../services/schools";

/** Indirizzo pubblico stampato sui fogli: i QR portano qui anche se l'admin lavora da un'anteprima */
export const PUBLIC_URL = "https://ecodispensa.it";
export const codeLink = (code: string) => `${PUBLIC_URL}/?codice=${encodeURIComponent(code)}`;

/** QR code in SVG (nitido in stampa) */
export const QrSvg = ({ text, className }: { text: string; className?: string }) => {
  const { size, path } = useMemo(() => {
    const qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM);
    let d = "";
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) if (qr.getModule(x, y)) d += `M${x + 4},${y + 4}h1v1h-1z`;
    }
    return { size: qr.size + 8, path: d };
  }, [text]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label="Codice QR" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#1F2A1E" />
    </svg>
  );
};

/**
 * Anteprima di stampa a tutto schermo. In stampa si vede solo il contenuto:
 * il resto della pagina è nascosto dalle regole @media print in index.css.
 */
export const PrintOverlay = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => {
  useEffect(() => {
    const prevTitle = document.title;
    const prevOverflow = document.body.style.overflow;
    document.title = title; // diventa il nome del PDF salvato
    document.body.style.overflow = "hidden";
    return () => {
      document.title = prevTitle;
      document.body.style.overflow = prevOverflow;
    };
  }, [title]);

  return createPortal(
    <div id="print-area" className="fixed inset-0 z-[200] overflow-auto bg-[#E7E2D6]">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-forest px-4 py-3 text-white">
        <p className="min-w-0 truncate font-bold">{title}</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-10 items-center gap-2 rounded-xl bg-honey px-4 text-sm font-bold text-ink"
          >
            <Printer size={16} /> Stampa o salva PDF
          </button>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="print-pages flex flex-col items-center gap-6 py-6">{children}</div>
    </div>,
    document.body
  );
};

/** Un foglio A4 */
const Page = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`print-page bg-white text-[#1F2A1E] shadow-lg ${className}`}>{children}</div>
);

const Logo = ({ size = "text-[13pt]" }: { size?: string }) => (
  <span className={`font-display font-extrabold leading-none tracking-tight ${size}`}>
    <span className="text-[#6F8F66]">Eco</span>
    <span className="text-[#2F4A2C]">Dispensa</span>
  </span>
);

// ---------------- Codici da ritagliare per le famiglie ----------------

const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** 8 biglietti per foglio A4, da ritagliare lungo le linee tratteggiate */
export const CodeCardsPrint = ({
  codes,
  className,
  school,
  partner,
}: {
  codes: string[];
  className: string;
  school: string;
  partner: string;
}) => (
  <>
    {chunk(codes, 8).map((page, i) => (
      <Page key={i} className="grid h-[297mm] grid-cols-2 grid-rows-4 p-[8mm]">
        {page.map((code) => (
          <div key={code} className="flex flex-col gap-[2mm] border border-dashed border-[#B9B2A2] p-[5mm]">
            <div className="flex items-start justify-between gap-2">
              <Logo />
              <span className="text-right text-[8pt] font-bold leading-tight text-[#4F6B4A]">
                Classe {className}
                <br />
                {school}
              </span>
            </div>
            <p className="text-[9pt] font-bold leading-snug">
              Un anno di EcoDispensa in regalo per la tua famiglia, offerto da {partner}.
            </p>
            <div className="flex flex-1 items-center gap-[4mm]">
              <QrSvg text={codeLink(code)} className="h-[27mm] w-[27mm] shrink-0" />
              <ol className="flex flex-col gap-[1mm] text-[8pt] leading-snug text-[#3D4A3B]">
                <li>
                  <b>1.</b> Inquadra il QR con la fotocamera del telefono
                </li>
                <li>
                  <b>2.</b> Crea l'account: bastano username e password
                </li>
                <li>
                  <b>3.</b> Il codice si attiva da solo: 12 mesi gratis, senza carta e senza rinnovo
                </li>
              </ol>
            </div>
            <div className="flex items-end justify-between gap-2 border-t border-[#E3EBDB] pt-[1.5mm]">
              <span className="text-[7pt] text-[#4A5448]">
                Codice
                <br />
                <b className="font-mono text-[11pt] tracking-wider text-[#1F2A1E]">{code}</b>
              </span>
              <span className="text-right text-[7pt] text-[#4A5448]">ecodispensa.it</span>
            </div>
          </div>
        ))}
      </Page>
    ))}
  </>
);

// ---------------- Report d'impatto per partner e scuola ----------------

const dateIt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
const pctIt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`);
const euroIt = (cents: number | null | undefined) =>
  cents ? (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" }) : "—";
const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("it-IT"));

const Kpi = ({ value, label, dark = false }: { value: string; label: string; dark?: boolean }) => (
  <div className={`flex flex-col gap-[1mm] rounded-[4mm] p-[4mm] ${dark ? "bg-[#2F4A2C] text-white" : "bg-[#E3EBDB]"}`}>
    <span className={`font-display text-[20pt] font-extrabold leading-none ${dark ? "text-[#F6DC8E]" : "text-[#2F4A2C]"}`}>{value}</span>
    <span className={`text-[8pt] leading-snug ${dark ? "text-[#D6E2CF]" : "text-[#4A5448]"}`}>{label}</span>
  </div>
);

export const SchoolReportPrint = ({ report }: { report: SchoolReport }) => {
  const t = report.totals;
  const winner = report.classes.find((c) => c.shown && c.position === 1);
  const shownClasses = report.classes.filter((c) => c.shown).length;
  return (
    <Page className="flex flex-col gap-[6mm] p-[14mm]">
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#2F4A2C] pb-[4mm]">
        <div className="flex flex-col gap-[1.5mm]">
          <Logo size="text-[18pt]" />
          <p className="text-[9pt] font-bold uppercase tracking-[0.12em] text-[#6F8F66]">Progetto Scuola · Report d'impatto</p>
        </div>
        <div className="text-right text-[9pt] leading-snug text-[#3D4A3B]">
          <p className="font-display text-[13pt] font-extrabold text-[#1F2A1E]">{report.school}</p>
          {report.city && <p>{report.city}</p>}
          <p>
            Dal {dateIt(report.from)} al {dateIt(report.to)}
          </p>
        </div>
      </header>

      <p className="text-[10pt] leading-relaxed text-[#3D4A3B]">
        Grazie a <b className="text-[#1F2A1E]">{report.partner}</b>, le famiglie degli alunni hanno ricevuto un anno di EcoDispensa, l'app che
        aiuta a non sprecare il cibo: dispensa sotto controllo, avvisi prima delle scadenze, ricette con quello che c'è in casa. Le classi
        si sfidano in una gara amichevole: vince quella le cui famiglie buttano meno.
      </p>

      <section className="grid grid-cols-4 gap-[3mm]">
        <Kpi value={`${num(t.activated)} / ${num(t.codes)}`} label="codici attivati dalle famiglie" />
        <Kpi value={num(t.consented)} label="famiglie in classifica" />
        <Kpi value={num(t.active)} label="famiglie attive nel periodo" />
        <Kpi value={t.shown ? pctIt(t.waste_rate) : "—"} label="dei prodotti finito nel bidone" dark />
      </section>

      {t.shown && (
        <section className="grid grid-cols-3 gap-[3mm]">
          <Kpi value={num(t.used)} label="prodotti usati in cucina invece di buttarli" />
          <Kpi value={num(t.wasted)} label="prodotti buttati" />
          <Kpi value={euroIt(t.used_value)} label="valore del cibo usato, dove le famiglie hanno inserito il prezzo" />
        </section>
      )}

      {winner && (
        <section className="flex items-center gap-[4mm] rounded-[4mm] bg-[#FBEBC4] p-[4mm]">
          <span className="font-display text-[22pt] font-extrabold text-[#6E5208]">1ª</span>
          <p className="text-[10pt] leading-snug">
            <b>Classe {winner.name}</b>: la classe che ha sprecato meno, con solo il {pctIt(winner.waste_rate)} dei prodotti buttato e{" "}
            {num(winner.active)} famiglie attive.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-[2mm]">
        <h2 className="font-display text-[12pt] font-extrabold text-[#2F4A2C]">La classifica delle classi</h2>
        <table className="w-full border-collapse text-[8.5pt]">
          <thead>
            <tr className="border-b border-[#2F4A2C] text-left text-[#4A5448]">
              <th className="py-[1.5mm] pr-2">Pos.</th>
              <th className="py-[1.5mm] pr-2">Classe</th>
              <th className="py-[1.5mm] pr-2 text-right">Alunni</th>
              <th className="py-[1.5mm] pr-2 text-right">Codici attivati</th>
              <th className="py-[1.5mm] pr-2 text-right">Famiglie attive</th>
              <th className="py-[1.5mm] pr-2 text-right">Usati</th>
              <th className="py-[1.5mm] pr-2 text-right">Buttati</th>
              <th className="py-[1.5mm] text-right">% buttato</th>
            </tr>
          </thead>
          <tbody>
            {report.classes.map((c) => (
              <tr key={c.name} className="border-b border-[#E3EBDB]">
                <td className="py-[1.5mm] pr-2 font-bold">{c.position ? `${c.position}ª` : "—"}</td>
                <td className="py-[1.5mm] pr-2 font-bold">{c.name}</td>
                <td className="py-[1.5mm] pr-2 text-right">{num(c.students)}</td>
                <td className="py-[1.5mm] pr-2 text-right">
                  {num(c.activated)} / {num(c.codes)}
                </td>
                <td className="py-[1.5mm] pr-2 text-right">{num(c.active)}</td>
                {c.shown ? (
                  <>
                    <td className="py-[1.5mm] pr-2 text-right">{num(c.used)}</td>
                    <td className="py-[1.5mm] pr-2 text-right">{num(c.wasted)}</td>
                    <td className="py-[1.5mm] text-right font-bold">{pctIt(c.waste_rate)}</td>
                  </>
                ) : (
                  <td colSpan={3} className="py-[1.5mm] text-right text-[#4A5448]">
                    servono almeno 3 famiglie attive
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {shownClasses === 0 && (
          <p className="text-[9pt] text-[#4A5448]">
            Nessuna classe ha ancora abbastanza famiglie attive per comparire con i propri numeri: la classifica si riempie man mano che
            le famiglie usano l'app.
          </p>
        )}
      </section>

      <footer className="mt-auto flex flex-col gap-[1.5mm] border-t border-[#E3EBDB] pt-[3mm] text-[7.5pt] leading-snug text-[#4A5448]">
        <p>
          <b>Come si legge.</b> «Usati» e «buttati» sono i prodotti che le famiglie hanno tolto dalla dispensa nel periodo. La percentuale
          buttata confronta le classi in modo giusto, qualunque sia il numero di famiglie. In Italia ogni persona butta in media 554 g di
          cibo a settimana (Waste Watcher, «Il caso Italia 2026»).
        </p>
        <p>
          <b>Privacy.</b> Il report contiene solo dati di classe e di istituto, mai di una singola famiglia o di un alunno. Contano solo le
          famiglie che hanno dato il consenso, e i numeri di una classe compaiono solo con almeno 3 famiglie attive.
        </p>
        <p>EcoDispensa · ecodispensa.it · report creato il {new Date().toLocaleDateString("it-IT")}</p>
      </footer>
    </Page>
  );
};
