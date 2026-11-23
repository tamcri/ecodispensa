/**
 * Documenti legali di EcoDispensa: privacy, termini d'uso, cookie, consenso Progetto Scuola.
 * BOZZE da far verificare a un professionista prima del lancio.
 *
 * I dati del titolare vanno scritti una volta sola qui sotto, in LEGAL.
 */

export const LEGAL = {
  /** Chi gestisce EcoDispensa: nome e cognome oppure ragione sociale, quando ci sarà la società */
  owner: "[Nome e cognome del titolare]",
  /** Indirizzo (sede o domicilio) */
  address: "[Indirizzo completo]",
  /** Partita IVA o codice fiscale, se presente */
  taxId: "[Partita IVA / codice fiscale]",
  /** Email per privacy e assistenza */
  email: "info@ecodispensa.it",
  /** Data dell'ultima modifica, mostrata in fondo ai documenti */
  updated: "23 novembre 2026",
  /** Versioni salvate quando l'utente accetta */
  termsVersion: "2026-11-17",
  schoolConsentVersion: "scuola-2026-11-17",
};

export type LegalDocId = "privacy" | "termini" | "cookie" | "scuola";

/** Un blocco di testo: un paragrafo oppure un elenco puntato */
export type LegalBlock = string | string[];

export type LegalDoc = {
  id: LegalDocId;
  title: string;
  intro: string;
  sections: Array<{ title: string; blocks: LegalBlock[] }>;
};

const contact = `${LEGAL.owner}, ${LEGAL.address} · email: ${LEGAL.email}`;

