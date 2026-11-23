import React from "react";

/**
 * Il telefono del sito, con dentro le schermate vere dell'app (le stesse della guida, in /public/guida).
 */

export const Phone = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`relative rounded-[44px] bg-[#14231A] p-[10px] shadow-[0_40px_80px_-20px_rgba(10,25,14,0.55)] ${className}`}>
    <div className="flex h-full flex-col overflow-hidden rounded-[34px] bg-[#FAF5EA]">{children}</div>
  </div>
);

/** Una schermata vera dell'app, adattata alla sagoma del telefono (si vede dall'alto) */
export const Screen = ({ name, alt, eager = false }: { name: string; alt: string; eager?: boolean }) => (
  <img
    src={`/guida/${name}.webp`}
    alt={alt}
    width={440}
    height={880}
    loading={eager ? "eager" : "lazy"}
    decoding="async"
    className="h-full w-full object-cover object-top"
  />
);

/** Lo scontrino di carta che "stampa" le righe all'apertura della pagina */
export const PaperReceipt = ({ className = "" }: { className?: string }) => {
  const lines: Array<[string, string]> = [
    ["INSALATA", "1,19"],
    ["MOZZARELLA 1KG", "7,90"],
    ["UOVA X4", "1,89"],
    ["FORMAGGIO SPALM.", "1,99"],
  ];
  return (
    <div className={`site-receipt w-[200px] bg-white px-4 pb-5 pt-4 font-mono text-[11px] text-[#2B2B2B] shadow-[0_24px_50px_-12px_rgba(0,0,0,0.45)] ${className}`} aria-hidden="true">
      <p className="text-center font-bold">SUPERMERCATO</p>
      <p className="mb-2 text-center text-[10px] text-[#777]">21/11/2026 18:42</p>
      {lines.map(([n, p], i) => (
        <p key={n} className="site-print flex justify-between" style={{ animationDelay: `${0.5 + i * 0.3}s` }}>
          <span>{n}</span>
          <span>{p}</span>
        </p>
      ))}
      <p className="site-print mt-2 flex justify-between border-t border-dashed border-[#999] pt-2 font-bold" style={{ animationDelay: "1.7s" }}>
        <span>TOTALE €</span>
        <span>12,97</span>
      </p>
    </div>
  );
};
