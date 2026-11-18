import React, { useState } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Building2,
  Check,
  ChefHat,
  ChevronDown,
  GraduationCap,
  Landmark,
  Mic,
  Receipt,
  Refrigerator,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";
import { openApp, PrimaryButton, SiteLink } from "./SiteApp";
import { HomeScreen, PantryScreen, PaperReceipt, Phone, ReceiptScreen, RecipeScreen } from "./PhoneMockups";

/** Colori del sito: più decisi dell'app, stessa famiglia */
export const C = {
  night: "#16301B",
  basil: "#2F7D3A",
  tomato: "#E2542C",
  lemon: "#F5D547",
  milk: "#F3F6EE",
  ink: "#14231A",
};

export const Section = ({ id, className = "", children }: { id?: string; className?: string; children: React.ReactNode }) => (
  <section id={id} className={`scroll-mt-16 ${className}`}>
    <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">{children}</div>
  </section>
);

export const H2 = ({ children, light = false, className = "" }: { children: React.ReactNode; light?: boolean; className?: string }) => (
  <h2
    className={`font-display text-[36px] font-extrabold leading-[1.02] tracking-[-0.02em] [text-wrap:balance] md:text-[56px] ${
      light ? "text-white" : "text-[#14231A]"
    } ${className}`}
  >
    {children}
  </h2>
);

const STEPS = [
  { title: "Fotografi lo scontrino", text: "O detti la spesa a voce. I prodotti entrano in dispensa con prezzo e scadenza.", screen: <ReceiptScreen /> },
  { title: "Vedi cosa scade", text: "Ogni prodotto ha i suoi giorni. La mattina ti arriva l'avviso di cosa usare.", screen: <PantryScreen /> },
  { title: "Cucini quello che hai", text: "EcoChef propone ricette partendo da ciò che scade prima, per le persone che vuoi.", screen: <RecipeScreen /> },
];

const FEATURES = [
  { icon: Refrigerator, title: "Dispensa e scadenze", text: "Frigo, dispensa e freezer, con i giorni che mancano." },
  { icon: Receipt, title: "Scontrino in una foto", text: "La spesa entra da sola, con i prezzi." },
  { icon: Mic, title: "Spesa a voce", text: "«Latte, sei uova e due etti di prosciutto»." },
  { icon: Bell, title: "Avvisi del mattino", text: "Cosa usare oggi, prima che si rovini." },
  { icon: ChefHat, title: "EcoChef", text: "Ricette e menu della settimana con quello che hai." },
  { icon: ShoppingCart, title: "Lista della spesa", text: "Una per tutta la casa, anche a voce." },
  { icon: BookOpen, title: "Ricettario", text: "Le ricette salvate, con voti e foto dei piatti." },
  { icon: Wallet, title: "Le mie spese", text: "Quanto spendi e quanto vale il cibo buttato." },
  { icon: Users, title: "Casa condivisa", text: "Famiglia o coinquilini, stessa dispensa." },
];

const GIFTS = [
  {
    icon: Landmark,
    who: "Comuni",
    to: "partner" as const,
    hash: "comuni",
    title: "Un regalo ai cittadini",
    text: "Un anno di EcoDispensa alle famiglie del territorio: meno rifiuti da smaltire e un passo concreto verso l'obiettivo europeo di −30% di spreco.",
  },
  {
    icon: Building2,
    who: "Aziende",
    to: "partner" as const,
    hash: "aziende",
    title: "Un benefit per chi lavora con voi",
    text: "Un abbonamento per ogni dipendente: un welfare utile tutti i giorni, che fa risparmiare le famiglie e racconta il vostro impegno.",
  },
  {
    icon: GraduationCap,
    who: "Scuole",
    to: "scuola" as const,
    hash: undefined,
    title: "La gara a chi spreca meno",
    text: "Con il Progetto Scuola le famiglie degli alunni ricevono l'app e le classi si sfidano: vince chi butta meno cibo.",
  },
];

const PLANS = [
  {
    name: "Gratis",
    price: "0 €",
    note: "per sempre",
    items: ["Dispensa con avvisi di scadenza", "Lista della spesa, anche a voce", "Ricettario", "5 crediti EcoChef in regalo"],
    strong: false,
  },
  {
    name: "Premium",
    price: "4,99 €",
    note: "al mese, disdici quando vuoi",
    items: ["Tutto quello del piano gratis", "25 crediti EcoChef ogni mese", "Lettura dello scontrino"],
    strong: true,
  },
  {
    name: "Premium annuale",
    price: "41,99 €",
    note: "all'anno, come 3,50 € al mese",
    items: ["Tutto il Premium", "Paghi una volta sola", "Risparmi più di 17 € l'anno"],
    strong: false,
  },
];

