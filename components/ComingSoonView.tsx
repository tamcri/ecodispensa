import React from 'react';
import { Bell, ChefHat, Lock, Receipt } from 'lucide-react';

/** Il sito pubblico mostra questa pagina finché siamo in prova: si entra nell'app da "Area riservata" */
export const PUBLIC_HOSTS = ['ecodispensa.it', 'www.ecodispensa.it', 'ecodispensa.app', 'www.ecodispensa.app'];
const ACCESS_KEY = 'eco-area-riservata';

/** true se va mostrata la pagina "Presto online" (sul dominio pubblico, o in anteprima con ?anteprima=presto) */
export function shouldShowComingSoon(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    // link di invito, codici e ricette condivise portano direttamente all'app
    if (params.has('accesso') || params.has('codice') || params.has('ricetta')) {
      grantAccess();
      return false;
    }
    // ?anteprima=presto mostra sempre la pagina, per vederla anche dopo essere entrati
    if (params.get('anteprima') === 'presto') return true;
    if (localStorage.getItem(ACCESS_KEY) === '1') return false;
    return PUBLIC_HOSTS.includes(window.location.hostname);
  } catch {
    return false;
  }
}

export function grantAccess() {
  try {
    localStorage.setItem(ACCESS_KEY, '1');
  } catch {
    /* storage non disponibile: vale solo per questa visita */
  }
}

const FEATURES = [
  { icon: Receipt, title: 'La spesa in un attimo', text: 'Fotografi lo scontrino o la detti a voce: tutto entra in dispensa.' },
  { icon: Bell, title: 'Avvisi prima che scada', text: 'Ti ricorda cosa usare oggi, prima che finisca nel bidone.' },
  { icon: ChefHat, title: 'Ricette con quello che hai', text: 'EcoChef cucina per te partendo da ciò che scade prima.' },
];

export const ComingSoonView = ({ onEnter }: { onEnter: () => void }) => (
  <div className="min-h-screen bg-[#F7EBD3] text-ink">
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))] md:px-10">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
          <span className="font-display text-[24px] font-extrabold tracking-tight">
            <span className="text-[#6F8F66]">Eco</span>
            <span className="text-[#2F4A2C]">Dispensa</span>
          </span>
        </span>
        <span className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-[#2F4A2C]">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6F8F66] opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4F6B4A]" />
          </span>
          In arrivo
        </span>
      </header>

      <main className="flex flex-1 flex-col gap-8 py-8 md:flex-row md:items-center md:gap-12 md:py-12">
        <div className="md:order-2 md:w-[46%]">
          <img
            src="/brand/benvenuto-famiglia.jpg"
            alt="Una famiglia sorridente cucina insieme con gli ingredienti che ha in casa"
            className="aspect-[4/3] w-full rounded-[28px] object-cover object-[center_37%] shadow-[0_24px_60px_rgba(47,74,44,0.18)] md:aspect-[4/5]"
          />
        </div>

        <div className="flex flex-col gap-6 md:order-1 md:flex-1">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#6F8F66]">Presto online</p>
            <h1 className="font-display text-[38px] font-extrabold leading-[1.02] tracking-tight [text-wrap:balance] md:text-[56px]">
              Compra meglio, cucina tutto, <span className="text-[#4F6B4A]">non sprecare niente.</span>
            </h1>
            <p className="max-w-[34rem] text-[16px] leading-relaxed text-[#3D4A3B] md:text-[18px]">
              EcoDispensa tiene d'occhio la tua dispensa, ti avvisa prima che il cibo scada e ti propone ricette con quello che
              hai in casa. Stiamo facendo le ultime prove: tra poco potrai provarla anche tu.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 rounded-3xl bg-white/80 p-4 lg:flex-col">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E3EBDB] text-[#2F4A2C]">
                  <Icon size={20} />
                </span>
                <span>
                  <span className="block font-bold">{title}</span>
                  <span className="block text-[14px] leading-snug text-[#4A5448]">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-[#2F4A2C]/10 pt-4 text-xs text-[#4A5448]">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>© {new Date().getFullYear()} EcoDispensa</span>
          <a href="/?pagina=privacy" className="font-semibold hover:underline">Privacy</a>
          <a href="/?pagina=termini" className="font-semibold hover:underline">Termini</a>
          <a href="/?pagina=cookie" className="font-semibold hover:underline">Cookie</a>
        </span>
        <button
          type="button"
          onClick={() => {
            grantAccess();
            onEnter();
          }}
          className="flex h-9 items-center gap-1.5 rounded-full px-3 font-bold text-[#2F4A2C] ring-1 ring-[#2F4A2C]/20 hover:bg-white/60"
        >
          <Lock size={13} /> Area riservata
        </button>
      </footer>
    </div>
  </div>
);
