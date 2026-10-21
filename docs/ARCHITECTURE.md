# Quotivo — Architettura e decisioni tecniche

## Fonte di verità

Leggere questo documento insieme a `QUOTIVO-SSOT-PRODOTTO-ROADMAP.md`, `QUOTIVO-ROADMAP.md` e `QUOTIVO-BACKEND-MODELLO-COMMERCIALE.md` prima di modificare contratti remoti.
`ROADMAP.md` è storico e superseded. Le decisioni successive qui specificate precisano il brief originale.
Verificare sempre il codice prima di dichiarare una funzione implementata.

## Stack verificato al passaggio di consegne

- Expo installato sul PC: 57.0.22.
- React Native e TypeScript.
- package.json e package-lock.json definiscono le versioni del progetto.
- Expo Doctor: l'utente ha riportato 21/21 controlli superati.
- Questo controllo non certifica il funzionamento dell'app.

Non aggiornare o retrocedere le dipendenze senza una necessità verificata.
Installare i moduli Expo usando il meccanismo di compatibilità di Expo.

## Struttura attuale

quotivo-mobile/
  App.tsx
  src/
    domain.ts                 # regole e proiezioni pure condivisibili
    database.ts, migrations.ts # adapter SQLite locale
    features/                 # use case, repository contract e UI per dominio
    ui/                       # theme, token e primitive Design System
  supabase/
    migrations/               # authority remota e contratti SQL versionati
    functions/                # confini owner/public per quote sharing
  docs/
    QUOTIVO-SSOT-PRODOTTO-ROADMAP.md
    QUOTIVO-ROADMAP.md

Verificare la struttura effettiva prima di modificarla.

Il monorepo descritto nel brief è una direzione futura, non una struttura
già implementata. Non spostare subito tutto in apps e packages.

La separazione corrente dentro `src` è:
- domain: modelli, validazione, calcoli;
- database: apertura SQLite, migrazioni e repository;
- features: preventivi, clienti, catalogo, template, impostazioni;
- ui: componenti e primitive riutilizzabili;
- documents: modelli ed esportatori;
- theme: colori, spaziature e tipografia.

La logica di dominio non deve dipendere dai componenti React Native.
Non presumere che tutti i componenti UI mobili siano riutilizzabili in Next.js.

## Persistenza locale-first e authority remota

### Incremento editor a tre step

La migrazione 7 aggiunge rubrica `clients`, collegamento opzionale della bozza al cliente, IVA predefinita del preventivo e stato di conferma della lavorazione. Le voci non confermate restano autosalvate nella bozza ma sono escluse da calcoli, emissione e renderer.

La migrazione 8 aggiunge ai soli preventivi la copia dei dati cliente mancanti: referente, telefono, email, codice fiscale e P. IVA. La rubrica resta una sorgente di riempimento, non di rendering retroattivo: il documento e lo snapshot emesso usano esclusivamente la copia della bozza. Gli snapshot schema 3 precedenti restano leggibili con campi cliente vuoti.

SQLite tramite `expo-sqlite` resta la sorgente locale per bozze, clienti, catalogo, snapshot e documenti. Supabase è già l'authority remota per identità, entitlement, lifecycle account, autorizzazione/numerazione dell'emissione, quota FREE, share pubbliche ed esito commerciale. Non introdurre una seconda authority o una sincronizzazione generale delle bozze.

I dati devono sopravvivere alla chiusura e al riavvio dell'app.

Prevedere:
- migrazioni versionate;
- chiavi esterne;
- query parametrizzate;
- transazioni per operazioni composte;
- errori gestiti senza cancellare il database;
- identificativi stabili indipendenti dal numero di preventivo;
- date di creazione e modifica;
- backup e ripristino verificabili.

Il database non deve essere ricreato o azzerato a ogni avvio.

## Entità

- BusinessProfile
- Client
- CatalogItem
- Template
- TemplateItem
- Quote
- QuoteItem
- QuoteStatusHistory
- NumberSequence
- DocumentExport

TemplateItem definisce ordine e valori iniziali delle voci di un template.
QuoteItem è una copia indipendente, non un riferimento a prezzi modificabili.

I preventivi emessi conservano anche una copia dei dati di attività,
cliente, condizioni e configurazione fiscale utilizzati all'emissione.

## Bozze e numerazione

Una nuova bozza ha un identificativo interno, ma nessun numero definitivo.

Alla finalizzazione la bozza è validata localmente; l'autorizzazione server assegna in modo idempotente issuance e numero annuale. Solo dopo l'autorizzazione si persistono localmente emesso e snapshot; reconciliation esplicita recupera un'interruzione senza creare una seconda issuance o un nuovo numero.

