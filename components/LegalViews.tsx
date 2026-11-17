import React, { useEffect, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { LEGAL, LEGAL_DOCS, LegalDocId } from "../legal/documents";
import { Sheet } from "./ui";

/** Il testo di un documento legale */
export const LegalDocBody = ({ id }: { id: LegalDocId }) => {
  const doc = LEGAL_DOCS[id];
  return (
    <article className="flex flex-col gap-5 text-[15px] leading-relaxed text-[#3D4A3B]">
      <p>{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-extrabold text-ink">{s.title}</h2>
          {s.blocks.map((b, i) =>
            Array.isArray(b) ? (
              <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 marker:text-[#6F8F66]">
                {b.map((li) => (
                  <li key={li}>{li}</li>
                ))}
              </ul>
            ) : (
              <p key={i}>{b}</p>
            )
          )}
        </section>
      ))}
      <p className="text-xs text-muted">Ultimo aggiornamento: {LEGAL.updated}</p>
    </article>
  );
};

/** Link ai documenti, da usare in fondo alle pagine */
export const LegalLinks = ({ onOpen, className = "" }: { onOpen: (id: LegalDocId) => void; className?: string }) => (
  <nav aria-label="Documenti legali" className={`flex flex-wrap gap-x-4 gap-y-1 ${className}`}>
    {(["privacy", "termini", "cookie"] as LegalDocId[]).map((id) => (
      <button key={id} type="button" onClick={() => onOpen(id)} className="font-semibold underline-offset-2 hover:underline">
        {id === "privacy" ? "Privacy" : id === "termini" ? "Termini d'uso" : "Cookie"}
      </button>
    ))}
  </nav>
);

/** Un documento in un foglio a comparsa, dentro l'app */
export const LegalSheet = ({ id, onClose }: { id: LegalDocId | null; onClose: () => void }) => (
  <Sheet open={!!id} onClose={onClose} title={id ? LEGAL_DOCS[id].title : ""}>
    {id && (
      <div className="pb-6">
        <LegalDocBody id={id} />
      </div>
    )}
  </Sheet>
);

/** Pagina pubblica: ecodispensa.it/?pagina=privacy (si apre anche senza account) */
export const LegalPage = ({ id, onBack }: { id: LegalDocId; onBack: () => void }) => {
  const [current, setCurrent] = useState(id);
  useEffect(() => {
    document.title = `${LEGAL_DOCS[current].title} · EcoDispensa`;
    window.scrollTo(0, 0);
  }, [current]);

  return (
    <div className="min-h-screen bg-[#F7EBD3] text-ink">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))]">
        <header className="flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="flex h-10 items-center gap-1 rounded-full pr-3 font-bold text-[#2F4A2C]">
            <ChevronLeft size={20} /> EcoDispensa
          </button>
        </header>
        <h1 className="font-display text-[32px] font-extrabold leading-tight tracking-tight text-[#2F4A2C]">
          {LEGAL_DOCS[current].title}
        </h1>
        <div className="rounded-[28px] bg-white/80 p-5 md:p-8">
          <LegalDocBody id={current} />
        </div>
        <LegalLinks onOpen={setCurrent} className="text-sm text-[#4A5448]" />
      </div>
    </div>
  );
};

/** Progetto Scuola: la famiglia sceglie se partecipare alla classifica */
export const SchoolConsentSheet = ({
  open,
  className,
  partner,
  onClose,
  onDecide,
}: {
  open: boolean;
  className: string;
  partner: string;
  onClose: () => void;
  onDecide: (accept: boolean) => Promise<boolean>;
}) => {
  const [busy, setBusy] = useState<null | "yes" | "no">(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (accept: boolean) => {
    setBusy(accept ? "yes" : "no");
    setError(null);
    const ok = await onDecide(accept);
    setBusy(null);
    if (!ok) setError("Non sono riuscito a salvare la scelta. Riprova.");
  };

  const footer = (
    <div className="flex flex-col gap-2">
      {error && <p className="rounded-2xl bg-peach p-3 text-sm font-semibold text-[#8E3418]">{error}</p>}
      <button
        type="button"
        disabled={!!busy}
        onClick={() => decide(true)}
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-bold text-white disabled:opacity-60"
      >
        {busy === "yes" && <Loader2 size={16} className="animate-spin" />} Acconsento e partecipo
      </button>
      <button
        type="button"
        disabled={!!busy}
        onClick={() => decide(false)}
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white font-bold text-ink ring-1 ring-black/10 disabled:opacity-60"
      >
        {busy === "no" && <Loader2 size={16} className="animate-spin" />} No grazie, non partecipo
      </button>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Progetto Scuola" footer={footer}>
      <div className="flex flex-col gap-4 pb-4">
        <div className="rounded-3xl bg-forest p-4 text-white">
          <p className="font-display text-lg font-extrabold">Classe {className}</p>
          <p className="mt-1 text-[13px] text-[#CFDCC6]">
            12 mesi di EcoDispensa offerti da <b className="text-honey">{partner}</b>. Il regalo è tuo comunque.
          </p>
        </div>
        <LegalDocBody id="scuola" />
      </div>
    </Sheet>
  );
};