const FAQ = [
  { q: "Serve l'email per iscriversi?", a: "No. Bastano un username e una password. Nel Profilo trovi un codice di recupero: salvalo, serve se dimentichi la password." },
  { q: "Funziona su iPhone e Android?", a: "Sì. EcoDispensa si apre dal browser e si installa sulla schermata Home come una normale app, senza passare dagli store." },
  { q: "Cosa sono i crediti EcoChef?", a: "Sono la moneta di EcoChef: ogni 4 richieste di ricette usi 1 credito, il menu della settimana ne usa 4. Se qualcosa va storto, i crediti tornano indietro." },
  { q: "Dove finiscono i miei dati?", a: "Su server in Europa. Non vendiamo dati, non mostriamo pubblicità e all'intelligenza artificiale non inviamo mai il tuo username." },
  { q: "Posso ricevere EcoDispensa in regalo?", a: "Sì, se il tuo Comune, la tua azienda o la scuola dei tuoi figli aderisce: ricevi un codice e hai un anno di Premium senza pagare." },
];

const Faq = () => {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="divide-y divide-[#14231A]/10 border-y border-[#14231A]/10">
      {FAQ.map((f, i) => (
        <li key={f.q}>
          <button
            type="button"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-4 py-5 text-left font-display text-[19px] font-bold text-[#14231A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F7D3A]"
          >
            {f.q}
            <ChevronDown size={22} className={`shrink-0 text-[#2F7D3A] transition-transform ${open === i ? "rotate-180" : ""}`} />
          </button>
          {open === i && <p className="max-w-2xl pb-6 text-[16px] leading-relaxed text-[#3B4A3E]">{f.a}</p>}
        </li>
      ))}
    </ul>
  );
};