Imporre unicità al numero assegnato.
Non usare MAX(numero) + 1 come unico meccanismo di numerazione.
Impedire doppie finalizzazioni causate da tap ripetuti.

La numerazione corrente è annuale: 1/2026, 2/2026 e 1/2027.
La sequenza dell'anno viene creata alla prima emissione e non viene mai decrementata.
Non riutilizzare i numeri annullati.

La sequenza locale resta il supporto offline/storico. Per le nuove emissioni autorizzate il numero canonico è assegnato dalla RPC server-side; gli emessi legacy conservano il numero originario con anno nullo quando l'istante UTC non permette di ricostruire l'anno locale con certezza.

`issued_quote_snapshots` contiene un payload JSON con versione schema ed è protetta da trigger contro aggiornamento e cancellazione. Lo snapshot versione 1 comprende soltanto i dati realmente disponibili nel modello corrente (cliente testuale, titolo e righe). I preventivi emessi prima della migrazione restano protetti nelle tabelle originali ma non ricevono snapshot retroattivi incompleti o dati inventati.

## Migrazioni

Lo schema usa `PRAGMA user_version`. Ogni migrazione viene applicata in ordine dentro `BEGIN IMMEDIATE` e aggiorna la versione soltanto prima del commit; un errore esegue rollback. Una versione database più recente di quella conosciuta dall'app viene rifiutata senza modifiche. La migrazione 4 ricostruisce conservativamente le tabelle per sostituire l'unicità globale con `(number_year, number)`, preservando righe e snapshot.

## Stato e immutabilità

Distinguere:
- bozza modificabile;
- documento emesso;
- inviato;
- accettato;
- rifiutato;
- annullato.

L'archiviazione è separata dallo stato commerciale.

Un documento emesso non cambia nei contenuti economici e descrittivi.
Sono consentiti aggiornamenti di stato, registrati nello storico.

Per modificarne il contenuto creare una nuova bozza duplicata.
La nuova bozza non eredita il numero definitivo.

Non dichiarare automaticamente “inviato” solo perché si apre
la schermata di condivisione: la consegna non è verificata.

## Calcoli

Non memorizzare importi come stringhe formattate con simbolo euro.

Usare importi monetari in centesimi e aritmetica decimale controllata
per quantità e prezzi. Definire esplicitamente arrotondamenti e precisione.

Supportare input italiani, inclusa la virgola decimale.
Rifiutare valori non numerici, non finiti o fuori dai limiti stabiliti.

Documentare:
- calcolo del totale riga;
- applicazione dello sconto;
- base di calcolo dell'IVA;
- arrotondamento;
- totale complessivo.

I test devono coprire quantità frazionarie, sconti, aliquote diverse
e assenza di IVA applicata. Nessuna clausola fiscale viene dedotta
automaticamente dal solo profilo dell'utente.

## Template e catalogo

Separare due concetti:
- template di lavorazione: voci, ordine, unità e condizioni iniziali;
- stile documento: colori, intestazione e impaginazione.

La richiesta originaria include quattro opzioni di template.
Prima di dichiararla soddisfatta verificare che non siano semplicemente
quattro nomi che generano lo stesso documento vuoto.

Le modifiche al catalogo o al template non cambiano i preventivi esistenti.
Durante la compilazione si possono aggiungere, rimuovere e riordinare voci.

## Documenti

Generare PDF, DOCX e XLSX dai medesimi dati e calcoli.

- PDF: documento impaginato pronto per l'invio.
- DOCX: documento realmente modificabile.
- XLSX: celle numeriche e formule coerenti con i totali.

Non rinominare un file HTML o CSV facendolo passare per DOCX o XLSX.

Verificare documenti multipagina, descrizioni lunghe, accenti,
logo, condizioni e coincidenza dei totali tra i tre formati.

Importare i loghi in memoria persistente dell'app.
Validare formato e dimensioni; gestire SVG in modo sicuro,
senza riferimenti esterni o contenuti eseguibili.

Una firma disegnata o un'immagine non è una firma digitale qualificata.

Gli export di un preventivo emesso derivano esclusivamente dal relativo snapshot: il PDF finale esistente viene riusato, mentre il DOCX OOXML viene generato dal document model normalizzato e condiviso tramite il foglio nativo. Gli export non modificano numero, stato, snapshot o contenuti del preventivo.

## Backup

