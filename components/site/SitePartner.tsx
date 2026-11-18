import React, { useState } from "react";
import { Building2, Check, BarChart3, GraduationCap, Landmark, Loader2, Megaphone, QrCode, ShieldCheck, Trophy } from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { LEGAL } from "../../legal/documents";
import { Eyebrow, H2, Section } from "./SiteHome";

const WHO = [
  {
    icon: Landmark,
    title: "Comuni",
    text: "Meno rifiuti da smaltire e un progetto concreto verso l'obiettivo europeo di −30% di spreco entro il 2030.",
  },
  {
    icon: Building2,
    title: "Aziende",
    text: "Un progetto di responsabilità sociale visibile e misurabile, vicino alle famiglie del territorio.",
  },
  {
    icon: GraduationCap,
    title: "Scuole",
    text: "Un percorso di educazione alimentare e civica già pronto, che coinvolge anche i genitori.",
  },
];

const HOW = [
  { t: "Scegliete insieme a noi la scuola", d: "Istituto e classi, con il numero di alunni." },
  { t: "Creiamo un codice per ogni alunno", d: "Ogni codice vale 12 mesi di EcoDispensa completa." },
  { t: "La scuola consegna i biglietti", d: "Pronti da stampare, con il QR: il genitore lo inquadra e si iscrive." },
  { t: "Le famiglie usano l'app", d: "E, se lo vogliono, partecipano alla classifica della classe." },
  { t: "Ricevete il report d'impatto", d: "Famiglie attive, cibo salvato, classe vincitrice, da usare nella comunicazione." },
];

