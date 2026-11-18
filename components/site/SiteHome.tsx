import React, { useState } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChefHat,
  ChevronDown,
  GraduationCap,
  Mic,
  Receipt,
  Refrigerator,
  ShoppingCart,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { openApp, PrimaryButton, SiteLink } from "./SiteApp";

export const Section = ({
  id,
  className = "",
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) => (
  <section id={id} className={`scroll-mt-20 ${className}`}>
    <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">{children}</div>
  </section>
);

export const Eyebrow = ({ children, light = false }: { children: React.ReactNode; light?: boolean }) => (
  <p className={`text-sm font-bold uppercase tracking-[0.16em] ${light ? "text-[#F6DC8E]" : "text-[#6F8F66]"}`}>{children}</p>
);

export const H2 = ({ children, light = false }: { children: React.ReactNode; light?: boolean }) => (
  <h2
    className={`font-display text-[32px] font-extrabold leading-[1.06] tracking-tight [text-wrap:balance] md:text-[44px] ${
      light ? "text-[#FAF5EA]" : "text-forest"
    }`}
  >
    {children}
  </h2>
);

const STATS = [
  { value: "554 g", label: "di cibo buttato da ogni persona, ogni settimana" },
  { value: "7,4 mld €", label: "il valore del cibo che le famiglie italiane buttano in un anno" },
  { value: "799 g", label: "a settimana per i più giovani, più del doppio dei più anziani (352 g)" },
];

const STEPS = [
  {
    icon: Receipt,
    title: "Fai la spesa",
    text: "Fotografi lo scontrino o detti la spesa a voce: i prodotti entrano in dispensa con le loro scadenze.",
  },
  {
    icon: Bell,
    title: "Ricevi gli avvisi",
    text: "Ogni mattina sai cosa scade: niente più yogurt dimenticati in fondo al frigo.",
  },
  {
    icon: ChefHat,
    title: "Cucina con EcoChef",
    text: "Ti propone ricette con quello che hai, partendo da ciò che scade prima.",
  },
];

const FEATURES = [
  { icon: Refrigerator, title: "Dispensa e scadenze", text: "Tutto quello che hai in casa, diviso per reparto, con i giorni che mancano alla scadenza." },
  { icon: ShoppingCart, title: "Lista della spesa", text: "Si scrive anche a voce e si condivide con chi vive con te." },
  { icon: Receipt, title: "Scontrino in un attimo", text: "Una foto e la spesa entra in dispensa, con i prezzi." },
  { icon: ChefHat, title: "EcoChef", text: "Ricette e menu della settimana con quello che hai, per le persone che vuoi." },
  { icon: BookOpen, title: "Ricettario", text: "Le tue ricette salvate, i voti, le foto dei piatti da condividere." },
  { icon: Wallet, title: "Le mie spese", text: "Quanto spendi ogni mese e quanto vale il cibo che finisce nel bidone." },
  { icon: Mic, title: "Inserimento a voce", text: "«Latte, sei uova e due etti di prosciutto»: fatto." },
  { icon: Users, title: "Casa condivisa", text: "Famiglia o coinquilini vedono la stessa dispensa e la stessa lista." },
];

const PLANS = [
  {
    name: "Gratis",
    price: "0 €",
    note: "per sempre",
    items: ["Dispensa con avvisi di scadenza", "Lista della spesa, anche a voce", "Ricettario", "5 crediti EcoChef in regalo"],
    dark: false,
  },
  {
    name: "Premium mensile",
    price: "4,99 €",
    note: "al mese, disdici quando vuoi",
    items: ["Tutto quello del piano gratis", "25 crediti EcoChef ogni mese", "Lettura dello scontrino"],
    dark: true,
  },
  {
    name: "Premium annuale",
    price: "41,99 €",
    note: "all'anno, come 3,50 € al mese",
    items: ["Tutto il Premium", "Paghi una volta sola", "Risparmi più di 17 € l'anno"],
    dark: false,
  },
];

const FAQ = [
  {
    q: "Serve l'email per iscriversi?",
    a: "No. Bastano un username e una password. Ti consigliamo di salvare il codice di recupero che trovi nel Profilo.",
  },
  {
    q: "Funziona su iPhone e Android?",
    a: "Sì. EcoDispensa si apre dal browser e si installa sulla schermata Home come una normale app, senza passare dagli store.",
  },
  {
    q: "Cosa sono i crediti EcoChef?",
    a: "Sono la moneta di EcoChef: ogni 4 richieste di ricette usi 1 credito, il menu della settimana ne usa 4. Se qualcosa va storto, i crediti tornano indietro.",
  },
  {
    q: "Dove finiscono i miei dati?",
    a: "Su server in Europa. Non vendiamo dati, non mostriamo pubblicità e all'intelligenza artificiale non inviamo mai il tuo username.",
  },
  {
    q: "Cos'è il Progetto Scuola?",
    a: "Un'azienda o un Comune regala un anno di EcoDispensa alle famiglie di una scuola, e le classi fanno una gara a chi spreca meno.",
  },
];

const Faq = () => {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="flex flex-col divide-y divide-[#2F4A2C]/10 rounded-[28px] bg-white px-5 md:px-8">
      {FAQ.map((f, i) => (
        <li key={f.q}>
          <button
            type="button"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-4 py-5 text-left font-display text-[18px] font-bold text-ink"
          >
            {f.q}
            <ChevronDown size={20} className={`shrink-0 text-[#6F8F66] transition-transform ${open === i ? "rotate-180" : ""}`} />
          </button>
          {open === i && <p className="-mt-1 pb-5 text-[15px] leading-relaxed text-[#3D4A3B]">{f.a}</p>}
        </li>
      ))}
    </ul>
  );
};