Le bozze e gli artefatti locali restano nel sandbox del dispositivo: perdita o disinstallazione possono ancora comportare perdita dei dati non esportati/non recuperati. Le authority remote non sostituiscono un backup e non sincronizzano automaticamente l'archivio locale.

La versione utilizzabile deve includere backup e ripristino,
non solo esportazioni dei singoli preventivi.

Il backup comprende database e risorse necessarie, come il logo.
Il ripristino deve validare formato e versione prima di modificare dati.
Non effettuare sovrascritture silenziose.

## Confini remoti correnti

Supabase/PostgreSQL è già una dipendenza per le authority indicate sopra. `quote_issuances` identifica l'emissione autorizzata; `quote_commercial_outcomes` conserva un solo esito finale per issuance; `quote_shares` è il lifecycle del link e non l'authority commerciale. Le Edge Function `quote-share-owner` e `quote-public` sono i confini rispettivamente owner/JWT e pubblico/token. Una sincronizzazione completa SQLite↔cloud, backup multi-dispositivo e pannello amministrativo restano scope futuri.

## Esigenta

Quotivo rimane utilizzabile senza Esigenta.

Integrazione discreta, riconoscibile e opzionale.
Nessuna registrazione automatica, condivisione dei clienti,
caricamento dei preventivi o tracciamento nascosto.

Non promettere opportunità di lavoro non effettivamente disponibili.
Non inserire pubblicità nei documenti del cliente senza scelta esplicita.

## Pubblicazione

Android e iOS sono obiettivi del prodotto, non risultati già raggiunti.
Build, test su dispositivi, account sviluppatore e revisione degli store
sono necessari prima di dichiarare l'app pubblicabile.

## Safe area mobile

La shell mobile usa `react-native-safe-area-context`. Le barre fissate ai bordi devono applicare gli inset di sistema dinamicamente; non usare una distanza inferiore fissa per la barra di navigazione, perché sui dispositivi Android può sovrapporsi ai controlli di sistema.

## Profilo attività e logo

La migrazione 3 introduce un profilo singleton SQLite con denominazione, dati fiscali, indirizzo, contatti, condizioni, validità e pagamenti predefiniti. Il logo selezionato viene validato per firma/formato e copiato in `Paths.document/logos`; il database non dipende quindi dall'URI temporaneo del selettore.

Sono ammessi PNG, JPEG, WEBP e SVG fino a 5 MB. Per SVG sono bloccati DOCTYPE/entità, script, handler evento, `foreignObject`, URI JavaScript e riferimenti esterni. Gli snapshot dei nuovi emessi incorporano il logo in base64 insieme ai dati del profilo realmente presenti. Sostituire o rimuovere il logo corrente non altera lo snapshot storico.

Su Android l'URI restituito dal selettore può essere `content://` anche con `copyToCacheDirectory: true`. Non chiamare `File.bytes()` direttamente su tale URI. La pipeline canonica usa `expo-file-system/legacy.copyAsync`, che supporta contenuti condivisi/SAF, per creare prima una copia univoca in `Paths.cache`; solo questa copia privata viene letta e validata. Dopo la validazione viene copiata in `Paths.document/logos`. Il temporaneo viene rimosso sempre e un file persistente parziale viene eliminato in caso di copia fallita. Non richiedere permessi Android generali di lettura storage.

## Modello documento Standard

Il contratto strutturale è `docs/QUOTIVO-TEMPLATE-STANDARD.md`; il riferimento visuale è `docs/template-mockup-standar.html`. La migrazione 5 estende conservativamente preventivi e righe, introduce unità e aliquote personalizzate persistenti e non riscrive gli snapshot precedenti. Quantità, denaro e percentuali nuove sono rappresentati rispettivamente come interi scalati per 10.000, centesimi e centesimi di punto. I calcoli usano BigInt, half-up, riparto a maggiori resti e IVA arrotondata per gruppo. I nuovi snapshot sono schema 3 e identificano `standard-v1`.

## Pipeline PDF reale

La pipeline è `Quote/snapshot → StandardDocumentModel → Standard renderer → expo-print`. Il renderer riceve i totali già prodotti dal dominio. `expo-print` genera in cache; le bozze restano temporanee, mentre i definitivi vengono spostati in `Paths.document/issued-pdfs`. La migrazione 6 aggiunge indirizzo cliente/cantiere e `document_exports`, separando lo stato del PDF dallo stato immutabile del preventivo.

L'emissione SQLite termina prima del rendering perché database e filesystem non condividono una transazione. Un errore PDF viene registrato senza annullare numero o snapshot; la rigenerazione usa il medesimo snapshot. Il nome include anno, numero, ID sanitizzato e `standard-a4-v1`; un definitivo esistente non viene sovrascritto.