const PRIVACY: LegalDoc = {
  id: "privacy",
  title: "Informativa sulla privacy",
  intro:
    "Questa informativa spiega quali dati tratta EcoDispensa, perché, con chi li condivide e quali sono i tuoi diritti, come previsto dall'articolo 13 del Regolamento europeo 2016/679 (GDPR). Abbiamo cercato di scriverla in modo semplice.",
  sections: [
    {
      title: "1. Chi è il titolare",
      blocks: [
        `Il titolare del trattamento è ${LEGAL.owner}, ${LEGAL.address}, ${LEGAL.taxId}.`,
        `Per qualsiasi domanda sui tuoi dati puoi scrivere a ${LEGAL.email}.`,
      ],
    },
    {
      title: "2. Quali dati trattiamo",
      blocks: [
        "EcoDispensa è pensata per chiedere il minimo: per iscriverti bastano un username e una password. Non chiediamo email, nome, numero di telefono o posizione.",
        [
          "Account: username, password (salvata solo in forma cifrata), codice di recupero (cifrato), data di iscrizione e accettazione di questi documenti.",
          "Dati della tua casa: prodotti in dispensa, quantità, scadenze, reparti, lista della spesa, prezzi e spese che inserisci, prodotti usati o buttati.",
          "Ricette: le ricette salvate, i voti, le note e le foto dei piatti che carichi tu.",
          "Casa condivisa: le persone con cui scegli di condividere dispensa e spesa.",
          "Foto e voce per inserire la spesa: le foto di scontrini, prodotti e date di scadenza, e il testo che detti a voce. Le foto servono solo a leggere il contenuto e non vengono conservate.",
          "Crediti, abbonamento e codici: saldo dei crediti EcoChef, piano attivo, scadenza, codici regalo usati, eventuale ente o azienda che ti ha offerto il codice.",
          "Pagamenti: se ti abboni, Stripe ci comunica l'esito del pagamento, il piano e un identificativo del cliente. Non vediamo e non salviamo i dati della tua carta.",
          "Notifiche: se le attivi, l'indirizzo tecnico del tuo dispositivo per mandarti gli avvisi di scadenza.",
          "Progetto Scuola: se usi un codice di una scuola, la classe a cui è collegato (per esempio «1A · Istituto Pacinotti») e, solo con il tuo consenso, la partecipazione alla classifica delle classi.",
          "Dati tecnici: indirizzo IP e informazioni sul browser nei registri dei server, conteggi di utilizzo dell'intelligenza artificiale per applicare i limiti giornalieri e controllare i costi.",
        ],
        "Non trattiamo dati sanitari o altri dati «particolari». Se nelle preferenze indichi allergie o intolleranze, le usiamo solo per adattare le ricette: ti chiediamo di non inserire altro.",
      ],
    },
    {
      title: "3. Perché li usiamo e su quale base",
      blocks: [
        [
          "Far funzionare l'app (dispensa, spesa, ricette, casa condivisa, abbonamento): esecuzione del contratto, cioè dei Termini d'uso (art. 6.1.b GDPR).",
          "Gestire pagamenti e obblighi fiscali e contabili: obbligo di legge (art. 6.1.c).",
          "Proteggere l'app da abusi, applicare limiti giornalieri, risolvere errori: legittimo interesse a un servizio sicuro (art. 6.1.f).",
          "Mandarti notifiche di scadenza: tuo consenso, dato quando le attivi e revocabile in ogni momento dalle impostazioni del telefono (art. 6.1.a).",
          "Classifica del Progetto Scuola: tuo consenso, separato e facoltativo (art. 6.1.a). Vedi l'informativa dedicata.",
          "Statistiche sull'uso dell'app e report per partner e scuole: solo con dati aggregati e anonimi, che non permettono di risalire a te.",
        ],
        "Non vendiamo i tuoi dati, non mostriamo pubblicità e non li usiamo per profilarti a fini di marketing.",
      ],
    },
    {
      title: "4. L'intelligenza artificiale",
      blocks: [
        "Per creare ricette e menu, leggere scontrini, foto e testo dettato, EcoDispensa usa i modelli di OpenAI. Inviamo solo quello che serve: nomi e quantità dei prodotti, preferenze di cucina, la foto o il testo da leggere. Non inviamo il tuo username né altri dati che ti identificano.",
        "Secondo le condizioni di OpenAI per le API, i dati non vengono usati per addestrare i modelli e possono essere conservati fino a 30 giorni per controlli contro gli abusi.",
        "Le risposte sono generate in automatico: sono suggerimenti, non decisioni che producono effetti giuridici su di te. Controlla sempre ingredienti, allergeni e stato del cibo.",
        "La dettatura a voce usa il riconoscimento vocale del tuo telefono o browser (per esempio Google o Apple), con le loro regole sulla privacy: all'app arriva solo il testo.",
      ],
    },
    {
      title: "5. EcoDispensa su Alexa",
      blocks: [
        "Se attivi la skill EcoDispensa su Alexa e colleghi il tuo account, puoi usare la dispensa a voce. È facoltativo e puoi scollegarla quando vuoi.",
        [
          "Cosa riceviamo da Amazon: il testo della richiesta come Alexa l'ha capita (per esempio «ho usato due uova») e un codice tecnico che collega il tuo account Alexa a quello di EcoDispensa. Non riceviamo le registrazioni della tua voce, né il tuo nome, la tua email o altri dati del tuo account Amazon.",
          "Cosa salviamo: i codici del collegamento, solo in forma cifrata; se hai collegato Alexa dall'app, un codice di Amazon (cifrato) che ci permette di sapere se la skill è ancora attiva e di disattivarla quando scolleghi; il passaggio della ricetta che stai seguendo, per riprendere da lì (per 12 ore).",
          "Quello che chiedi a voce modifica la tua dispensa e la tua lista come se lo facessi nell'app. Le richieste allo Chef a voce sono trattate da OpenAI come descritto sopra.",
          "La voce è registrata ed elaborata da Amazon, come titolare autonomo, secondo l'informativa di Amazon e le impostazioni privacy dell'app Alexa, dove puoi anche ascoltare e cancellare le registrazioni.",
          "Per scollegare: Profilo → Alexa → Scollega, oppure disattiva la skill dall'app Alexa. Cancelliamo subito i codici del collegamento.",
        ],
      ],
    },
    {
      title: "6. A chi affidiamo i dati",
      blocks: [
        "Usiamo fornitori affidabili che trattano i dati per nostro conto, come responsabili del trattamento, solo per far funzionare l'app:",
        [
          "Supabase: database, account e foto delle ricette. Server nell'Unione europea (Irlanda).",
          "Vercel: hosting dell'app e del server. Server nell'Unione europea (Irlanda), società statunitense.",
          "OpenAI: intelligenza artificiale per ricette e lettura di foto e testo. Server negli Stati Uniti.",
          "Servizi di notifica del tuo dispositivo (Google, Apple, Mozilla), solo se attivi le notifiche.",
          "Open Food Facts: quando leggi un codice a barre, inviamo solo il numero del codice per trovare il nome del prodotto.",
        ],
        "Stripe tratta i dati di pagamento come titolare autonomo, secondo la propria informativa (stripe.com/it/privacy). Lo stesso vale per Amazon se usi Alexa.",
        "Quando i dati vanno fuori dall'Unione europea (Stati Uniti), il trasferimento è protetto dal Data Privacy Framework UE-USA o dalle Clausole contrattuali standard approvate dalla Commissione europea.",
      ],
    },
    {
      title: "7. Chi può vedere i tuoi dati",
      blocks: [
        [
          "Le persone della tua casa condivisa vedono dispensa, spesa e ricette comuni.",
          "Le ricette che condividi con un link, compresa la foto, sono visibili a chiunque abbia il link.",
          "Nel Progetto Scuola le altre famiglie, la scuola e il partner vedono solo dati di classe, mai quelli di una singola famiglia.",
          "Il titolare può accedere ai dati solo quando serve: per assistenza, sicurezza o per rispondere a una tua richiesta.",
        ],
      ],
    },
    {
      title: "8. Per quanto tempo li conserviamo",
      blocks: [
        [
          "Finché hai l'account. Se lo elimini dal Profilo, cancelliamo subito account, dispensa, spesa, ricette, foto e crediti; le copie di sicurezza si cancellano da sole entro 30 giorni. Se condividi la casa, gli altri membri mantengono la dispensa comune.",
          "Un account non usato per più di 24 mesi può essere cancellato.",
          "Dati di pagamento e fatture: 10 anni, come richiesto dalla legge fiscale.",
          "Registri tecnici dei server: al massimo 90 giorni, salvo necessità di sicurezza.",
          "Progetto Scuola: il collegamento alla classe resta finché dura il progetto o finché non revochi il consenso.",
        ],
      ],
    },
    {
      title: "9. I tuoi diritti",
      blocks: [
        "Puoi chiedere in ogni momento di accedere ai tuoi dati, correggerli, cancellarli, limitarne l'uso, riceverli in un formato leggibile (portabilità), opporti ai trattamenti basati sul legittimo interesse e revocare i consensi dati, senza conseguenze su quanto fatto prima.",
        `Puoi eliminare l'account da solo, dal Profilo → Privacy e i miei dati. Per tutto il resto scrivi a ${LEGAL.email}: rispondiamo entro 30 giorni. Poiché l'app non chiede l'email, potremmo chiederti di dimostrare che l'account è tuo (per esempio con il codice di recupero).`,
        "Se pensi che i tuoi dati siano trattati in modo scorretto, puoi presentare un reclamo al Garante per la protezione dei dati personali (garanteprivacy.it).",
      ],
    },
    {
      title: "10. Minori",
      blocks: [
        "EcoDispensa è riservata ai maggiorenni. Nel Progetto Scuola l'account è sempre del genitore: non raccogliamo dati degli alunni, nemmeno il nome.",
      ],
    },
    {
      title: "11. Sicurezza",
      blocks: [
        "Le comunicazioni sono cifrate (HTTPS), le password sono salvate in forma cifrata e ogni casa può leggere solo i propri dati. Nessun sistema è sicuro al 100%: in caso di violazione dei dati informeremo il Garante e, quando previsto, anche te.",
      ],
    },
    {
      title: "12. Modulo «Diventa partner» del sito",
      blocks: [
        "Se compili il modulo per diventare partner (Comuni, aziende, scuole), trattiamo i dati che inserisci: ente, nome e cognome, ruolo, email, telefono, città, numero indicativo di famiglie e messaggio.",
        "Li usiamo solo per risponderti e valutare insieme il progetto (misure precontrattuali, art. 6.1.b GDPR), non per newsletter o pubblicità. Li conserviamo per 24 mesi dall'ultimo contatto, salvo che nasca un accordo.",
      ],
    },
    {
      title: "13. Modifiche",
      blocks: [
        "Se cambiamo questa informativa in modo importante te lo diremo nell'app. La data dell'ultima modifica è in fondo alla pagina.",
      ],
    },
  ],
};

