/**
 * Guida di EcoDispensa: capitoli e domande frequenti.
 * La stessa guida si legge sul sito (ecodispensa.it/guida) e nell'app (Profilo → Aiuto e guida).
 * Le schermate sono in /public/guida.
 */
import type { ComponentType } from "react";
import { BookOpen, ChefHat, Home, Mic, Refrigerator, ShoppingCart, Smartphone, UserRound, Users } from "lucide-react";

export type GuideShot = { src: string; alt: string };

export type GuideChapter = {
  id: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  lead: string;
  steps: string[];
  tip?: string;
  shots?: GuideShot[];
};

export type GuideFaq = { q: string; a: string };

const shot = (name: string, alt: string): GuideShot => ({ src: `/guida/${name}.webp`, alt });

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    id: "inizia",
    icon: Smartphone,
    title: "Installa l'app e crea l'account",
    lead: "EcoDispensa si apre dal browser e si mette sulla schermata Home come un'app normale, senza passare dallo store.",
    steps: [
      "Dal telefono apri ecodispensa.it/app.",
      "Crea l'account con un nome utente e una password: non serve l'email.",
      "Installa l'app. Su Android (Chrome): menu con i tre puntini → «Installa app». Su iPhone (Safari): tasto Condividi → «Aggiungi alla schermata Home».",
      "Apri il Profilo (il cerchio con la tua iniziale, in alto a destra) e salva il codice di recupero: è l'unico modo per rientrare se dimentichi la password.",
    ],
    tip: "Dopo l'installazione apri sempre EcoDispensa dall'icona: si apre a schermo intero e puoi ricevere gli avvisi di scadenza.",
  },
  {
    id: "oggi",
    icon: Home,
    title: "Oggi: cosa usare prima",
    lead: "La prima schermata ti dice ogni giorno quali prodotti stanno per scadere, così li usi prima che si rovinino.",
    steps: [
      "In alto vedi i prodotti che scadono entro 3 giorni, dal più urgente. «Vedi tutti» apre l'elenco completo.",
      "Sotto ogni prodotto tocca «Finito» se l'hai usato tutto, «Usato metà» se ne resta un po', «Buttato» se è andato a male.",
      "«Cosa ci cucino?» apre EcoChef, che propone ricette proprio con quei prodotti.",
      "In basso trovi quanto cibo hai salvato nel mese, quanti prodotti hai in dispensa e quanti da comprare. «Le mie spese» mostra quanto spendi ogni mese e quanto vale il cibo buttato.",
    ],
    tip: "Segnare cosa butti non è una colpa: serve a capire dove si spreca e a vedere i progressi mese dopo mese.",
    shots: [shot("oggi", "La schermata Oggi con i prodotti che scadono entro 3 giorni")],
  },
  {
    id: "riempi",
    icon: Refrigerator,
    title: "Riempi la dispensa",
    lead: "Più la dispensa è aggiornata, più avvisi e ricette sono giusti. Ci sono quattro modi per aggiungere i prodotti, scegli il più comodo.",
    steps: [
      "«Scontrino»: dopo la spesa fotografalo, oppure scegli dalla galleria la schermata di uno scontrino digitale. I prodotti entrano da soli, con i prezzi. È incluso nel piano Premium.",
      "«A voce»: tocca il microfono e detta, per esempio «latte, sei uova, due etti di prosciutto».",
      "«Scansiona»: inquadra il codice a barre e l'app trova il nome del prodotto.",
      "«Aggiungi»: il pulsante verde in basso, per scrivere un prodotto a mano.",
      "Prima di salvare controlla l'elenco che ti propone l'app e correggi quello che serve.",
    ],
    tip: "Per frutta, verdura, carne e pane l'app stima la scadenza da sola. Per i prodotti confezionati vale sempre la data stampata sulla confezione.",
    shots: [shot("scontrino", "La finestra Scontrino: scatta una foto o scegli dalla galleria")],
  },
  {
    id: "dispensa",
    icon: Refrigerator,
    title: "La dispensa",
    lead: "Qui trovi tutto quello che hai in casa, in ordine di scadenza.",
    steps: [
      "I prodotti sono divisi in «Da usare subito», «Questa settimana» e «Più avanti».",
      "Usa i reparti in alto (Ortofrutta, Latticini, Carne & Pesce…) per vedere solo una parte, oppure cerca un prodotto per nome.",
      "Tocca un prodotto per aprire la sua scheda: puoi cambiare quantità, unità, scadenza, prezzo e reparto. «Leggi» fotografa la data sulla confezione e la scrive per te.",
      "Nella scheda, «Ne hai usato» scala ¼, metà o ¾ del prodotto; «Finito» lo toglie dalla dispensa.",
      "«Cosa hai usato?»: tocca il microfono e racconta, per esempio «ho usato 300 grammi di pasta e due uova». La dispensa si aggiorna da sola.",
    ],
    tip: "Nella scheda trovi anche un consiglio su come conservare quel prodotto per farlo durare di più.",
    shots: [
      shot("dispensa", "La dispensa con i prodotti da usare subito"),
      shot("prodotto", "La scheda di un prodotto con quantità, scadenza e reparto"),
    ],
  },
  {
    id: "spesa",
    icon: ShoppingCart,
    title: "La lista della spesa",
    lead: "Una lista sola per tutta la casa, divisa per reparto e aggiornata mentre fai la spesa.",
    steps: [
      "Scrivi un prodotto e tocca «+», oppure tocca il microfono e detta tutta la lista.",
      "Con la fotocamera inquadri un prodotto: se è in lista lo segna come preso, se ce l'hai già in dispensa te lo dice, altrimenti lo aggiunge.",
      "Al supermercato tocca il cerchio accanto a ogni prodotto che metti nel carrello.",
      "A casa tocca «Metti … in dispensa»: i prodotti presi passano in dispensa, con la scadenza stimata per i freschi.",
    ],
    tip: "Se aggiungi alla lista qualcosa che hai già in dispensa, l'app te lo segnala: così non compri due volte la stessa cosa.",
    shots: [shot("spesa", "La lista della spesa divisa per reparto")],
  },
  {
    id: "ecochef",
    icon: ChefHat,
    title: "Cucina con EcoChef",
    lead: "EcoChef è il cuoco dell'app: propone ricette con quello che hai, partendo da ciò che scade prima.",
    steps: [
      "«Con quello che ho»: scegli per quante persone cucini e quanto tempo hai, poi tocca «Proponimi 3 ricette».",
      "«Cerca»: scrivi un piatto preciso, per esempio «carbonara» o «torta di mele». EcoChef la adatta a quello che hai già.",
      "«Menu»: prepari il menu di più giorni, per pranzo e cena, con persone, budget e stile. Insieme al menu EcoChef ti prepara la lista della spesa con quello che manca.",
      "Nella ricetta trovi ingredienti e quantità, cosa hai già e cosa manca, e i passaggi uno per uno.",
      "Dal Profilo, in «Preferenze di EcoChef», scegli dieta (onnivora, vegetariana, vegana), senza lattosio, ingredienti da evitare e allergie.",
    ],
    tip: "EcoChef usa i crediti: ogni 4 richieste di ricette usi 1 credito, il menu della settimana ne usa 4. Controlla sempre ingredienti e allergeni: le ricette sono scritte da un'intelligenza artificiale.",
    shots: [
      shot("ecochef", "EcoChef: proponi 3 ricette con quello che scade prima"),
      shot("menu", "EcoChef: il menu di più giorni"),
      shot("preferenze", "Preferenze di EcoChef: dieta, ingredienti da evitare e allergie"),
    ],
  },
  {
    id: "ricettario",
    icon: BookOpen,
    title: "Il ricettario",
    lead: "Le ricette che salvi restano qui, con i tuoi voti e le foto dei piatti.",
    steps: [
      "Cerca per nome oppure filtra per portata: primi, secondi, contorni, dolci. «Cucinate» mostra quelle che hai già fatto.",
      "Apri una ricetta e tocca «Sì, la preparo» per metterla in programma.",
      "Dopo averla cucinata tocca «L'ho cucinato!»: l'app toglie dalla dispensa gli ingredienti usati.",
      "Dai un voto, aggiungi la foto del piatto e, se vuoi, condividi la ricetta con un link.",
    ],
    shots: [shot("ricettario", "Il ricettario con le ricette salvate")],
  },
  {
    id: "famiglia",
    icon: Users,
    title: "La famiglia: una dispensa per tutta la casa",
    lead: "Chi vive con te può usare la stessa dispensa e la stessa lista, ognuno dal suo telefono e con il suo account.",
    steps: [
      "Apri il Profilo → «Famiglia».",
      "Tocca «Invita» e manda il tuo codice a chi vive con te.",
      "L'altra persona crea il suo account, apre Profilo → «Famiglia», scrive il codice in «Hai ricevuto un codice?» e tocca «Entra».",
      "Da quel momento vedete la stessa dispensa e la stessa lista. I prodotti che aveva vengono portati nella dispensa comune.",
    ],
    shots: [shot("famiglia", "La pagina Famiglia con il codice invito")],
  },
  {
    id: "profilo",
    icon: UserRound,
    title: "Profilo, piano e crediti",
    lead: "Dal Profilo gestisci avvisi, piano, codici e i tuoi dati.",
    steps: [
      "«Avvisi di scadenza»: tocca «Attiva» per ricevere un avviso quando qualcosa sta per scadere.",
      "In alto vedi i tuoi crediti EcoChef. «Piani» mostra il piano gratuito e Premium.",
      "«Ho un codice · Invita un amico»: inserisci un codice regalo, per esempio quello del Progetto Scuola, o invita un amico.",
      "«Codice di recupero» e «Cambia password» proteggono l'account.",
      "«Privacy e i miei dati»: i documenti e l'eliminazione dell'account.",
    ],
    shots: [shot("profilo", "Il Profilo con crediti, famiglia, preferenze, Alexa e avvisi")],
  },
  {
    id: "alexa",
    icon: Mic,
    title: "EcoDispensa con Alexa",
    lead: "Con Alexa usi la dispensa a voce, anche con le mani occupate in cucina.",
    steps: [
      "Apri il Profilo → «Alexa» e collegala con un tocco. Serve l'app Alexa sul telefono, con lo stesso account Amazon dei tuoi dispositivi Echo.",
      "Di' «Alexa, apri la mia dispensa» e poi chiedi quello che ti serve, una richiesta dopo l'altra. Per finire di' «stop».",
      "Puoi chiedere: «Cosa scade oggi?», «Ho usato 300 grammi di pasta», «Prepariamo la lista della spesa», «Leggimi la ricetta della carbonara», «Quanto ho speso questo mese?».",
      "Mentre detti la lista puoi dire più prodotti insieme. Quando hai finito di' «chiudi lista».",
      "Con una ricetta aperta di' «avanti», «indietro» o «ripeti» per muoverti tra i passaggi.",
    ],
    tip: "Ogni mattina Alexa può dirti cosa scade. Nell'app Alexa vai su Altro → Routine → +, scegli l'ora, poi Aggiungi azione → Personalizzata e scrivi «chiedi alla mia dispensa cosa scade oggi».",
    shots: [shot("alexa", "La pagina Alexa nel Profilo con le frasi da dire")],
  },
];

