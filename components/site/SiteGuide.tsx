import React from "react";
import { ArrowRight, BookOpen, ChefHat, Home, Refrigerator, ShoppingCart, Smartphone, UserRound } from "lucide-react";
import { openApp } from "./SiteApp";

type Chapter = {
  id: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  lead: string;
  steps: string[];
  tip?: string;
};

const CHAPTERS: Chapter[] = [
  {
    id: "installa",
    icon: Smartphone,
    title: "Installa l'app",
    lead: "EcoDispensa si apre dal browser e si mette sulla schermata Home come un'app normale, senza store.",
    steps: [
      "Apri ecodispensa.it/app dal telefono.",
      "Android (Chrome): menu con i tre puntini → «Installa app».",
      "iPhone (Safari): tasto Condividi → «Aggiungi alla schermata Home».",
      "Crea l'account con username e password: non serve l'email.",
      "Dal Profilo salva il codice di recupero: serve se dimentichi la password.",
    ],
  },
  {
    id: "dispensa",
    icon: Refrigerator,
    title: "Riempi la dispensa",
    lead: "La dispensa è il cuore dell'app: più è aggiornata, più gli avvisi e le ricette sono giusti.",
    steps: [
      "Dopo la spesa tocca «Scontrino» e fotografalo: i prodotti entrano da soli, con i prezzi (con Premium).",
      "Oppure tocca «A voce» e detta: «latte, sei uova, due etti di prosciutto».",
      "Puoi anche aggiungere un prodotto a mano, leggere il codice a barre o fotografare la data di scadenza.",
      "Controlla la lista che ti propone l'app, correggi se serve e conferma.",
    ],
    tip: "Le scadenze che l'app propone sono indicative: per i prodotti confezionati controlla sempre la data sulla confezione.",
  },
  {
    id: "oggi",
    icon: Home,
    title: "Ogni giorno: cosa scade",
    lead: "La schermata «Oggi» ti dice cosa usare prima che si rovini.",
    steps: [
      "In alto trovi i prodotti che scadono nei prossimi giorni.",
      "Attiva le notifiche dal Profilo: la mattina ricevi un avviso se qualcosa sta per scadere.",
      "Quando un prodotto finisce tocca «Finito» e scegli «L'ho usato» oppure «L'ho buttato».",
    ],
    tip: "Segnare cosa butti non è una colpa: serve a vedere quanto risparmi mese dopo mese.",
  },
  {
    id: "spesa",
    icon: ShoppingCart,
    title: "La lista della spesa",
    lead: "Una lista sola per tutta la casa, che si aggiorna mentre fai la spesa.",
    steps: [
      "Scrivi i prodotti o dettali a voce con il microfono.",
      "Al supermercato spunta quello che metti nel carrello.",
      "Dalle ricette puoi aggiungere con un tocco gli ingredienti che mancano.",
    ],
  },
  {
    id: "ecochef",
    icon: ChefHat,
    title: "Cucina con EcoChef",
    lead: "EcoChef propone ricette con quello che hai, partendo da ciò che scade prima.",
    steps: [
      "Scegli per quante persone cucini e quanto tempo hai.",
      "Chiedi tre idee con la tua dispensa, oppure cerca un piatto preciso, per esempio «spaghetti alla puttanesca».",
      "Con «Menu» prepari il menu della settimana e la lista della spesa che serve.",
      "Nella ricetta trovi gli ingredienti con le quantità, cosa hai già e cosa manca.",
    ],
    tip: "Ogni 4 richieste di ricette usi 1 credito; il menu della settimana ne usa 4. Imposta dieta, allergie e ingredienti da evitare nel Profilo, in «Preferenze di EcoChef».",
  },
  {
    id: "ricette",
    icon: BookOpen,
    title: "Il ricettario",
    lead: "Le ricette che ti piacciono restano salvate, con i tuoi voti e le foto dei piatti.",
    steps: [
      "Tocca «Sì, la preparo» per mettere in programma una ricetta.",
      "Dopo averla cucinata tocca «L'ho cucinato!»: l'app toglie dalla dispensa le quantità usate.",
      "Dai un voto, aggiungi la foto del piatto e, se vuoi, condividila o sfida un amico.",
    ],
  },
  {
    id: "profilo",
    icon: UserRound,
    title: "Profilo, famiglia e spese",
    lead: "Dal Profilo gestisci la casa condivisa, il piano e i tuoi dati.",
    steps: [
      "«Famiglia»: invita chi vive con te, così vedete la stessa dispensa e la stessa lista.",
      "«Le mie spese» in Home: quanto spendi ogni mese e quanto vale il cibo buttato.",
      "«Ho un codice · Invita un amico»: inserisci un codice regalo, per esempio quello del Progetto Scuola.",
      "«Privacy e i miei dati»: documenti, e l'eliminazione dell'account quando vuoi.",
    ],
  },
];

export const SiteGuide = () => (
  <main>
    <section className="bg-[#16301B] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-14 md:px-8 md:py-20">
        <h1 className="max-w-3xl font-display text-[46px] font-extrabold leading-[0.97] tracking-[-0.03em] [text-wrap:balance] md:text-[76px]">
          EcoDispensa in sette passi.
        </h1>
        <p className="max-w-2xl text-[18px] leading-relaxed text-[#CFE0C9]">
          Dall'installazione alla prima ricetta: tutto quello che serve per non buttare più il cibo che compri.
        </p>
        <nav aria-label="Capitoli della guida" className="flex flex-wrap gap-2 pt-2">
          {CHAPTERS.map((c, i) => (
            <a key={c.id} href={`#${c.id}`} className="rounded-full bg-white/10 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/20">
              {i + 1}. {c.title}
            </a>
          ))}
        </nav>
      </div>
    </section>

    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-14 md:px-8">
      {CHAPTERS.map(({ id, icon: Icon, title, lead, steps, tip }, i) => (
        <section key={id} id={id} className="scroll-mt-20 rounded-[28px] border-2 border-[#14231A]/10 bg-white p-6 md:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F3F6EE] text-[#2F7D3A]">
              <Icon size={24} />
            </span>
            <div>
              <p className="text-sm font-bold text-[#2F7D3A]">Passo {i + 1}</p>
              <h2 className="font-display text-[26px] font-extrabold leading-tight text-[#14231A]">{title}</h2>
            </div>
          </div>
          <p className="mt-4 text-[16px] leading-relaxed text-[#3D4A3B]">{lead}</p>
          <ol className="mt-4 flex flex-col gap-3">
            {steps.map((s, n) => (
              <li key={s} className="flex gap-3 text-[15px] leading-relaxed text-ink">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F5D547] text-sm font-extrabold">
                  {n + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          {tip && <p className="mt-5 rounded-2xl bg-[#F3F6EE] p-4 text-[14px] leading-relaxed text-[#3D4A3B]">{tip}</p>}
        </section>
      ))}

      <div className="flex flex-col items-start gap-4 rounded-[28px] bg-[#16301B] p-6 text-white md:flex-row md:items-center md:justify-between md:p-8">
        <p className="font-display text-[24px] font-extrabold leading-tight">Pronto a provarla?</p>
        <button
          type="button"
          onClick={() => openApp()}
          className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#F5D547] px-6 text-[15px] font-bold text-[#14231A] hover:bg-[#FFE36B]"
        >
          Apri EcoDispensa <ArrowRight size={18} />
        </button>
      </div>
    </div>
  </main>
);