export const SiteHome = () => (
  <main>
    {/* ---------- Apertura ---------- */}
    <section className="bg-[#F7EBD3]">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 pb-16 pt-10 md:flex-row md:items-center md:gap-14 md:px-8 md:pb-24 md:pt-16">
        <div className="flex flex-col gap-6 md:flex-1">
          <Eyebrow>L'app contro lo spreco alimentare</Eyebrow>
          <h1 className="font-display text-[42px] font-extrabold leading-[1.02] tracking-tight [text-wrap:balance] md:text-[64px]">
            Smetti di buttare il cibo. <span className="text-[#4F6B4A]">E i soldi.</span>
          </h1>
          <p className="max-w-[34rem] text-[17px] leading-relaxed text-[#3D4A3B] md:text-[19px]">
            EcoDispensa tiene d'occhio la tua dispensa, ti avvisa prima che il cibo scada e ti propone ricette con quello che hai
            in casa.
          </p>
          <div className="flex flex-wrap gap-3">
            <PrimaryButton onClick={() => openApp()}>
              Prova gratis <ArrowRight size={18} />
            </PrimaryButton>
            <SiteLink
              to="home"
              hash="come-funziona"
              className="inline-flex h-12 items-center rounded-2xl bg-white/80 px-5 text-[15px] font-bold text-forest hover:bg-white"
            >
              Come funziona
            </SiteLink>
          </div>
          <p className="flex items-center gap-2 text-sm text-[#4A5448]">
            <Check size={16} className="text-[#4F6B4A]" /> Gratis, senza email e senza carta di credito
          </p>
        </div>
        <div className="md:w-[46%]">
          <img
            src="/brand/benvenuto-famiglia.jpg"
            alt="Una famiglia sorridente cucina insieme con gli ingredienti che ha in casa"
            className="aspect-[4/3] w-full rounded-[28px] object-cover object-[center_37%] shadow-[0_24px_60px_rgba(47,74,44,0.18)] md:aspect-[4/5]"
          />
        </div>
      </div>
    </section>

    {/* ---------- Il problema ---------- */}
    <Section>
      <div className="flex flex-col gap-10">
        <div className="flex max-w-3xl flex-col gap-4">
          <Eyebrow>Il problema</Eyebrow>
          <H2>In Italia buttiamo mezzo chilo di cibo a testa, ogni settimana.</H2>
          <p className="text-[17px] leading-relaxed text-[#3D4A3B]">
            Quasi sempre per dimenticanza: un prodotto in fondo al frigo, una spesa fatta senza sapere cosa c'era già. È cibo, ma
            sono anche soldi.
          </p>
        </div>
        <ul className="grid gap-4 md:grid-cols-3">
          {STATS.map((s) => (
            <li key={s.value} className="flex flex-col gap-2 rounded-[28px] bg-[#E3EBDB] p-6">
              <span className="font-display text-[44px] font-extrabold leading-none text-forest">{s.value}</span>
              <span className="text-[15px] leading-snug text-[#3D4A3B]">{s.label}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[#4A5448]">Fonte: Osservatorio Waste Watcher International, «Il caso Italia 2026».</p>
      </div>
    </Section>

    {/* ---------- Come funziona ---------- */}
    <Section id="come-funziona" className="bg-white">
      <div className="flex flex-col gap-10">
        <div className="flex max-w-3xl flex-col gap-4">
          <Eyebrow>Come funziona</Eyebrow>
          <H2>Tre gesti, e il cibo non si spreca più.</H2>
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex flex-col gap-4 rounded-[28px] bg-[#FAF5EA] p-6">
              <span className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F6DC8E] font-display text-lg font-extrabold text-ink">
                  {i + 1}
                </span>
                <Icon size={22} className="text-[#4F6B4A]" />
              </span>
              <h3 className="font-display text-[22px] font-extrabold text-forest">{title}</h3>
              <p className="text-[15px] leading-relaxed text-[#3D4A3B]">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </Section>

    {/* ---------- Funzioni ---------- */}
    <Section>
      <div className="flex flex-col gap-10">
        <div className="flex max-w-3xl flex-col gap-4">
          <Eyebrow>Cosa puoi fare</Eyebrow>
          <H2>Tutto quello che serve in cucina, in un'app sola.</H2>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex flex-col gap-3 rounded-[24px] bg-white p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E3EBDB] text-forest">
                <Icon size={22} />
              </span>
              <h3 className="font-bold text-ink">{title}</h3>
              <p className="text-[14px] leading-snug text-[#4A5448]">{text}</p>
            </li>
          ))}
        </ul>
        <SiteLink to="guida" className="inline-flex items-center gap-1.5 self-start font-bold text-forest hover:underline">
          Leggi la guida passo per passo <ArrowRight size={16} />
        </SiteLink>
      </div>
    </Section>

    {/* ---------- Progetto Scuola ---------- */}
    <section id="scuola" className="scroll-mt-20 bg-forest">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-16 md:flex-row md:items-center md:gap-14 md:px-8 md:py-24">
        <div className="flex flex-col gap-5 md:flex-1">
          <Eyebrow light>Progetto Scuola</Eyebrow>
          <H2 light>Le abitudini che salvano il cibo si imparano da piccoli.</H2>
          <p className="text-[17px] leading-relaxed text-[#D6E2CF]">
            Sono i più giovani a sprecare di più. Con il Progetto Scuola un'azienda o un Comune regala un anno di EcoDispensa alle
            famiglie degli alunni, e le classi si sfidano a chi butta meno.
          </p>
          <div className="flex flex-wrap gap-3">
            <SiteLink
              to="partner"
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#F6DC8E] px-6 text-[15px] font-bold text-ink hover:bg-[#FBEBC4]"
            >
              Porta il progetto nella tua scuola <ArrowRight size={18} />
            </SiteLink>
          </div>
        </div>
        <ul className="grid gap-3 md:w-[46%]">
          {[
            { icon: GraduationCap, t: "Un anno di app completa per ogni famiglia, offerto dal partner" },
            { icon: Trophy, t: "Classifica delle classi: vince chi butta meno cibo, in percentuale" },
            { icon: Users, t: "Solo dati di classe: nessun dato degli alunni, nessuna famiglia riconoscibile" },
            { icon: Check, t: "Un report d'impatto per la scuola e per il partner" },
          ].map(({ icon: Icon, t }) => (
            <li key={t} className="flex items-start gap-3 rounded-[22px] bg-[#3A5836] p-4 text-[15px] leading-snug text-[#FAF5EA]">
              <Icon size={20} className="mt-0.5 shrink-0 text-[#F6DC8E]" />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>

    {/* ---------- Prezzi ---------- */}
    <Section id="prezzi">
      <div className="flex flex-col gap-10">
        <div className="flex max-w-3xl flex-col gap-4">
          <Eyebrow>Prezzi</Eyebrow>
          <H2>Inizi gratis. Passi a Premium solo se ti serve.</H2>
        </div>
        <ul className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <li
              key={p.name}
              className={`flex flex-col gap-4 rounded-[28px] p-6 ${p.dark ? "bg-forest text-white" : "bg-white text-ink"}`}
            >
              <p className={`text-sm font-bold uppercase tracking-[0.14em] ${p.dark ? "text-[#F6DC8E]" : "text-[#6F8F66]"}`}>{p.name}</p>
              <p className="flex items-baseline gap-2">
                <span className={`font-display text-[44px] font-extrabold leading-none ${p.dark ? "text-[#F6DC8E]" : "text-forest"}`}>
                  {p.price}
                </span>
              </p>
              <p className={`text-sm ${p.dark ? "text-[#D6E2CF]" : "text-[#4A5448]"}`}>{p.note}</p>
              <ul className="flex flex-col gap-2">
                {p.items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-[15px]">
                    <Check size={18} className={`mt-0.5 shrink-0 ${p.dark ? "text-[#F6DC8E]" : "text-[#4F6B4A]"}`} />
                    {it}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="text-sm text-[#4A5448]">Prezzi IVA inclusa. Ricariche di crediti EcoChef disponibili nell'app.</p>
      </div>
    </Section>

    {/* ---------- Domande ---------- */}
    <Section className="bg-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-4">
          <Eyebrow>Domande frequenti</Eyebrow>
          <H2>Le risposte veloci.</H2>
        </div>
        <Faq />
      </div>
    </Section>

    {/* ---------- Chiusura ---------- */}
    <Section className="bg-[#F6DC8E]">
      <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 className="font-display text-[32px] font-extrabold leading-tight tracking-tight text-ink md:text-[40px]">
            Il prossimo cibo che salvi è già nel tuo frigo.
          </h2>
          <p className="text-[17px] text-[#3D3A1F]">Iscriviti in un minuto e fai la tua prima spesa con EcoDispensa.</p>
        </div>
        <PrimaryButton onClick={() => openApp()}>
          Prova gratis <ArrowRight size={18} />
        </PrimaryButton>
      </div>
    </Section>
  </main>
);