export const SiteHome = () => (
  <main>
    {/* ---------- Apertura: lo scontrino diventa dispensa ---------- */}
    <section className="relative overflow-hidden bg-[#16301B] text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-12 md:grid-cols-[1.05fr_1fr] md:px-8 md:pb-28 md:pt-20">
        <div className="flex flex-col gap-7">
          <h1 className="font-display text-[50px] font-extrabold leading-[0.95] tracking-[-0.03em] [text-wrap:balance] md:text-[84px]">
            Smetti di buttare il cibo. E i soldi.
          </h1>
          <p className="max-w-[30rem] text-[18px] leading-relaxed text-[#CFE0C9] md:text-[20px]">
            Fotografi lo scontrino, EcoDispensa ti dice cosa scade e cosa cucinare con quello che hai già in casa.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => openApp()}
              className="inline-flex h-14 items-center gap-2 rounded-2xl bg-[#F5D547] px-7 text-[16px] font-bold text-[#14231A] transition hover:bg-[#FFE36B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Prova gratis <ArrowRight size={19} />
            </button>
            <SiteLink to="home" hash="come-funziona" className="inline-flex h-14 items-center px-3 text-[16px] font-bold text-white underline-offset-4 hover:underline">
              Guarda come funziona
            </SiteLink>
          </div>
          <p className="flex items-center gap-2 text-[15px] text-[#CFE0C9]">
            <Check size={18} className="text-[#F5D547]" /> Gratis, senza email e senza carta di credito
          </p>
        </div>

        <div className="relative mx-auto h-[600px] w-[300px] md:mr-0 md:h-[640px] md:w-[320px]">
          <Phone className="absolute inset-0">
            <HomeScreen animate />
          </Phone>
          <PaperReceipt className="absolute -left-56 top-28 hidden md:block" />
        </div>
      </div>
    </section>

    {/* ---------- Il problema: il numero è la notizia ---------- */}
    <section className="bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-[1.2fr_1fr] md:items-end md:px-8 md:py-28">
        <div>
          <p className="font-display text-[120px] font-extrabold leading-[0.85] tracking-[-0.05em] text-[#E2542C] md:text-[200px]">554 g</p>
          <p className="mt-4 max-w-md font-display text-[26px] font-bold leading-tight text-[#14231A] md:text-[32px]">
            di cibo buttato da ognuno di noi, ogni settimana.
          </p>
        </div>
        <div className="flex flex-col gap-6 text-[17px] leading-relaxed text-[#3B4A3E]">
          <p>
            Quasi sempre per dimenticanza: un prodotto in fondo al frigo, una spesa fatta senza sapere cosa c'era già. In un anno le
            famiglie italiane buttano cibo per <b className="text-[#14231A]">7,4 miliardi di euro</b>.
          </p>
          <p>
            I più giovani sprecano più del doppio dei più anziani: <b className="text-[#14231A]">799 g</b> a settimana contro 352 g.
          </p>
          <p className="text-[13px] text-[#6B776C]">Fonte: Osservatorio Waste Watcher International, «Il caso Italia 2026».</p>
        </div>
      </div>
    </section>

    {/* ---------- Come funziona: tre schermate vere ---------- */}
    <Section id="come-funziona" className="bg-[#F3F6EE]">
      <H2 className="max-w-3xl">Dalla borsa della spesa al piatto, in tre passi.</H2>
      <ol className="mt-14 grid gap-14 md:grid-cols-3 md:gap-8">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col items-center gap-6 md:items-start">
            <Phone className="h-[500px] w-[250px]">{s.screen}</Phone>
            <div className="max-w-[18rem]">
              <p className="flex items-center gap-3 font-display text-[22px] font-extrabold text-[#14231A]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2F7D3A] text-[16px] text-white">{i + 1}</span>
                {s.title}
              </p>
              <p className="mt-2 text-[16px] leading-relaxed text-[#3B4A3E]">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>

    {/* ---------- Funzioni ---------- */}
    <Section className="bg-white">
      <div className="grid gap-12 md:grid-cols-[1fr_1.6fr]">
        <div className="flex flex-col gap-5">
          <H2>Tutto quello che serve in cucina.</H2>
          <SiteLink to="guida" className="inline-flex items-center gap-1.5 self-start text-[16px] font-bold text-[#2F7D3A] hover:underline">
            Leggi la guida passo per passo <ArrowRight size={17} />
          </SiteLink>
        </div>
        <ul className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <Icon size={24} className="mt-0.5 shrink-0 text-[#2F7D3A]" />
              <span>
                <span className="block font-bold text-[#14231A]">{title}</span>
                <span className="block text-[15px] leading-snug text-[#5A675C]">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>

    {/* ---------- Regala EcoDispensa: Comuni, aziende, scuole ---------- */}
    <section id="regala" className="scroll-mt-16 bg-[#F5D547]">
      <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
        <H2 className="max-w-3xl">Regala EcoDispensa a chi vuoi far risparmiare.</H2>
        <p className="mt-5 max-w-2xl text-[18px] leading-relaxed text-[#2E3A1E]">
          Comuni, aziende e scuole possono offrire un anno di app completa a cittadini, dipendenti e famiglie. Noi pensiamo ai codici,
          voi date il regalo.
        </p>
        <ul className="mt-12 grid gap-px overflow-hidden rounded-[28px] bg-[#14231A]/15 md:grid-cols-3">
          {GIFTS.map(({ icon: Icon, who, title, text, to, hash }) => (
            <li key={who} className="flex flex-col gap-3 bg-[#FBEA9A] p-7">
              <span className="flex items-center gap-2 text-[15px] font-bold text-[#2F7D3A]">
                <Icon size={20} /> {who}
              </span>
              <h3 className="font-display text-[24px] font-extrabold leading-tight text-[#14231A]">{title}</h3>
              <p className="text-[16px] leading-relaxed text-[#2E3A1E]">{text}</p>
              <SiteLink to={to} hash={hash} className="mt-auto inline-flex items-center gap-1.5 pt-2 font-bold text-[#14231A] underline-offset-4 hover:underline">
                {who === "Scuole" ? "Scopri il Progetto Scuola" : "Scopri di più"} <ArrowRight size={17} />
              </SiteLink>
            </li>
          ))}
        </ul>
        <SiteLink
          to="partner"
          className="mt-10 inline-flex h-14 items-center gap-2 rounded-2xl bg-[#14231A] px-7 text-[16px] font-bold text-white hover:bg-[#16301B]"
        >
          Chiedici una proposta <ArrowRight size={19} />
        </SiteLink>
      </div>
    </section>

    {/* ---------- Prezzi ---------- */}
    <Section id="prezzi" className="bg-white">
      <H2 className="max-w-3xl">Inizi gratis. Passi a Premium solo se ti serve.</H2>
      <ul className="mt-12 grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => (
          <li
            key={p.name}
            className={`flex flex-col gap-4 rounded-[28px] p-7 ${p.strong ? "bg-[#16301B] text-white" : "border-2 border-[#14231A]/10 text-[#14231A]"}`}
          >
            <p className={`font-bold ${p.strong ? "text-[#F5D547]" : "text-[#2F7D3A]"}`}>{p.name}</p>
            <p className="font-display text-[52px] font-extrabold leading-none tracking-[-0.02em]">{p.price}</p>
            <p className={`text-[15px] ${p.strong ? "text-[#CFE0C9]" : "text-[#5A675C]"}`}>{p.note}</p>
            <ul className="flex flex-col gap-2.5 pt-2">
              {p.items.map((it) => (
                <li key={it} className="flex items-start gap-2 text-[16px]">
                  <Check size={19} className={`mt-0.5 shrink-0 ${p.strong ? "text-[#F5D547]" : "text-[#2F7D3A]"}`} />
                  {it}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[14px] text-[#5A675C]">Prezzi IVA inclusa. Ricariche di crediti EcoChef disponibili nell'app.</p>
    </Section>

    {/* ---------- Domande ---------- */}
    <Section className="bg-[#F3F6EE]">
      <div className="grid gap-10 md:grid-cols-[1fr_1.6fr]">
        <H2>Domande frequenti</H2>
        <Faq />
      </div>
    </Section>

    {/* ---------- Chiusura ---------- */}
    <section className="bg-[#16301B]">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-5 py-20 md:flex-row md:items-center md:justify-between md:px-8">
        <h2 className="max-w-2xl font-display text-[38px] font-extrabold leading-[1.02] tracking-[-0.02em] text-white md:text-[52px]">
          Il prossimo cibo che salvi è già nel tuo frigo.
        </h2>
        <PrimaryButton onClick={() => openApp()} className="!h-14 !bg-[#F5D547] !px-7 !text-[16px] !text-[#14231A] hover:!bg-[#FFE36B]">
          Prova gratis <ArrowRight size={19} />
        </PrimaryButton>
      </div>
    </section>
  </main>
);
