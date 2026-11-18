import React, { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { pageFromPath, SitePage } from "../../site/route";
import { LegalDocId, LEGAL, LEGAL_DOCS } from "../../legal/documents";
import { LegalDocBody } from "../LegalViews";
import { SiteHome } from "./SiteHome";
import { SitePartner } from "./SitePartner";
import { SiteGuide } from "./SiteGuide";

/** Apre l'app (pagina nuova: l'app ha il suo caricamento) */
export const openApp = (params = "") => window.location.assign(`/app${params}`);

type Nav = (to: SitePage, hash?: string) => void;
export const NavContext = React.createContext<Nav>(() => undefined);

const TITLES: Record<SitePage, string> = {
  home: "EcoDispensa · L'app contro lo spreco alimentare",
  partner: "Diventa partner · EcoDispensa",
  guida: "Guida all'app · EcoDispensa",
};

const PATHS: Record<SitePage, string> = { home: "/", partner: "/partner", guida: "/guida" };

/** Link interno del sito: cambia pagina senza ricaricare */
export const SiteLink = ({
  to,
  hash,
  className,
  children,
  onClick,
}: {
  to: SitePage;
  hash?: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) => {
  const nav = React.useContext(NavContext);
  return (
    <a
      href={`${PATHS[to]}${hash ? `#${hash}` : ""}`}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick?.();
        nav(to, hash);
      }}
    >
      {children}
    </a>
  );
};

export const Logo = ({ size = "text-[22px]" }: { size?: string }) => (
  <span className="flex items-center gap-2.5">
    <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-xl" />
    <span className={`font-display font-extrabold tracking-tight ${size}`}>
      <span className="text-[#6F8F66]">Eco</span>
      <span className="text-[#2F4A2C]">Dispensa</span>
    </span>
  </span>
);

export const PrimaryButton = ({ children, onClick, className = "" }: { children: React.ReactNode; onClick: () => void; className?: string }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-forest px-6 text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(47,74,44,0.25)] transition hover:bg-[#3A5836] ${className}`}
  >
    {children}
  </button>
);

const MENU: Array<{ label: string; to: SitePage; hash?: string }> = [
  { label: "Come funziona", to: "home", hash: "come-funziona" },
  { label: "Progetto Scuola", to: "home", hash: "scuola" },
  { label: "Prezzi", to: "home", hash: "prezzi" },
  { label: "Guida", to: "guida" },
  { label: "Diventa partner", to: "partner" },
];

const Header = ({ page }: { page: SitePage }) => {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-[#2F4A2C]/10 bg-[#F7EBD3]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
        <SiteLink to="home" onClick={() => setOpen(false)}>
          <Logo />
        </SiteLink>
        <nav aria-label="Menu principale" className="hidden items-center gap-1 lg:flex">
          {MENU.map((m) => (
            <SiteLink
              key={m.label}
              to={m.to}
              hash={m.hash}
              className={`rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/60 ${
                !m.hash && m.to === page ? "text-forest underline decoration-2 underline-offset-8" : "text-[#3D4A3B]"
              }`}
            >
              {m.label}
            </SiteLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openApp()}
            className="hidden h-10 items-center gap-1.5 rounded-xl bg-forest px-4 text-sm font-bold text-white sm:inline-flex"
          >
            Apri l'app <ArrowRight size={16} />
          </button>
          <button
            type="button"
            aria-label={open ? "Chiudi il menu" : "Apri il menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 text-ink lg:hidden"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <nav aria-label="Menu" className="border-t border-[#2F4A2C]/10 bg-[#F7EBD3] px-5 pb-5 pt-2 lg:hidden">
          <ul className="flex flex-col">
            {MENU.map((m) => (
              <li key={m.label}>
                <SiteLink
                  to={m.to}
                  hash={m.hash}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-2 py-3 text-[16px] font-semibold text-ink"
                >
                  {m.label}
                </SiteLink>
              </li>
            ))}
          </ul>
          <PrimaryButton onClick={() => openApp()} className="mt-2 w-full">
            Apri l'app <ArrowRight size={16} />
          </PrimaryButton>
        </nav>
      )}
    </header>
  );
};

const Footer = ({ onLegal }: { onLegal: (id: LegalDocId) => void }) => (
  <footer className="border-t border-[#2F4A2C]/10 bg-[#F7EBD3]">
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:flex-row md:items-start md:justify-between md:px-8">
      <div className="flex max-w-sm flex-col gap-3">
        <Logo size="text-[20px]" />
        <p className="text-sm leading-relaxed text-[#4A5448]">
          L'app che aiuta le famiglie a non buttare il cibo: dispensa, spesa, scadenze e ricette con quello che hai in casa.
        </p>
        <a href={`mailto:${LEGAL.email}`} className="text-sm font-bold text-forest hover:underline">
          {LEGAL.email}
        </a>
      </div>
      <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
        <SiteLink to="home" hash="come-funziona" className="font-semibold text-[#3D4A3B] hover:underline">
          Come funziona
        </SiteLink>
        <button type="button" onClick={() => onLegal("privacy")} className="text-left font-semibold text-[#3D4A3B] hover:underline">
          Privacy
        </button>
        <SiteLink to="guida" className="font-semibold text-[#3D4A3B] hover:underline">
          Guida
        </SiteLink>
        <button type="button" onClick={() => onLegal("termini")} className="text-left font-semibold text-[#3D4A3B] hover:underline">
          Termini d'uso
        </button>
        <SiteLink to="partner" className="font-semibold text-[#3D4A3B] hover:underline">
          Diventa partner
        </SiteLink>
        <button type="button" onClick={() => onLegal("cookie")} className="text-left font-semibold text-[#3D4A3B] hover:underline">
          Cookie
        </button>
      </div>
    </div>
    <p className="mx-auto max-w-6xl px-5 pb-8 text-xs text-[#4A5448] md:px-8">© {new Date().getFullYear()} EcoDispensa</p>
  </footer>
);

const LegalSection = ({ id, onBack }: { id: LegalDocId; onBack: () => void }) => (
  <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-10 md:px-8">
    <button type="button" onClick={onBack} className="self-start text-sm font-bold text-forest hover:underline">
      ← Torna al sito
    </button>
    <h1 className="font-display text-[34px] font-extrabold leading-tight tracking-tight text-forest">{LEGAL_DOCS[id].title}</h1>
    <div className="rounded-[28px] bg-white/80 p-5 md:p-8">
      <LegalDocBody id={id} />
    </div>
  </main>
);

const legalFromUrl = (): LegalDocId | null => {
  const p = new URLSearchParams(window.location.search).get("pagina");
  return p && p in LEGAL_DOCS ? (p as LegalDocId) : null;
};

/** Il sito pubblico: Home, Guida, Diventa partner e i documenti legali */
export const SiteApp = () => {
  const [page, setPage] = useState<SitePage>(() => pageFromPath(window.location.pathname) ?? "home");
  const [legal, setLegal] = useState<LegalDocId | null>(legalFromUrl);

  const scrollTo = (hash?: string) => {
    if (!hash) {
      window.scrollTo({ top: 0 });
      return;
    }
    // dopo il cambio di pagina, quando la sezione esiste
    requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const nav: Nav = (to, hash) => {
    window.history.pushState(null, "", `${PATHS[to]}${hash ? `#${hash}` : ""}`);
    setLegal(null);
    setPage(to);
    scrollTo(hash);
  };

  const openLegal = (id: LegalDocId) => {
    window.history.pushState(null, "", `${PATHS[page]}?pagina=${id}`);
    setLegal(id);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onPop = () => {
      setPage(pageFromPath(window.location.pathname) ?? "home");
      setLegal(legalFromUrl());
    };
    window.addEventListener("popstate", onPop);
    // apertura con #sezione nell'indirizzo
    if (window.location.hash) scrollTo(window.location.hash.slice(1));
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.title = legal ? `${LEGAL_DOCS[legal].title} · EcoDispensa` : TITLES[page];
  }, [page, legal]);

  return (
    <NavContext.Provider value={nav}>
      <div className="min-h-screen bg-[#FAF5EA] text-ink">
        <Header page={page} />
        {legal ? (
          <LegalSection id={legal} onBack={() => nav(page)} />
        ) : page === "partner" ? (
          <SitePartner />
        ) : page === "guida" ? (
          <SiteGuide />
        ) : (
          <SiteHome />
        )}
        <Footer onLegal={openLegal} />
      </div>
    </NavContext.Provider>
  );
};