export const GUIDE_FAQ: GuideFaq[] = [
  {
    q: "Perché non mi chiedete l'email?",
    a: "Per chiederti il meno possibile: bastano un nome utente e una password. Per questo è importante salvare il codice di recupero dal Profilo.",
  },
  {
    q: "Ho dimenticato la password: cosa faccio?",
    a: "Nella pagina di accesso tocca «Password dimenticata?», scrivi il tuo nome utente e il codice di recupero che hai salvato dal Profilo, poi scegli una nuova password. Senza codice di recupero non possiamo recuperare l'account.",
  },
  {
    q: "L'app è gratis?",
    a: "Sì: dispensa, lista della spesa, inserimento a voce, avvisi, ricettario e alcuni crediti EcoChef di benvenuto sono gratis. Premium costa 4,99 € al mese o 41,99 € all'anno e comprende i crediti EcoChef ogni mese e la lettura dello scontrino.",
  },
  {
    q: "Cosa sono i crediti EcoChef?",
    a: "Servono per chiedere ricette e menu a EcoChef: ogni 4 richieste di ricette usi 1 credito, il menu della settimana ne usa 4. Quanti ne hai lo vedi in alto nel Profilo. Se una richiesta non va a buon fine, i crediti ti vengono restituiti.",
  },
  {
    q: "Le scadenze che propone l'app sono sicure?",
    a: "Sono indicative. Per i freschi senza etichetta l'app stima quanto durano di solito; per i prodotti confezionati vale la data stampata. Prima di mangiare qualcosa controlla sempre confezione, aspetto e odore.",
  },
  {
    q: "Non ricevo gli avvisi di scadenza.",
    a: "Controlla di aver toccato «Attiva» in Profilo → Avvisi di scadenza e di aprire l'app dall'icona sulla schermata Home. Su iPhone gli avvisi funzionano solo con l'app installata. Se li avevi bloccati, sbloccali dalle impostazioni del browser o del telefono.",
  },
  {
    q: "Come condivido la dispensa con la mia famiglia?",
    a: "Profilo → Famiglia → «Invita». Chi riceve il codice lo scrive nella sua pagina Famiglia e tocca «Entra». Da quel momento avete la stessa dispensa e la stessa lista.",
  },
  {
    q: "Come disdico l'abbonamento?",
    a: "Profilo → Piano e crediti. Premium resta attivo fino alla fine del periodo già pagato e poi non si rinnova.",
  },
  {
    q: "Ho un codice regalo (per esempio dalla scuola): dove lo inserisco?",
    a: "Profilo → «Ho un codice · Invita un amico». Un codice di un Comune, di un'azienda o del Progetto Scuola ti dà 12 mesi di Premium senza pagare e senza rinnovo automatico.",
  },
  {
    q: "Alexa costa qualcosa?",
    a: "No, la skill è gratuita. Lo Chef a voce, che propone ricette nuove, è per chi ha Premium e non consuma crediti.",
  },
  {
    q: "Chi vede i miei dati?",
    a: "Solo tu e le persone della tua famiglia in EcoDispensa. Non vendiamo i dati e non mostriamo pubblicità. Trovi tutti i dettagli nell'informativa sulla privacy.",
  },
  {
    q: "Come elimino l'account?",
    a: "Profilo → Privacy e i miei dati. Cancelliamo subito account, dispensa, lista, ricette e foto. Se condividi la casa, gli altri membri tengono la dispensa comune.",
  },
];

export const GUIDE_HELP_EMAIL = "info@ecodispensa.it";
