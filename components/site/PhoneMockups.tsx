import React from "react";
import { BookOpen, ChefHat, Home, Refrigerator, ShoppingCart } from "lucide-react";

/**
 * Schermate dell'app disegnate in HTML, con gli stessi colori e caratteri dell'app vera:
 * restano nitide a ogni dimensione e si aggiornano insieme al sito.
 */

type Tone = "red" | "amber" | "green";
const TONE: Record<Tone, string> = {
  red: "bg-[#F8DDD2] text-[#8E3418]",
  amber: "bg-[#FBEBC4] text-[#6E5208]",
  green: "bg-[#E3EBDB] text-[#2F4A2C]",
};
const DOT: Record<Tone, string> = { red: "bg-[#C2502A]", amber: "bg-[#E0A92E]", green: "bg-[#6F8F66]" };

export const Phone = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`relative rounded-[44px] bg-[#14231A] p-[10px] shadow-[0_40px_80px_-20px_rgba(10,25,14,0.55)] ${className}`}
    role="img"
    aria-label="Schermata dell'app EcoDispensa"
  >
    <div className="absolute left-1/2 top-[18px] z-10 h-[22px] w-[90px] -translate-x-1/2 rounded-full bg-[#14231A]" aria-hidden="true" />
    <div className="flex h-full flex-col overflow-hidden rounded-[34px] bg-[#FAF5EA] font-sans text-[#1F2A1E]">{children}</div>
  </div>
);

const StatusBar = () => (
  <div className="flex h-11 shrink-0 items-end justify-between px-6 pb-1 text-[11px] font-bold" aria-hidden="true">
    <span>8:12</span>
    <span className="tracking-tight">5G ▮▮▮</span>
  </div>
);

const Row = ({
  name,
  note,
  tone,
  chip,
  className = "",
  style,
}: {
  name: string;
  note?: string;
  tone: Tone;
  chip: string;
  className?: string;
  style?: React.CSSProperties;
}) => (
  <div className={`flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 ${className}`} style={style}>
    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[tone]}`} />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13px] font-bold">{name}</span>
      {note && <span className="block truncate text-[11px] text-[#5F6A5C]">{note}</span>}
    </span>
    <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-extrabold ${TONE[tone]}`}>{chip}</span>
  </div>
);

