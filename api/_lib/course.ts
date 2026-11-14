/**
 * Portata di una ricetta (Primi, Secondi, Contorni, Dolci, Altro) per dividere il Ricettario.
 * L'AI la indica quando crea la ricetta; se manca o non è valida la indoviniamo dal titolo.
 */
export const COURSES = ["primo", "secondo", "contorno", "dolce", "altro"] as const;
export type Course = (typeof COURSES)[number];

const RULES: Array<[RegExp, Course]> = [
  [/(torta|crema|budino|tiramis|biscott|dolce|crostata|muffin|gelato|panna cotta|ciambell|plumcake|cheesecake)/, "dolce"],
  [/(pasta|spaghett|penne|rigaton|fusill|linguin|tagliatell|lasagn|gnocch|risott|riso |zuppa|minestr|vellutat|ravioli|tortellin|carbonara|amatrician|orecchiett|paccheri|bucatin)/, "primo"],
  [/(pollo|manzo|maiale|vitell|pesce|salmon|tonno|calamar|polpett|frittata|uova|bistecc|arrost|merluzz|gamber|cozze|tacchin|hamburger|scaloppin|spezzatin|orata|branzin|seppi|polpo)/, "secondo"],
  [/(insalat|contorno|patate|verdure|purè|pure |spinaci|caponata|fagiolini|zucchine|melanzane|peperon|carciof|funghi)/, "contorno"],
];

export function guessCourse(title: string): Course {
  const t = ` ${String(title ?? "").toLowerCase()} `;
  for (const [re, c] of RULES) if (re.test(t)) return c;
  return "altro";
}

/** Usa la portata indicata dall'AI se valida, altrimenti la indovina dal titolo. */
export function normalizeCourse(value: unknown, title: string): Course {
  const v = String(value ?? "").trim().toLowerCase();
  const map: Record<string, Course> = {
    primo: "primo", primi: "primo", "primo piatto": "primo",
    secondo: "secondo", secondi: "secondo", "secondo piatto": "secondo",
    contorno: "contorno", contorni: "contorno",
    dolce: "dolce", dolci: "dolce", dessert: "dolce",
    altro: "altro", antipasto: "altro", "piatto unico": "altro",
  };
  return map[v] ?? guessCourse(title);
}