La preview incorporata usa `react-native-pdf` e `react-native-blob-util`, configurati tramite gli omonimi config plugin. Richiede development build; Expo Go non contiene questi moduli nativi. `expo-dev-client` è stato aggiunto per il ciclo di prova locale. Nessuna WebView o schermata React viene presentata come anteprima PDF.
## Quote sharing pubblico

## Recenti lavorazioni

Recenti non è un catalogo né una nuova persistenza: `listRecentWorkItems` deriva le righe confermate dai preventivi emessi locali. Seleziona prima l’ultima revisione emessa per ogni root, poi deduplica le righe equivalenti e le ordina per data dell’ultimo utilizzo. Il riuso crea una copia modificabile nella bozza corrente; la promozione al Catalogo passa dall’unico repository `catalog_items` esistente.

## Fondazione revisioni preventivo

La migrazione locale 14 aggiunge a `quotes` `revision_root_quote_id`, `parent_quote_id` e `revision_number`. Gli esistenti restano Rev.0 (`0`, riferimenti null); una revisione successiva indica root Rev.0 e parent immediato. Indici e trigger impediscono numeri negativi, autoriferimenti, radici/parent mancanti, catene non consecutive e doppie revisioni nello stesso root. `RevisionChainCapability`, tramite adapter SQLite, restituisce esplicitamente CREATE, RESUME, NONE_HISTORICAL o un errore di lineage: record mancanti/corrotti non diventano un silenzioso “nessuna azione”.

`CreateRevisionUseCase` legge il solo snapshot immutabile dell'emesso e produce una nuova `Quote` draft con ID nuovi per documento e righe. Il repository locale serializza l'inserimento in transazione esclusiva e l'indice unico intercetta collisioni; la sorgente deve essere l'ultima revisione emessa della catena. Il catalogo e il profilo attività corrente non vengono letti. Il collegamento `parent_quote_id` conserva l'accesso a condizioni e dati storici nel relativo snapshot, senza duplicare il profilo nella bozza.

L'emissione di Rev.n conserva numero base/anno, non consuma una nuova quota FREE e non trasferisce l'esito commerciale. `currentQuoteProjection` conserva tutte le bozze e una sola revisione emessa latest per chain; Home, Archivio, metriche commerciali e Recenti la riusano. Nel dettaglio la revisione corrente espone CREATE/RESUME, mentre lo storico è read-only e apre il PDF immutabile di ogni revisione precedente. Dopo l'emissione, la supersessione della share parent è retry-safe e separata dall'esito dell'emissione.

`quote_share_snapshots` conserva il payload immutabile e versionato; `quote_shares` conserva solo l'hash del bearer token e stato. Il bearer recuperabile è cifrato nel vault separato `quote_share_token_secrets`, non leggibile dall'app. Le Edge Function `quote-share-owner` (JWT owner) e `quote-public` (token pubblico) sono gli unici confini per creare, recuperare, revocare, aprire e decidere sul link.

## Proiezioni, Design System e composizione UI

`commercialQuoteStatus` resta dominio puro; `CommercialStatusBadge` adatta stato a label/tone tramite `StatusBadge` e token centrali. `commercialMetrics` riceve la proiezione corrente e restituisce conteggi/importi senza calcoli commerciali nella Home. Il dettaglio emesso usa tab locali Riepilogo, Documento e Attività; i tab non introducono fetch o regole di business.

`App.tsx` mantiene shell, navigazione e wiring delle dipendenze condivise. Home/panoramica, Archivio, Clienti e Catalogo sono feature separate. L'editor legacy nel root conserva ancora accessi agli adapter locali: è debito di composizione noto, non una seconda authority né una ragione per duplicare regole di dominio.

## Quota FREE, entitlement e lifecycle

La funzione server-side `quote_monthly_quota()` definisce owner autenticato, confine mensile, entitlement, limite FREE e conteggio delle sole issuance Rev.0. `get_quote_monthly_quota`, `authorize_quote_issue` e `authorize_quote_revision_issue` riusano la stessa semantica; per PRO limite e residuo sono null. La UI legge soltanto questa proiezione server-authoritative.

`account_lifecycle` è l'authority server-side ACTIVE/DEACTIVATED. Ogni writer remoto passa da `assert_account_active`; disattivazione preserva SQLite, documenti e storico. Logout chiude sessione remota e database locale solo dopo successo, con timeout bounded e retry esplicito.
