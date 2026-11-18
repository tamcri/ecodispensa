import React from "react";
import { Check, ShieldCheck, Trophy } from "lucide-react";
import { H2, Section } from "./SiteHome";
import { PartnerForm } from "./SitePartner";

const STEPS = [
  { t: "Un partner offre il progetto", d: "Un'azienda del territorio o il Comune: la scuola e le famiglie non pagano niente." },
  { t: "Scegliamo istituto e classi", d: "Per ogni classe, il numero di alunni." },
  { t: "Creiamo un codice per alunno", d: "Arrivano biglietti pronti da stampare, con il QR." },
  { t: "La scuola consegna i biglietti", d: "Il genitore inquadra il QR e si iscrive in un minuto: 12 mesi di app completa." },
  { t: "Le famiglie usano l'app", d: "E, se lo vogliono, partecipano alla classifica della loro classe." },
  { t: "Vince la classe che spreca meno", d: "Report d'impatto per scuola e partner, e premiazione della classe vincitrice." },
];

const RULES = [
  "Conta la percentuale di prodotti buttati, non i chili: una classe piccola può battere una grande.",
  "Una classe entra in classifica con almeno 3 famiglie attive e il 30% della classe.",
  "La classifica si vede nell'app delle famiglie, per mese e per anno scolastico.",
];

export const SiteSchool = () => (
  <main>
    <section className="bg-[#16301B] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-16 md:px-8 md:py-24">
        <h1 className="max-w-4xl font-display text-[46px] font-extrabold leading-[0.97] tracking-[-0.03em] [text-wrap:balance] md:text-[76px]">
          Il Progetto Scuola: vince la classe che spreca meno.
        </h1>
        <p className="max-w-2xl text-[18px] leading-relaxed text-[#CFE0C9] md:text-[20px]">
          Le famiglie degli alunni ricevono un anno di EcoDispensa, offerto da un'azienda o dal Comune, e le classi si sfidano a
          buttare meno cibo. I ragazzi imparano un'abitudine che porteranno con sé per tutta la vita.
        </p>
        <a
          href="#contatti"
          className="inline-flex h-14 items-center self-start rounded-2xl bg-[#F5D547] px-7 text-[16px] font-bold text-[#14231A] hover:bg-[#FFE36B]"
        >
          Porta il progetto nella tua scuola
        </a>
      </div>
    </section>

    {/* Perché partire dai ragazzi: il dato è la notizia */}
    <section className="bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-[1.2fr_1fr] md:items-end md:px-8 md:py-28">
        <div>
          <p className="font-display text-[120px] font-extrabold leading-[0.85] tracking-[-0.05em] text-[#E2542C] md:text-[200px]">799 g</p>
          <p className="mt-4 max-w-md font-display text-[26px] font-bold leading-tight text-[#14231A] md:text-[32px]">
            di cibo buttato ogni settimana dai più giovani: più del doppio degli adulti più anziani.
          </p>
        </div>
        <div className="flex flex-col gap-6 text-[17px] leading-relaxed text-[#3B4A3E]">
          <p>
            Gli sprechi nascono da abitudini: dimenticare cosa c'è in frigo, comprare a occhio. Le abitudini si imparano in famiglia,
            e a scuola si possono cambiare.
          </p>
          <p>
            Con EcoDispensa la gara è concreta: ogni prodotto usato invece che buttato fa salire la classe in classifica.
          </p>
          <p className="text-[13px] text-[#6B776C]">Fonte: Osservatorio Waste Watcher International, «Il caso Italia 2026».</p>
        </div>
      </div>
    </section>

    <Section className="bg-[#F3F6EE]">
      <div className="grid gap-10 md:grid-cols-[1fr_1.3fr]">
        <H2>Come funziona</H2>
        <ol className="flex flex-col gap-6">
          {STEPS.map((s, i) => (
            <li key={s.t} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2F7D3A] font-display font-extrabold text-white">
                {i + 1}
              </span>
              <span>
                <span className="block font-display text-[20px] font-bold text-[#14231A]">{s.t}</span>
                <span className="block text-[16px] leading-snug text-[#3B4A3E]">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Section>

    <section className="bg-[#F5D547]">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2 md:px-8 md:py-24">
        <div className="flex flex-col gap-6">
          <span className="flex items-center gap-2 text-[16px] font-bold text-[#14231A]">
            <Trophy size={22} /> La classifica
          </span>
          <H2>Una gara giusta tra le classi.</H2>
          <ul className="flex flex-col gap-3">
            {RULES.map((r) => (
              <li key={r} className="flex items-start gap-3 text-[16px] leading-snug text-[#14231A]">
                <Check size={20} className="mt-0.5 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-6">
          <span className="flex items-center gap-2 text-[16px] font-bold text-[#14231A]">
            <ShieldCheck size={22} /> La privacy dei ragazzi
          </span>
          <H2>Nessun dato degli alunni.</H2>
          <ul className="flex flex-col gap-3">
            {[
              "L'account è del genitore: non chiediamo nome, voti o altri dati dei ragazzi.",
              "Partecipare alla classifica è una scelta della famiglia, che può ritirarsi quando vuole.",
              "Scuola, partner e famiglie vedono solo risultati di classe, mai quelli di una singola famiglia.",
            ].map((r) => (
              <li key={r} className="flex items-start gap-3 text-[16px] leading-snug text-[#14231A]">
                <Check size={20} className="mt-0.5 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>

    <Section id="contatti" className="bg-white">
      <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-5">
          <H2>Portiamo il progetto nella vostra scuola.</H2>
          <p className="text-[17px] leading-relaxed text-[#3B4A3E]">
            Siete una scuola, un'azienda o un Comune che vuole offrirlo? Lasciateci i vostri riferimenti e vi ricontattiamo per
            organizzarlo insieme.
          </p>
        </div>
        <PartnerForm initialKind="scuola" />
      </div>
    </Section>
  </main>
);
