import { Category } from './types';

/**
 * Guida di conservazione per gli alimenti più comuni.
 *
 * - `days`: giorni di conservazione stimati (prudenti) dal momento dell'acquisto,
 *   conservati come indicato in `where`.
 * - `fresh`: true per i prodotti che di solito NON hanno una data stampata
 *   (frutta, verdura, pane, banco gastronomia). Solo per questi la scadenza
 *   viene proposta in automatico; per i confezionati si invita a leggere l'etichetta.
 * - `tip`: consiglio di conservazione mostrato all'utente.
 *
 * Le stime sono indicative: l'utente può sempre modificare la data.
 */
export type StoragePlace = 'frigo' | 'dispensa' | 'freezer';

export interface FoodGuideEntry {
  keys: string[];
  category: Category;
  days: number;
  where: StoragePlace;
  fresh: boolean;
  tip: string;
}

const F = Category.FRUIT_VEG;
const D = Category.DAIRY;
const M = Category.MEAT_FISH;
const P = Category.PANTRY;

// L'ordine conta: le voci più specifiche vanno prima di quelle generiche.
export const FOOD_GUIDE: FoodGuideEntry[] = [
  // --- Frutta ---
  { keys: ['fragol', 'lampon', 'mirtill', 'more ', 'frutti di bosco', 'ribes'], category: F, days: 3, where: 'frigo', fresh: true, tip: "Non lavarli finché non li mangi: l'umidità li fa ammuffire in fretta." },
  { keys: ['banan'], category: F, days: 5, where: 'dispensa', fresh: true, tip: "Tienile lontane dall'altra frutta: rilasciano etilene e fanno maturare tutto prima." },
  { keys: ['mela ', 'mele '], category: F, days: 21, where: 'frigo', fresh: true, tip: 'In frigo durano settimane. Tienile separate dalla verdura, che farebbero appassire.' },
  { keys: ['pera ', 'pere '], category: F, days: 5, where: 'frigo', fresh: true, tip: 'Falle maturare fuori frigo, poi conservale al fresco e consumale in pochi giorni.' },
  { keys: ['aranc', 'mandarin', 'clementin', 'limon', 'pompelm', 'lime '], category: F, days: 14, where: 'frigo', fresh: true, tip: "Gli agrumi in frigo durano il doppio. Un limone tagliato: appoggialo sulla parte tagliata in un piattino." },
  { keys: ['uva '], category: F, days: 5, where: 'frigo', fresh: true, tip: 'In frigo nella sua vaschetta, lavala solo prima di mangiarla.' },
  { keys: ['pesca ', 'pesche ', 'percoc', 'albicocc', 'nettarin', 'susin', 'prugn', 'cilieg'], category: F, days: 4, where: 'frigo', fresh: true, tip: 'Fuori frigo finché maturano, poi in frigo e da consumare in pochi giorni.' },
  { keys: ['kiwi'], category: F, days: 10, where: 'frigo', fresh: true, tip: 'Duri durano a lungo in frigo; per farli maturare mettili vicino a una mela.' },
  { keys: ['ananas', 'mango', 'papaya'], category: F, days: 4, where: 'dispensa', fresh: true, tip: 'Una volta tagliato, in un contenitore chiuso in frigo e da finire in 2-3 giorni.' },
  { keys: ['melon', 'angur', 'cocomer'], category: F, days: 5, where: 'frigo', fresh: true, tip: 'Tagliato, copri la polpa con la pellicola e consumalo entro 3 giorni.' },
  { keys: ['avocad'], category: F, days: 4, where: 'dispensa', fresh: true, tip: "Mezzo avocado avanzato: lascia il nocciolo e spruzza un po' di limone sulla polpa." },
  { keys: ['pomodor', 'pachin', 'datterin', 'ciliegin'], category: F, days: 5, where: 'dispensa', fresh: true, tip: 'Fuori dal frigo restano più saporiti; mettili in frigo solo se sono già molto maturi.' },

  // --- Verdura ---
  { keys: ['basilic'], category: F, days: 4, where: 'dispensa', fresh: true, tip: "Come un mazzo di fiori: gambi in un bicchiere d'acqua, fuori dal frigo." },
  { keys: ['prezzemol', 'coriandol', 'erba cipollina', 'aneto', 'menta', 'erbe aromatic'], category: F, days: 5, where: 'frigo', fresh: true, tip: "Gambi in un bicchiere d'acqua in frigo, coperti da un sacchetto. Puoi anche tritarle e congelarle nell'olio." },
  { keys: ['insalat', 'lattug', 'rucol', 'valerian', 'songin', 'spinaci freschi', 'spinac', 'radicchi', 'indivia', 'scarola', 'misticanza'], category: F, days: 3, where: 'frigo', fresh: true, tip: "In un contenitore chiuso con un foglio di carta da cucina: assorbe l'umidità e la tiene croccante più a lungo." },
  { keys: ['fungh', 'champignon', 'porcin'], category: F, days: 3, where: 'frigo', fresh: true, tip: 'In un sacchetto di carta in frigo, mai nella plastica: soffocano e diventano viscidi.' },
  { keys: ['asparag'], category: F, days: 3, where: 'frigo', fresh: true, tip: "In piedi in un dito d'acqua, in frigo, come un mazzo di fiori." },
  { keys: ['zucchin', 'melanzan', 'cetriol', 'fagiolin', 'tacc'], category: F, days: 5, where: 'frigo', fresh: true, tip: 'Nel cassetto della verdura, senza lavarle prima.' },
  { keys: ['peperon'], category: F, days: 7, where: 'frigo', fresh: true, tip: 'Interi nel cassetto del frigo; tagliati, in un contenitore chiuso.' },
  { keys: ['broccol', 'cavolfior', 'cavol', 'verza', 'cime di rapa', 'friariell', 'bietol', 'catalogn'], category: F, days: 5, where: 'frigo', fresh: true, tip: 'Nel cassetto del frigo, in un sacchetto forato. Se iniziano ad ingiallire, cuocili e congelali.' },
  { keys: ['carciof'], category: F, days: 5, where: 'frigo', fresh: true, tip: 'Con il gambo in un bicchiere d\'acqua in frigo; una volta puliti, in acqua e limone.' },
  { keys: ['finocch', 'porr'], category: F, days: 7, where: 'frigo', fresh: true, tip: 'Nel cassetto del frigo, avvolti in un panno umido.' },
  { keys: ['sedan'], category: F, days: 10, where: 'frigo', fresh: true, tip: 'Avvolto nella carta stagnola resta croccante per settimane.' },
  { keys: ['carot'], category: F, days: 21, where: 'frigo', fresh: true, tip: "Togli il ciuffo verde: sottrae umidità alla carota e la fa ammorbidire." },
  { keys: ['zucca'], category: F, days: 7, where: 'frigo', fresh: true, tip: 'Intera dura mesi in un luogo fresco; tagliata, avvolgila nella pellicola e usala entro 5-7 giorni.' },
  { keys: ['patat'], category: F, days: 30, where: 'dispensa', fresh: true, tip: 'Al buio e al fresco, lontano dalle cipolle: insieme germogliano prima.' },
  { keys: ['cipoll', 'scalogn'], category: F, days: 30, where: 'dispensa', fresh: true, tip: 'In un luogo fresco e asciutto, lontano dalle patate. Mezza cipolla avanzata: in frigo in un contenitore chiuso.' },
  { keys: ['agli'], category: F, days: 30, where: 'dispensa', fresh: true, tip: 'In un luogo asciutto e arieggiato, non in frigo.' },
  { keys: ['zenzer'], category: F, days: 21, where: 'frigo', fresh: true, tip: 'In frigo con la buccia; si grattugia benissimo anche da congelato.' },

  // --- Pane e forno ---
  { keys: ['pane ', 'baguette', 'ciabatt', 'rosett', 'filon'], category: P, days: 2, where: 'dispensa', fresh: true, tip: 'Se non lo finisci, affettalo e congelalo: si scongela in pochi minuti o direttamente nel tostapane.' },
  { keys: ['focacc', 'pizza'], category: P, days: 2, where: 'dispensa', fresh: true, tip: 'Avvolta nella carta e poi in un sacchetto; il giorno dopo ripassala in forno.' },
  { keys: ['cornett', 'brioche', 'croissant', 'pasticcin'], category: P, days: 2, where: 'dispensa', fresh: true, tip: 'Si congelano bene: scaldali qualche minuto in forno.' },

  // --- Carne e pesce dal banco ---
  { keys: ['macinat', 'hamburger', 'polpett'], category: M, days: 1, where: 'frigo', fresh: true, tip: 'La carne macinata si guasta prima: se non la cucini entro domani, congelala subito.' },
  { keys: ['salsicc'], category: M, days: 2, where: 'frigo', fresh: true, tip: 'Nella parte più fredda del frigo (il ripiano in basso). Si congela benissimo.' },
  { keys: ['pollo', 'tacchin', 'petto', 'cosce', 'alett'], category: M, days: 2, where: 'frigo', fresh: true, tip: 'Sul ripiano più basso del frigo, in un contenitore chiuso, lontano da cibi pronti.' },
  { keys: ['manzo', 'vitell', 'maial', 'braciol', 'bistecc', 'fettin', 'arrost', 'spezzatin', 'agnell', 'carne'], category: M, days: 2, where: 'frigo', fresh: true, tip: 'Sul ripiano più basso del frigo. Se non la cucini in tempo, congelala in porzioni.' },
  { keys: ['cozz', 'vongol', 'gamber', 'scamp', 'calamar', 'seppi', 'polp', 'frutti di mare'], category: M, days: 1, where: 'frigo', fresh: true, tip: 'I frutti di mare freschi vanno cucinati in giornata o al massimo il giorno dopo.' },
  { keys: ['pesce', 'salmon', 'orat', 'branzin', 'spigol', 'merluzz', 'tonno fresco', 'trot', 'sogliol', 'aliciott', 'acciugh', 'sardin'], category: M, days: 1, where: 'frigo', fresh: true, tip: 'Il pesce fresco va cucinato entro un giorno o congelato subito.' },
  { keys: ['prosciutt', 'salam', 'mortadell', 'bresaol', 'speck', 'affettat', 'pancett', 'coppa'], category: M, days: 3, where: 'frigo', fresh: true, tip: 'Affettati al banco: nella carta del salumiere dentro un contenitore chiuso, entro 3 giorni.' },

  // --- Latticini (spesso confezionati: si suggerisce di controllare l'etichetta) ---
  { keys: ['mozzarell', 'burrat', 'stracciatell', 'fiordilatte', 'bufala'], category: D, days: 3, where: 'frigo', fresh: false, tip: 'Nel suo liquido di governo; tirala fuori dal frigo mezz\'ora prima di mangiarla.' },
  { keys: ['ricott', 'stracchin', 'crescenz', 'squaquerone', 'mascarpon'], category: D, days: 4, where: 'frigo', fresh: false, tip: 'Una volta aperta, consumala entro 2-3 giorni e chiudi bene la confezione.' },
  { keys: ['parmigian', 'grana', 'pecorin', 'formagg'], category: D, days: 30, where: 'frigo', fresh: false, tip: 'Avvolto nella carta per alimenti, non nella pellicola: deve respirare.' },
  { keys: ['latte'], category: D, days: 4, where: 'frigo', fresh: false, tip: 'Una volta aperto, il latte fresco va finito in 3 giorni. Tienilo sui ripiani, non nello sportello.' },
  { keys: ['yogurt', 'kefir'], category: D, days: 10, where: 'frigo', fresh: false, tip: 'Spesso è buono anche qualche giorno dopo la data "da consumarsi preferibilmente entro": controlla aspetto e odore.' },
  { keys: ['burro'], category: D, days: 30, where: 'frigo', fresh: false, tip: 'Ben chiuso, lontano da cibi dall\'odore forte. Si congela senza problemi.' },
  { keys: ['panna'], category: D, days: 3, where: 'frigo', fresh: false, tip: 'Una volta aperta, consumala entro 2-3 giorni.' },
  { keys: ['uova', 'uovo'], category: D, days: 21, where: 'frigo', fresh: false, tip: 'Nella loro confezione sui ripiani del frigo, non nello sportello dove la temperatura cambia.' },

  // --- Avanzi ---
  { keys: ['avanz', 'sugo', 'ragu', 'brodo', 'minestr', 'zupp'], category: Category.OTHER, days: 3, where: 'frigo', fresh: true, tip: 'In un contenitore chiuso, in frigo appena raffreddato. Se non lo mangi in 3 giorni, congelalo.' },
];