const TERMS: LegalDoc = {
  id: "termini",
  title: "Termini d'uso",
  intro:
    "Questi termini regolano l'uso di EcoDispensa. Creando un account li accetti: leggili con calma, li abbiamo scritti nel modo più semplice possibile.",
  sections: [
    {
      title: "1. Chi siamo e cosa offriamo",
      blocks: [
        `EcoDispensa è un'app web (PWA) gestita da ${LEGAL.owner}, ${LEGAL.address}, ${LEGAL.taxId}.`,
        "Ti aiuta a ridurre lo spreco alimentare: tieni la dispensa, ricevi avvisi sulle scadenze, fai la lista della spesa, inserisci la spesa con scontrino o voce, ottieni ricette e menu da EcoChef e segui quanto spendi e quanto butti.",
      ],
    },
    {
      title: "2. Il tuo account",
      blocks: [
        [
          "Per usare EcoDispensa devi essere maggiorenne.",
          "Ti servono un username e una password. Tienili per te: sei responsabile di quello che succede con il tuo account.",
          "Salva il codice di recupero dal Profilo: poiché non chiediamo l'email, senza quel codice non possiamo recuperare l'account se dimentichi la password.",
          "Puoi condividere la casa con altre persone: ognuno ha il suo account e vede la dispensa comune.",
          "Puoi eliminare l'account quando vuoi dal Profilo.",
        ],
      ],
    },
    {
      title: "3. Piani, crediti e prezzi",
      blocks: [
        [
          "Gratis: dispensa, lista della spesa, inserimento a voce, avvisi, ricettario e crediti EcoChef di benvenuto.",
          "Premium: 4,99 € al mese oppure 41,99 € all'anno, IVA inclusa. Comprende i crediti EcoChef mensili indicati nell'app e la lettura dello scontrino.",
          "Ricariche: pacchetti di crediti EcoChef extra, al prezzo indicato nell'app. I crediti delle ricariche non scadono.",
          "Una richiesta a EcoChef consuma crediti come indicato nell'app prima della richiesta. Se la richiesta non va a buon fine, i crediti vengono restituiti.",
          "Crediti e abbonamenti sono personali e non si possono convertire in denaro.",
        ],
        "I pagamenti sono gestiti da Stripe. Prima di pagare vedi sempre il prezzo finale.",
      ],
    },
    {
      title: "4. Rinnovo e disdetta",
      blocks: [
        "L'abbonamento mensile e quello annuale si rinnovano da soli alla scadenza, finché non li disdici. Puoi disdire in qualsiasi momento dal Profilo: l'abbonamento resta attivo fino alla fine del periodo già pagato e poi non si rinnova.",
        "Se cambiamo i prezzi, te lo diremo nell'app almeno 30 giorni prima: il nuovo prezzo vale dal rinnovo successivo e puoi disdire prima che si applichi.",
      ],
    },
    {
      title: "5. Diritto di recesso",
      blocks: [
        "Se sei un consumatore hai 14 giorni dall'acquisto per recedere senza dare motivazioni, scrivendo a " +
          LEGAL.email +
          ". Ti rimborsiamo con lo stesso metodo di pagamento entro 14 giorni.",
        "Se in quei 14 giorni hai già usato il servizio, il rimborso può essere ridotto in proporzione a quanto usato (per esempio i crediti già spesi), come previsto dal Codice del consumo.",
      ],
    },
    {
      title: "6. Codici regalo",
      blocks: [
        [
          "Codici di attivazione di Comuni, aziende e scuole: danno 12 mesi di Premium senza pagamento e senza rinnovo automatico. Alla scadenza torni al piano gratuito, salvo che tu scelga di abbonarti.",
          "Codici di creator e di amici: danno crediti in regalo nei primi giorni dall'iscrizione, uno solo per account.",
          "I codici non si possono vendere né convertire in denaro. Possiamo annullare i codici usati in modo scorretto.",
        ],
      ],
    },
    {
      title: "7. Progetto Scuola",
      blocks: [
        "Un partner (un'azienda o un Comune) può offrire i codici alle famiglie di una scuola. La famiglia usa l'app come tutti gli altri utenti; in più, solo se dà il consenso, la sua casa partecipa in forma anonima alla classifica della classe. Il regalo dei 12 mesi non dipende dal consenso. I dettagli sono nell'informativa del Progetto Scuola.",
      ],
    },
    {
      title: "8. Ricette, scadenze e intelligenza artificiale",
      blocks: [
        "Ricette, menu, quantità e letture di scontrini e foto sono generati da un'intelligenza artificiale e possono contenere errori. Sono suggerimenti, non consigli medici o nutrizionali.",
        [
          "Controlla sempre ingredienti e allergeni, soprattutto in caso di allergie o intolleranze.",
          "Le scadenze e gli avvisi dipendono da quello che inserisci: verifica sempre la confezione e lo stato del cibo prima di mangiarlo.",
          "Controlla prezzi e prodotti letti dallo scontrino.",
        ],
      ],
    },
    {
      title: "9. EcoDispensa su Alexa",
      blocks: [
        [
          "La skill EcoDispensa per Alexa è gratuita e facoltativa: per usarla colleghi il tuo account EcoDispensa dall'app Alexa o dal Profilo.",
          "A voce puoi consultare e aggiornare dispensa, scadenze e lista della spesa, sentire le tue ricette passo passo e sapere quanto spendi e quanto butti.",
          "Lo Chef a voce (proposte di ricette e ricette nuove) è disponibile per chi ha il piano Premium, entro un limite giornaliero, e non consuma crediti.",
          "Valgono le stesse regole dell'app, comprese quelle sulle ricette generate dall'intelligenza artificiale. Alexa capisce a volte male: controlla nell'app quello che hai detto.",
          "Alexa e i marchi collegati sono di Amazon.com, Inc. o delle sue affiliate. Amazon non è responsabile della skill EcoDispensa.",
        ],
      ],
    },
    {
      title: "10. Uso corretto",
      blocks: [
        "Non puoi usare EcoDispensa per scopi illeciti, cercare di accedere ai dati di altri, sovraccaricare il servizio o aggirare limiti e pagamenti. Per proteggere il servizio ci sono limiti giornalieri all'uso dell'intelligenza artificiale. In caso di violazioni gravi possiamo sospendere o chiudere l'account.",
      ],
    },
    {
      title: "11. I tuoi contenuti",
      blocks: [
        "Foto, ricette e note che inserisci restano tue. Ci autorizzi a conservarle e mostrarle solo per far funzionare l'app, per esempio quando condividi una ricetta con un link. Non caricare foto di altre persone senza il loro permesso.",
      ],
    },
    {
      title: "12. Disponibilità e responsabilità",
      blocks: [
        "Facciamo il possibile perché EcoDispensa funzioni sempre, ma possono esserci interruzioni, errori o modifiche alle funzioni. Rispondiamo dei danni causati da nostro dolo o colpa grave e in tutti i casi in cui la legge non permette di escludere la responsabilità; restano sempre salvi i tuoi diritti di consumatore.",
      ],
    },
    {
      title: "13. Modifiche ai termini",
      blocks: [
        "Se cambiamo questi termini in modo importante te lo diremo nell'app prima che le modifiche valgano. Se non sei d'accordo puoi disdire l'abbonamento ed eliminare l'account.",
      ],
    },
    {
      title: "14. Legge e contatti",
      blocks: [
        "Questi termini sono regolati dalla legge italiana. Per i consumatori è competente il tribunale del luogo in cui vivono.",
        `Contatti: ${contact}.`,
      ],
    },
  ],
};