const GETS = [
  { icon: Megaphone, t: "«Offerto da» con il vostro nome nell'app di ogni famiglia, per 12 mesi" },
  { icon: BarChart3, t: "Un report d'impatto per periodo, pronto da condividere" },
  { icon: Trophy, t: "La premiazione della classe che ha sprecato meno" },
  { icon: QrCode, t: "Biglietti con QR pronti da stampare, nessun lavoro per la scuola" },
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
  "h-12 w-full rounded-2xl border border-[#2F4A2C]/15 bg-white px-4 text-[15px] text-ink outline-none focus:border-[#6F8F66] focus:ring-2 focus:ring-[#6F8F66]/30";
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
    const { error: err } = await supabase.rpc("submit_partner_request", {
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
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[28px] bg-[#E3EBDB] p-6 md:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-forest text-white">
          <Check size={24} />
        </span>
        <h3 className="font-display text-[26px] font-extrabold text-forest">Grazie, richiesta ricevuta!</h3>
        <p className="text-[15px] leading-relaxed text-[#3D4A3B]">
          Ti ricontattiamo entro pochi giorni all'indirizzo email che ci hai lasciato. Per qualsiasi cosa puoi scriverci a{" "}
          <a href={`mailto:${LEGAL.email}`} className="font-bold text-forest underline">
            {LEGAL.email}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 rounded-[28px] bg-white p-5 md:p-8" noValidate>
      <fieldset>
        <legend className={label}>Chi siete</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KINDS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`h-11 rounded-2xl text-sm font-bold ${kind === k ? "bg-forest text-white" : "bg-[#FAF5EA] text-ink ring-1 ring-[#2F4A2C]/10"}`}
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
          <a href="/?pagina=privacy" target="_blank" rel="noreferrer" className="font-bold text-forest underline">
            informativa sulla privacy
          </a>
          : i dati servono solo a ricontattarmi per questa richiesta. *
        </span>
      </label>

      {error && <p className="rounded-2xl bg-[#F8DDD2] p-3 text-sm font-semibold text-[#8E3418]">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-forest text-[15px] font-bold text-white disabled:opacity-60"
      >
        {busy && <Loader2 size={18} className="animate-spin" />} Invia la richiesta
      </button>
      <p className="text-xs text-[#4A5448]">* campi obbligatori</p>
    </form>
  );
};

export const SitePartner = () => (
  <main>
    <section className="bg-forest">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-14 md:px-8 md:py-20">
        <Eyebrow light>Diventa partner</Eyebrow>
        <h1 className="max-w-4xl font-display text-[40px] font-extrabold leading-[1.04] tracking-tight text-[#FAF5EA] [text-wrap:balance] md:text-[58px]">
          Regala alle famiglie della tua città un anno senza sprechi.
        </h1>
        <p className="max-w-2xl text-[17px] leading-relaxed text-[#D6E2CF] md:text-[19px]">
          Con il Progetto Scuola offrite EcoDispensa alle famiglie degli alunni e misurate quanto cibo salvano, classe per
          classe.
        </p>
        <a
          href="#contatti"
          className="inline-flex h-12 items-center self-start rounded-2xl bg-[#F6DC8E] px-6 text-[15px] font-bold text-ink hover:bg-[#FBEBC4]"
        >
          Chiedi informazioni
        </a>
      </div>
    </section>

    <Section>
      <div className="flex flex-col gap-10">
        <div className="flex max-w-3xl flex-col gap-4">
          <Eyebrow>Per chi è</Eyebrow>
          <H2>Un progetto, tre modi di partecipare.</H2>
        </div>
        <ul className="grid gap-4 md:grid-cols-3">
          {WHO.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex flex-col gap-3 rounded-[28px] bg-white p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E3EBDB] text-forest">
                <Icon size={24} />
              </span>
              <h3 className="font-display text-[22px] font-extrabold text-forest">{title}</h3>
              <p className="text-[15px] leading-relaxed text-[#3D4A3B]">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>

    <Section className="bg-white">
      <div className="grid gap-12 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Eyebrow>Come funziona</Eyebrow>
          <H2>Cinque passi, e la scuola non deve fare quasi niente.</H2>
          <ol className="flex flex-col gap-4">
            {HOW.map((s, i) => (
              <li key={s.t} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F6DC8E] font-display font-extrabold text-ink">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-bold text-ink">{s.t}</span>
                  <span className="block text-[15px] leading-snug text-[#4A5448]">{s.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col gap-6">
          <Eyebrow>Cosa ottenete</Eyebrow>
          <ul className="flex flex-col gap-3">
            {GETS.map(({ icon: Icon, t }) => (
              <li key={t} className="flex items-start gap-3 rounded-[22px] bg-[#FAF5EA] p-4 text-[15px] leading-snug text-ink">
                <Icon size={20} className="mt-0.5 shrink-0 text-[#4F6B4A]" />
                {t}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 rounded-[28px] bg-forest p-6 text-white">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#F6DC8E]">Quanto costa</p>
            <p className="font-display text-[44px] font-extrabold leading-none text-[#F6DC8E]">20 €</p>
            <p className="text-[15px] text-[#D6E2CF]">a famiglia, per 12 mesi di app completa. Un istituto di 300 alunni: 6.000 €.</p>
          </div>
          <p className="flex items-start gap-2 text-[14px] leading-snug text-[#4A5448]">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#4F6B4A]" />
            Privacy al primo posto: l'account è del genitore, non raccogliamo dati degli alunni e partner e scuola vedono solo
            dati di classe.
          </p>
        </div>
      </div>
    </Section>

    <Section id="contatti">
      <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <Eyebrow>Contatti</Eyebrow>
          <H2>Parliamone.</H2>
          <p className="text-[17px] leading-relaxed text-[#3D4A3B]">
            Lasciaci i tuoi riferimenti: ti ricontattiamo per capire insieme quale scuola coinvolgere e quando partire.
          </p>
          <p className="text-[15px] text-[#3D4A3B]">
            Preferisci l'email? Scrivi a{" "}
            <a href={`mailto:${LEGAL.email}`} className="font-bold text-forest underline">
              {LEGAL.email}
            </a>
          </p>
        </div>
        <PartnerForm />
      </div>
    </Section>
  </main>
);
