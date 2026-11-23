import React from "react";
import { ArrowRight, ChevronDown, Mail } from "lucide-react";
import { openApp } from "./SiteApp";
import { GUIDE_CHAPTERS, GUIDE_FAQ, GUIDE_HELP_EMAIL, GuideShot } from "../../guide/content";

/** Una schermata dell'app dentro la sagoma del telefono */
const Phone = ({ s }: { s: GuideShot }) => (
  <figure className="w-[210px] shrink-0 snap-center sm:w-[230px]">
    <div className="overflow-hidden rounded-[30px] border-[6px] border-[#14231A] bg-[#FBF7EE] shadow-[0_18px_40px_rgba(20,35,26,0.18)]">
      <img src={s.src} alt={s.alt} width={440} height={880} loading="lazy" decoding="async" className="block h-auto w-full" />
    </div>
    <figcaption className="mt-2.5 px-1 text-center text-[13px] leading-snug text-[#5A6B57]">{s.alt}</figcaption>
  </figure>
);

export const SiteGuide = () => (
  <main>
    <section className="bg-[#16301B] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-14 md:px-8 md:py-20">
        <h1 className="max-w-3xl font-display text-[46px] font-extrabold leading-[0.97] tracking-[-0.03em] [text-wrap:balance] md:text-[76px]">
          Come si usa EcoDispensa.
        </h1>
        <p className="max-w-2xl text-[18px] leading-relaxed text-[#CFE0C9]">
          Dall'installazione alla prima ricetta, con le schermate dell'app: tutto quello che serve per non buttare più il cibo che compri.
        </p>
        <nav aria-label="Capitoli della guida" className="flex flex-wrap gap-2 pt-2">
          {GUIDE_CHAPTERS.map((c) => (
            <a key={c.id} href={`#${c.id}`} className="rounded-full bg-white/10 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/20">
              {c.title}
            </a>
          ))}
          <a href="#domande" className="rounded-full bg-[#F5D547] px-3.5 py-2 text-sm font-bold text-[#14231A] hover:bg-[#FFE36B]">
            Domande frequenti
          </a>
        </nav>
      </div>
    </section>

    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-5 py-14 md:px-8">
      {GUIDE_CHAPTERS.map(({ id, icon: Icon, title, lead, steps, tip, shots }) => (
        <section
          key={id}
          id={id}
          className="scroll-mt-20 rounded-[28px] border-2 border-[#14231A]/10 bg-white p-6 md:p-9"
        >
          {/* una schermata: accanto al testo; più schermate: in fila sotto il testo */}
          <div className={shots?.length === 1 ? "flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10" : ""}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F3F6EE] text-[#2F7D3A]">
                  <Icon size={24} />
                </span>
                <h2 className="font-display text-[26px] font-extrabold leading-tight text-[#14231A] [text-wrap:balance]">{title}</h2>
              </div>
              <p className="mt-4 max-w-prose text-[16px] leading-relaxed text-[#3D4A3B]">{lead}</p>
              <ol className="mt-5 flex max-w-prose flex-col gap-3">
                {steps.map((s, n) => (
                  <li key={s} className="flex gap-3 text-[15px] leading-relaxed text-[#14231A]">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F5D547] text-sm font-extrabold">
                      {n + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              {tip && <p className="mt-5 max-w-prose rounded-2xl bg-[#F3F6EE] p-4 text-[14px] leading-relaxed text-[#3D4A3B]">{tip}</p>}
            </div>
            {shots?.length === 1 && (
              <div className="flex justify-center lg:justify-end">
                <Phone s={shots[0]} />
              </div>
            )}
            {shots && shots.length > 1 && (
              <div className="-mx-6 mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-2 md:-mx-9 md:justify-center md:px-9">
                {shots.map((s) => (
                  <Phone key={s.src} s={s} />
                ))}
              </div>
            )}
          </div>
        </section>
      ))}

      <section id="domande" className="scroll-mt-20 pt-6">
        <h2 className="font-display text-[34px] font-extrabold leading-tight tracking-tight text-[#14231A] md:text-[44px]">Domande frequenti</h2>
        <div className="mt-6 flex flex-col gap-3">
          {GUIDE_FAQ.map((f) => (
            <details key={f.q} className="group rounded-[22px] border-2 border-[#14231A]/10 bg-white open:border-[#2F7D3A]/30">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-[17px] font-bold text-[#14231A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F7D3A] [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown size={20} className="shrink-0 text-[#2F7D3A] transition-transform group-open:rotate-180" />
              </summary>
              <p className="max-w-prose px-5 pb-5 text-[15px] leading-relaxed text-[#3D4A3B]">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-2 rounded-[22px] bg-[#F3F6EE] p-5 text-[15px] text-[#3D4A3B] sm:flex-row sm:items-center sm:gap-3">
          <Mail size={20} className="shrink-0 text-[#2F7D3A]" />
          <span>
            Non hai trovato la risposta? Scrivici a{" "}
            <a href={`mailto:${GUIDE_HELP_EMAIL}`} className="font-bold text-[#2F7D3A] underline">
              {GUIDE_HELP_EMAIL}
            </a>
            .
          </span>
        </div>
      </section>

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