const COOKIES: LegalDoc = {
  id: "cookie",
  title: "Cookie e memoria del browser",
  intro:
    "EcoDispensa non usa cookie di profilazione, pubblicità o statistiche di terze parti. Usa solo la memoria del browser per le cose indispensabili al funzionamento: per questo non ti chiediamo il consenso con un banner, come previsto dalle linee guida del Garante privacy.",
  sections: [
    {
      title: "1. Cosa salviamo sul tuo dispositivo",
      blocks: [
        [
          "Accesso: il «gettone» che ti tiene collegato al tuo account (memoria locale del browser, fino all'uscita).",
          "Funzionamento offline: il service worker salva i file dell'app per aprirla più in fretta e senza rete.",
          "Piccole scelte: se hai chiuso l'invito a installare l'app, l'accesso all'area riservata, un codice regalo o una ricetta condivisa da usare dopo l'accesso, la data dell'ultimo avviso di scadenza.",
        ],
        "Non sono usati per riconoscerti su altri siti né per mostrarti pubblicità.",
      ],
    },
    {
      title: "2. Servizi esterni",
      blocks: [
        "Caratteri e icone sono caricati dai nostri server, non da servizi esterni. Quando paghi, si apre la pagina di Stripe, che usa i propri cookie tecnici e antifrode secondo la sua informativa (stripe.com/it/cookie-settings).",
      ],
    },
    {
      title: "3. Come cancellarli",
      blocks: [
        "Puoi cancellare questi dati dalle impostazioni del browser (dati dei siti). Dopo dovrai accedere di nuovo.",
        "Se un giorno useremo cookie diversi, come statistiche o pubblicità, aggiorneremo questa pagina e ti chiederemo prima il consenso.",
      ],
    },
  ],
};