const TabBar = ({ active }: { active: "home" | "spesa" | "chef" | "dispensa" | "ricette" }) => {
  const tabs = [
    ["home", Home],
    ["spesa", ShoppingCart],
    ["chef", ChefHat],
    ["dispensa", Refrigerator],
    ["ricette", BookOpen],
  ] as const;
  return (
    <div className="mt-auto flex h-14 shrink-0 items-center justify-around border-t border-black/5 bg-white" aria-hidden="true">
      {tabs.map(([id, Icon]) =>
        id === "chef" ? (
          <span key={id} className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-[#4F6B4A] text-white shadow-lg">
            <Icon size={22} />
          </span>
        ) : (
          <Icon key={id} size={19} className={id === active ? "text-[#2F4A2C]" : "text-[#A3AC9F]"} />
        )
      )}
    </div>
  );
};

/** Schermata "Oggi": cosa scade. Con `animate` i prodotti arrivano uno alla volta, dopo lo scontrino. */
export const HomeScreen = ({ animate = false }: { animate?: boolean }) => {
  const rows: Array<[string, string, Tone, string]> = [
    ["Latte fresco", "Frigo", "red", "oggi"],
    ["Zucchine", "Frigo · 3 pz", "amber", "2 giorni"],
    ["Yogurt greco", "Frigo · 2 pz", "amber", "3 giorni"],
    ["Uova", "Frigo · 6 pz", "green", "12 giorni"],
  ];
  return (
    <>
      <StatusBar />
      <div className="flex flex-1 flex-col gap-3 px-4 pt-2">
        <div>
          <p className="text-[12px] font-semibold text-[#5F6A5C]">Mercoledì 18 novembre</p>
          <p className="font-display text-[24px] font-extrabold leading-tight">Ciao Marta!</p>
        </div>
        <div className="rounded-3xl bg-[#2F4A2C] p-3.5 text-white">
          <p className="text-[11px] font-semibold text-[#CFDCC6]">Questo mese hai salvato</p>
          <p className="font-display text-[26px] font-extrabold leading-none text-[#F6DC8E]">23 prodotti</p>
        </div>
        <p className="pt-1 text-[12px] font-extrabold text-[#2F4A2C]">Da usare presto</p>
        <div className="flex flex-col gap-2">
          {rows.map(([n, note, t, c], i) => (
            <Row
              key={n}
              name={n}
              note={note}
              tone={t}
              chip={c}
              className={animate ? "site-arrive" : ""}
              // arrivano dopo le righe dello scontrino
              style={animate ? { animationDelay: `${1.9 + i * 0.25}s` } : undefined}
            />
          ))}
        </div>
        <div className={`flex items-center gap-2.5 rounded-2xl bg-[#FBEBC4] px-3 py-2.5 ${animate ? "site-arrive" : ""}`} style={animate ? { animationDelay: "3.1s" } : undefined}>
          <ChefHat size={18} className="shrink-0 text-[#6E5208]" />
          <span className="text-[12px] font-bold leading-snug">Frittata di zucchine, 15 min: usa 3 prodotti in scadenza</span>
        </div>
      </div>
      <TabBar active="home" />
    </>
  );
};

/** Schermata dello scontrino letto */
export const ReceiptScreen = () => (
  <>
    <StatusBar />
    <div className="flex flex-1 flex-col gap-3 px-4 pt-2">
      <p className="font-display text-[22px] font-extrabold leading-tight">Ho letto 5 prodotti</p>
      <p className="-mt-2 text-[12px] text-[#5F6A5C]">Conad · 18 nov · totale 14,62 €</p>
      {[
        ["Petto di pollo", "6,90 €"],
        ["Spinaci freschi", "1,99 €"],
        ["Mozzarella", "1,49 €"],
        ["Pane integrale", "2,30 €"],
        ["Mele", "1,94 €"],
      ].map(([n, p]) => (
        <div key={n} className="flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#4F6B4A] text-[11px] font-extrabold text-white">✓</span>
          <span className="flex-1 text-[13px] font-bold">{n}</span>
          <span className="text-[12px] font-semibold text-[#5F6A5C]">{p}</span>
        </div>
      ))}
      <div className="mt-auto mb-4 rounded-2xl bg-[#4F6B4A] py-3 text-center text-[13px] font-bold text-white">Aggiungi alla dispensa</div>
    </div>
  </>
);

/** Schermata della dispensa */
export const PantryScreen = () => (
  <>
    <StatusBar />
    <div className="flex flex-1 flex-col gap-3 px-4 pt-2">
      <p className="font-display text-[22px] font-extrabold leading-tight">Dispensa</p>
      <div className="flex gap-1.5 text-[11px] font-bold">
        <span className="rounded-full bg-[#2F4A2C] px-2.5 py-1 text-white">Frigo</span>
        <span className="rounded-full bg-white px-2.5 py-1">Dispensa</span>
        <span className="rounded-full bg-white px-2.5 py-1">Freezer</span>
      </div>
      <Row name="Spinaci freschi" note="250 g" tone="red" chip="domani" />
      <Row name="Mozzarella" note="1 pz" tone="amber" chip="3 giorni" />
      <Row name="Petto di pollo" note="400 g" tone="amber" chip="3 giorni" />
      <Row name="Parmigiano" note="200 g" tone="green" chip="1 mese" />
      <Row name="Pasta" note="320 g" tone="green" chip="8 mesi" />
    </div>
    <TabBar active="dispensa" />
  </>
);

/** Schermata di una ricetta di EcoChef */
export const RecipeScreen = () => (
  <>
    <StatusBar />
    <div className="flex flex-1 flex-col gap-3 px-4 pt-2">
      <p className="text-[12px] font-bold text-[#4F6B4A]">EcoChef per 2 persone</p>
      <p className="-mt-2 font-display text-[22px] font-extrabold leading-tight">Pollo con spinaci e mozzarella</p>
      <div className="flex gap-1.5 text-[11px] font-bold">
        <span className="rounded-full bg-white px-2.5 py-1">25 min</span>
        <span className="rounded-full bg-white px-2.5 py-1">Facile</span>
      </div>
      <div className="flex flex-col divide-y divide-black/5 rounded-2xl bg-white px-3 text-[12px]">
        {[
          ["300 g", "Petto di pollo"],
          ["250 g", "Spinaci freschi"],
          ["1", "Mozzarella"],
          ["1 spicchio", "Aglio"],
        ].map(([q, n]) => (
          <div key={n} className="flex gap-2 py-2">
            <span className="w-16 shrink-0 font-extrabold">{q}</span>
            <span>{n}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] font-extrabold text-[#42593D]">Dalla tua dispensa</p>
      <div className="-mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
        {["Petto di pollo", "Spinaci", "Mozzarella"].map((n) => (
          <span key={n} className="rounded-lg bg-[#E3EBDB] px-2 py-1 text-[#2F4A2C]">
            {n}
          </span>
        ))}
      </div>
      <div className="mt-auto mb-4 rounded-2xl bg-[#4F6B4A] py-3 text-center text-[13px] font-bold text-white">L'ho cucinato!</div>
    </div>
  </>
);

/** Lo scontrino di carta che "stampa" le righe all'apertura della pagina */
export const PaperReceipt = ({ className = "" }: { className?: string }) => {
  const lines: Array<[string, string]> = [
    ["LATTE FRESCO", "1,29"],
    ["ZUCCHINE", "1,80"],
    ["YOGURT GRECO X2", "2,10"],
    ["UOVA X6", "2,49"],
  ];
  return (
    <div className={`site-receipt w-[200px] bg-white px-4 pb-5 pt-4 font-mono text-[11px] text-[#2B2B2B] shadow-[0_24px_50px_-12px_rgba(0,0,0,0.45)] ${className}`} aria-hidden="true">
      <p className="text-center font-bold">SUPERMERCATO</p>
      <p className="mb-2 text-center text-[10px] text-[#777]">18/11/2026 18:42</p>
      {lines.map(([n, p], i) => (
        <p key={n} className="site-print flex justify-between" style={{ animationDelay: `${0.5 + i * 0.3}s` }}>
          <span>{n}</span>
          <span>{p}</span>
        </p>
      ))}
      <p className="site-print mt-2 flex justify-between border-t border-dashed border-[#999] pt-2 font-bold" style={{ animationDelay: "1.7s" }}>
        <span>TOTALE €</span>
        <span>7,68</span>
      </p>
    </div>
  );
};
