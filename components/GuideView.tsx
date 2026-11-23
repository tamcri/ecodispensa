import React from "react";
import { ChevronDown, Mail } from "lucide-react";
import { GUIDE_CHAPTERS, GUIDE_FAQ, GUIDE_HELP_EMAIL } from "../guide/content";

/** Profilo → Aiuto e guida: la stessa guida del sito, in versione da telefono */
export const GuideView = () => (
  <div className="flex flex-col gap-5">
    <p className="px-1 text-[15px] leading-relaxed text-muted">Tocca un argomento per aprirlo.</p>

    <div className="overflow-hidden rounded-[20px] bg-white">
      {GUIDE_CHAPTERS.map(({ id, icon: Icon, title, lead, steps, tip, shots }) => (
        <details key={id} className="group border-b border-[#F1EBDD] last:border-b-0">
          <summary className="flex min-h-[54px] cursor-pointer list-none items-center gap-3 px-3.5 py-2 [&::-webkit-details-marker]:hidden">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-mint text-forest">
              <Icon size={18} />
            </span>
            <span className="flex-1 text-[15px] font-semibold text-ink">{title}</span>
            <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-3 px-3.5 pb-4">
            <p className="text-[14px] leading-relaxed text-ink">{lead}</p>
            <ol className="flex flex-col gap-2.5">
              {steps.map((s, n) => (
                <li key={s} className="flex gap-2.5 text-[14px] leading-relaxed text-ink">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-honey text-xs font-extrabold text-ink">{n + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            {tip && <p className="rounded-2xl bg-mint p-3 text-[13px] leading-relaxed text-ink">{tip}</p>}
            {shots?.length ? (
              <div className="-mx-3.5 flex gap-3 overflow-x-auto px-3.5 pb-1">
                {shots.map((s) => (
                  <img
                    key={s.src}
                    src={s.src}
                    alt={s.alt}
                    width={440}
                    height={880}
                    loading="lazy"
                    decoding="async"
                    className="h-auto w-[150px] shrink-0 rounded-2xl border border-[#E8E0CF]"
                  />
                ))}
              </div>
            ) : null}
          </div>
        </details>
      ))}
    </div>

    <div>
      <p className="mb-1.5 ml-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">Domande frequenti</p>
      <div className="overflow-hidden rounded-[20px] bg-white">
        {GUIDE_FAQ.map((f) => (
          <details key={f.q} className="group border-b border-[#F1EBDD] last:border-b-0">
            <summary className="flex min-h-[54px] cursor-pointer list-none items-center gap-3 px-3.5 py-2 [&::-webkit-details-marker]:hidden">
              <span className="flex-1 text-[15px] font-semibold text-ink">{f.q}</span>
              <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-3.5 pb-4 text-[14px] leading-relaxed text-ink">{f.a}</p>
          </details>
        ))}
      </div>
    </div>

    <a href={`mailto:${GUIDE_HELP_EMAIL}`} className="flex items-center gap-3 rounded-2xl bg-white p-4 text-[14px] text-ink">
      <Mail size={18} className="shrink-0 text-forest" />
      <span>
        Non trovi la risposta? Scrivici a <b className="text-forest">{GUIDE_HELP_EMAIL}</b>
      </span>
    </a>
  </div>
);
