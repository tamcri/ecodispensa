import React, { useState } from "react";
import { Building2, Check, GraduationCap, Landmark, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { LEGAL } from "../../legal/documents";
import { H2, Section } from "./SiteHome";

const OFFERS = [
  {
    id: "comuni",
    icon: Landmark,
    who: "Comuni",
    title: "Regalate EcoDispensa ai cittadini",
    text: "Un anno di app completa alle famiglie del territorio, per esempio a chi fa bene la raccolta differenziata o ai nuovi residenti.",
    points: ["Meno rifiuti alimentari da raccogliere e smaltire", "Un'azione concreta verso il −30% di spreco chiesto dall'Europa entro il 2030", "Il nome del Comune nel messaggio che accoglie chi attiva il regalo"],
  },
  {
    id: "aziende",
    icon: Building2,
    who: "Aziende",
    title: "Un benefit per i dipendenti",
    text: "Un abbonamento per ogni persona che lavora con voi: un welfare che si usa tutti i giorni e fa risparmiare davvero sulla spesa.",
    points: ["Un regalo utile, non l'ennesimo gadget", "Un progetto di sostenibilità da raccontare nel bilancio e sui social", "Il nome dell'azienda nel messaggio che accoglie chi attiva il regalo"],
  },
  {
    id: "scuole",
    icon: GraduationCap,
    who: "Scuole",
    title: "Il Progetto Scuola",
    text: "Un'azienda o il Comune offre l'app alle famiglie degli alunni e le classi fanno una gara: vince quella che butta meno cibo.",
    points: ["Biglietti con QR pronti da consegnare, un codice per ogni alunno", "Classifica delle classi e premiazione finale", "Report d'impatto per la scuola e per chi ha offerto il progetto"],
  },
];

const HOW = [
  { t: "Ci raccontate chi volete coinvolgere", d: "Cittadini, dipendenti o le classi di una scuola, e quante persone sono." },
  { t: "Vi mandiamo una proposta", d: "Su misura per numero di persone e durata." },
  { t: "Creiamo i codici", d: "Uno per persona, da consegnare con un link o con biglietti stampabili con QR." },
  { t: "Le persone attivano il regalo", d: "Si iscrivono in un minuto, senza email e senza carta: 12 mesi di Premium." },
  { t: "Vedete i risultati", d: "Quante persone l'hanno attivato e, per le scuole, la classifica e il report d'impatto." },
];

type Kind = "comune" | "azienda" | "scuola" | "altro";

const KINDS: Array<[Kind, string]> = [
  ["comune", "Comune"],
  ["azienda", "Azienda"],
  ["scuola", "Scuola"],
  ["altro", "Altro"],
];

const ERRORS: Record<string, string> = {
  BAD_EMAIL: "Controlla l'indirizzo email.",
  MISSING_FIELDS: "Compila i campi obbligatori.",
  NO_PRIVACY: "Serve la presa visione dell'informativa privacy.",
  TOO_SOON: "Abbiamo già ricevuto una richiesta da questa email pochi minuti fa: ti risponderemo presto.",
  TOO_MANY: "In questo momento riceviamo troppe richieste. Riprova tra poco o scrivici per email.",
};

const field =
  "h-12 w-full rounded-2xl border border-[#2F4A2C]/15 bg-white px-4 text-[15px] text-ink outline-none focus:border-[#2F7D3A] focus:ring-2 focus:ring-[#2F7D3A]/30";
const label = "mb-1.5 block text-sm font-bold text-ink";

const PartnerForm = () => {
  const [kind, setKind] = useState<Kind>("comune");
  const [form, setForm] = useState({ organization: "", contact: "", role: "", email: "", phone: "", city: "", families: "", message: "" });
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!privacy) {
      setError(ERRORS.NO_PRIVACY);
      return;
    }
    setBusy(true);
    const families = parseInt(form.families.replace(/\D/g, ""), 10);
    const { data: requestId, error: err } = await supabase.rpc("submit_partner_request", {
      p_kind: kind,
      p_organization: form.organization,
      p_contact_name: form.contact,
      p_role: form.role,
      p_email: form.email,
      p_phone: form.phone,
      p_city: form.city,
      p_families: Number.isFinite(families) ? families : null,
      p_message: form.message,
      p_privacy_version: LEGAL.termsVersion,
    });
    setBusy(false);
    if (err) {
      const code = Object.keys(ERRORS).find((k) => err.message?.includes(k));
      setError(code ? ERRORS[code] : `Invio non riuscito. Riprova o scrivici a ${LEGAL.email}.`);
      return;
    }
    // avviso email a info@ecodispensa.it: se non parte, la richiesta è comunque salvata
    if (typeof requestId === "string") {
      fetch("/api/partner-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId }),
      }).catch(() => undefined);
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[28px] bg-[#F3F6EE] p-6 md:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2F7D3A] text-white">
          <Check size={24} />
        </span>
        <h3 className="font-display text-[26px] font-extrabold text-[#2F7D3A]">Grazie, richiesta ricevuta!</h3>
        <p className="text-[15px] leading-relaxed text-[#3D4A3B]">
          Ti ricontattiamo entro pochi giorni all'indirizzo email che ci hai lasciato. Per qualsiasi cosa puoi scriverci a{" "}
          <a href={`mailto:${LEGAL.email}`} className="font-bold text-[#2F7D3A] underline">
            {LEGAL.email}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 rounded-[28px] border-2 border-[#14231A]/10 bg-white p-5 md:p-8" noValidate>
      <fieldset>
        <legend className={label}>Chi siete</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KINDS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`h-11 rounded-2xl text-sm font-bold ${kind === k ? "bg-[#16301B] text-white" : "bg-[#F3F6EE] text-[#14231A] ring-1 ring-[#14231A]/10"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="p-org" className={label}>
            {kind === "comune" ? "Comune" : kind === "scuola" ? "Nome dell'istituto" : "Nome dell'ente o dell'azienda"} *
          </label>
          <input id="p-org" required className={field} value={form.organization} onChange={set("organization")} autoComplete="organization" />
        </div>
        <div>
          <label htmlFor="p-city" className={label}>
            Città *
          </label>
          <input id="p-city" required className={field} value={form.city} onChange={set("city")} autoComplete="address-level2" />
        </div>
        <div>
          <label htmlFor="p-name" className={label}>
            Nome e cognome *
          </label>
          <input id="p-name" required className={field} value={form.contact} onChange={set("contact")} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="p-role" className={label}>
            Ruolo
          </label>
          <input
            id="p-role"
            className={field}
            value={form.role}
            onChange={set("role")}
            placeholder={kind === "scuola" ? "es. Dirigente, docente" : kind === "comune" ? "es. Assessore all'ambiente" : "es. Responsabile CSR"}
          />
        </div>
        <div>
          <label htmlFor="p-email" className={label}>
            Email *
          </label>
          <input id="p-email" required type="email" className={field} value={form.email} onChange={set("email")} autoComplete="email" />
        </div>
        <div>
          <label htmlFor="p-phone" className={label}>
            Telefono
          </label>
          <input id="p-phone" type="tel" className={field} value={form.phone} onChange={set("phone")} autoComplete="tel" />
        </div>
        <div>
          <label htmlFor="p-fam" className={label}>
            Quante famiglie o alunni, circa
          </label>
          <input id="p-fam" inputMode="numeric" className={field} value={form.families} onChange={set("families")} placeholder="es. 300" />
        </div>
      </div>

      <div>
        <label htmlFor="p-msg" className={label}>
          Messaggio
        </label>
        <textarea
          id="p-msg"
          rows={4}
          className={`${field} h-auto py-3`}
          value={form.message}
          onChange={set("message")}
          placeholder="Raccontaci la tua idea: quale scuola, quando vorreste partire, domande."
        />
      </div>

      <label className="flex items-start gap-3 text-[14px] leading-snug text-[#3D4A3B]">
        <input
          type="checkbox"
          checked={privacy}
          onChange={(e) => setPrivacy(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
        />
        <span>
          Ho letto l'
          <a href="/?pagina=privacy" target="_blank" rel="noreferrer" className="font-bold text-[#2F7D3A] underline">
            informativa sulla privacy
          </a>
          : i dati servono solo a ricontattarmi per questa richiesta. *
        </span>
      </label>

      {error && <p className="rounded-2xl bg-[#F8DDD2] p-3 text-sm font-semibold text-[#8E3418]">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#2F7D3A] text-[15px] font-bold text-white hover:bg-[#276B31] disabled:opacity-60"
      >
        {busy && <Loader2 size={18} className="animate-spin" />} Invia la richiesta
      </button>
      <p className="text-xs text-[#4A5448]">* campi obbligatori</p>
    </form>
  );
};

export const SitePartner = () => (
  <main>
    <section className="bg-[#16301B] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-16 md:px-8 md:py-24">
        <h1 className="max-w-4xl font-display text-[46px] font-extrabold leading-[0.97] tracking-[-0.03em] [text-wrap:balance] md:text-[76px]">
          Regalate un anno senza sprechi.
        </h1>
        <p className="max-w-2xl text-[18px] leading-relaxed text-[#CFE0C9] md:text-[20px]">
          Comuni, aziende e scuole possono offrire EcoDispensa a cittadini, dipendenti e famiglie. Noi pensiamo ai codici e
          all'app, voi date il regalo.
        </p>
        <nav aria-label="Proposte" className="flex flex-wrap gap-3">
          {OFFERS.map(({ id, icon: Icon, who }) => (
            <a
              key={id}
              href={`#${id}`}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white/10 px-5 font-bold text-white hover:bg-white/20"
            >
              <Icon size={19} className="text-[#F5D547]" /> {who}
            </a>
          ))}
          <a href="#contatti" className="inline-flex h-12 items-center rounded-2xl bg-[#F5D547] px-6 font-bold text-[#14231A] hover:bg-[#FFE36B]">
            Chiedici una proposta
          </a>
        </nav>
      </div>
    </section>

    {OFFERS.map(({ id, icon: Icon, who, title, text, points }, i) => (
      <section key={id} id={id} className={`scroll-mt-16 ${i % 2 ? "bg-[#F3F6EE]" : "bg-white"}`}>
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-[1fr_1.2fr] md:gap-16 md:px-8 md:py-20">
          <div className="flex flex-col gap-4">
            <span className="flex items-center gap-2 text-[16px] font-bold text-[#2F7D3A]">
              <Icon size={22} /> {who}
            </span>
            <H2>{title}</H2>
          </div>
          <div className="flex flex-col gap-5">
            <p className="text-[18px] leading-relaxed text-[#2E3A30]">{text}</p>
            <ul className="flex flex-col gap-3">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[16px] leading-snug text-[#14231A]">
                  <Check size={20} className="mt-0.5 shrink-0 text-[#2F7D3A]" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    ))}

    <Section className="bg-[#F5D547]">
      <div className="grid gap-10 md:grid-cols-[1fr_1.3fr]">
        <H2>Come funziona</H2>
        <ol className="flex flex-col gap-6">
          {HOW.map((s, i) => (
            <li key={s.t} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#14231A] font-display font-extrabold text-[#F5D547]">
                {i + 1}
              </span>
              <span>
                <span className="block font-display text-[20px] font-bold text-[#14231A]">{s.t}</span>
                <span className="block text-[16px] leading-snug text-[#2E3A1E]">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-12 flex max-w-3xl items-start gap-3 text-[15px] leading-relaxed text-[#2E3A1E]">
        <ShieldCheck size={20} className="mt-0.5 shrink-0" />
        Privacy al primo posto: ogni persona ha il proprio account, voi vedete solo numeri complessivi e mai cosa c'è nella dispensa
        di qualcuno. Nel Progetto Scuola non raccogliamo dati degli alunni.
      </p>
    </Section>

    <Section id="contatti" className="bg-white">
      <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-5">
          <H2>Chiedici una proposta.</H2>
          <p className="text-[17px] leading-relaxed text-[#3B4A3E]">
            Lasciaci i tuoi riferimenti: ti ricontattiamo con una proposta su misura per il numero di persone che volete coinvolgere.
          </p>
          <p className="text-[16px] text-[#3B4A3E]">
            Preferisci l'email? Scrivi a{" "}
            <a href={`mailto:${LEGAL.email}`} className="font-bold text-[#2F7D3A] underline">
              {LEGAL.email}
            </a>
          </p>
        </div>
        <PartnerForm />
      </div>
    </Section>
  </main>
);