const SCHOOL: LegalDoc = {
  id: "scuola",
  title: "Progetto Scuola: informativa e consenso",
  intro:
    "Hai ricevuto un codice di EcoDispensa tramite la scuola di tuo figlio o tua figlia, offerto da un'azienda o da un Comune partner. Qui spieghiamo cosa succede e cosa scegli.",
  sections: [
    {
      title: "1. Il regalo",
      blocks: [
        "Il codice ti dà 12 mesi di EcoDispensa Premium, senza pagamento e senza rinnovo automatico. Il regalo resta tuo qualunque cosa tu scelga qui sotto.",
      ],
    },
    {
      title: "2. La classifica delle classi",
      blocks: [
        "Le classi della scuola fanno una gara amichevole: vince la classe le cui famiglie buttano meno cibo. Conta la percentuale di prodotti buttati su quelli tolti dalla dispensa, non i chili.",
        "Se acconsenti, la tua casa contribuisce alla classifica della classe a cui è collegato il codice.",
      ],
    },
    {
      title: "3. Quali dati usiamo",
      blocks: [
        [
          "Quanti prodotti la tua casa segna come usati o buttati, e il loro valore, sommati a quelli delle altre famiglie della classe.",
          "Il fatto che la tua casa è attiva nel mese.",
        ],
        "Non usiamo e non chiediamo nessun dato dell'alunno: né nome, né voti, né altro. L'account è del genitore.",
      ],
    },
    {
      title: "4. Chi vede cosa",
      blocks: [
        [
          "Le famiglie della scuola vedono nell'app solo i risultati di ogni classe: posizione, percentuale buttata, numero di famiglie attive.",
          "La scuola e il partner ricevono report con soli dati di classe o di istituto.",
          "Nessuno vede cosa c'è nella tua dispensa né i risultati della tua famiglia.",
          "Una classe compare in classifica solo con almeno 3 famiglie attive e il 30% della classe, così i dati di una singola famiglia non sono riconoscibili.",
        ],
      ],
    },
    {
      title: "5. La tua scelta",
      blocks: [
        "Partecipare è facoltativo. Se non acconsenti, la tua casa viene scollegata dalla classe e non entra in classifica; puoi usare l'app e il regalo come tutti.",
        "Puoi ritirare il consenso quando vuoi dalla classifica nella Home («Esci dalla classifica»). Da quel momento la tua casa non conta più.",
      ],
    },
    {
      title: "6. Base giuridica, durata e diritti",
      blocks: [
        "Il trattamento per la classifica si basa sul tuo consenso (art. 6.1.a GDPR). Il collegamento alla classe resta finché dura il progetto o finché non revochi il consenso; dopo, restano solo statistiche anonime.",
        `Titolare: ${contact}. Per il resto valgono l'Informativa sulla privacy e i Termini d'uso di EcoDispensa, compresi i tuoi diritti e il reclamo al Garante.`,
      ],
    },
  ],
};

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  privacy: PRIVACY,
  termini: TERMS,
  cookie: COOKIES,
  scuola: SCHOOL,
};

/** ?pagina=privacy (o termini, cookie, scuola): il documento si apre anche senza account */
export function legalDocFromUrl(): LegalDocId | null {
  try {
    const p = new URLSearchParams(window.location.search).get("pagina");
    return p && p in LEGAL_DOCS ? (p as LegalDocId) : null;
  } catch {
    return null;
  }
}