/** Minuscole, senza accenti né punteggiatura, con uno spazio finale per i confronti "inizio parola". */
export const normalizeFoodName = (name: string) =>
  ` ${name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

// Parole che indicano un prodotto trasformato o confezionato: niente stima automatica
const PROCESSED = [' passat', ' pelat', ' polpa ', ' salsa', ' succo', ' succhi', ' marmellat', ' confettur', ' surgel', ' scatol', ' secch', ' sott', ' affumicat', ' liofilizz', ' in polvere', ' crackers', ' biscott', ' grissin', ' fette biscottate', ' pan carre', ' pancarre', ' uht', ' a lunga conservazione'];

/** Trova la voce della guida per un nome di prodotto (null se non la conosce). */
export function findFoodGuide(name: string): FoodGuideEntry | null {
  const n = normalizeFoodName(name);
  if (n.trim().length < 2) return null;
  if (PROCESSED.some((w) => n.includes(w))) return null;
  for (const entry of FOOD_GUIDE) {
    for (const key of entry.keys) {
      // la chiave deve iniziare una parola del nome
      if (n.includes(` ${key}`)) return entry;
    }
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Data YYYY-MM-DD tra `days` giorni (data locale). */
export function dateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Scadenza proposta in automatico: solo per i prodotti freschi senza etichetta. */
export function suggestedExpiry(name: string): string | null {
  const g = findFoodGuide(name);
  return g && g.fresh ? dateInDays(g.days) : null;
}

export const WHERE_LABEL: Record<StoragePlace, string> = {
  frigo: 'in frigo',
  dispensa: 'in dispensa',
  freezer: 'in freezer',
};

/** Testo breve tipo "circa 3 giorni in frigo". */
export function guideSummary(g: FoodGuideEntry): string {
  const d = g.days === 1 ? '1 giorno' : g.days >= 28 ? `${Math.round(g.days / 7)} settimane` : `${g.days} giorni`;
  return `circa ${d} ${WHERE_LABEL[g.where]}`;
}

// ---------------------------------------------------------------
// Confronto tra nomi di prodotti (per "ce l'hai già" e "L'ho cucinato")
// ---------------------------------------------------------------

const STOP_WORDS = new Set(['di', 'del', 'della', 'dei', 'delle', 'al', 'alla', 'con', 'e', 'in', 'per', 'da', 'il', 'la', 'le', 'lo', 'gli', 'i', 'un', 'una', 'q', 'b', 'qb']);

/** Radice semplice di una parola italiana: toglie la vocale finale (mela/mele → mel). */
const stem = (w: string) => (w.length >= 4 ? w.replace(/[aeiou]$/, '') : w);

export const nameStems = (name: string) =>
  normalizeFoodName(name)
    .trim()
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .map(stem);

/**
 * Punteggio di somiglianza tra due nomi di prodotto (0 = diversi).
 * La prima parola significativa pesa di più: "latte" ≈ "Latte parzialmente scremato",
 * ma "latte di cocco" ≠ "cocco".
 */
export function nameMatchScore(a: string, b: string): number {
  const sa = nameStems(a);
  const sb = nameStems(b);
  if (!sa.length || !sb.length) return 0;
  if (sa[0] === sb[0]) return 2 + sa.filter((w) => sb.includes(w)).length;
  const common = sa.filter((w) => sb.includes(w)).length;
  return common >= Math.min(sa.length, sb.length) ? 1 : 0;
}

/** Due nomi indicano lo stesso prodotto (stessa parola principale). */
export const sameProduct = (a: string, b: string) => nameMatchScore(a, b) >= 2;
