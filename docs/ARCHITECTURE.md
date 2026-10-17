# Quotivo — Architettura e decisioni tecniche

## Fonte di verità

Leggere questo documento insieme a quotivo-brief.md e ROADMAP.md.
Le decisioni successive qui specificate precisano il brief originale.
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

quotivo/
  AGENTS.md
  docs/
    quotivo-brief.md
    ARCHITECTURE.md
    ROADMAP.md
    HANDOFF.md
  quotivo-mobile/
    App.tsx
    package.json
    package-lock.json
    app.json
    tsconfig.json
    SETUP.md

Verificare la struttura effettiva prima di modificarla.

Il monorepo descritto nel brief è una direzione futura, non una struttura
già implementata. Non spostare subito tutto in apps e packages.

Prima separare dentro quotivo-mobile/src:
- domain: modelli, validazione, calcoli;
- database: apertura SQLite, migrazioni e repository;
- features: preventivi, clienti, catalogo, template, impostazioni;
- components: componenti riutilizzabili;
- documents: modelli ed esportatori;
- theme: colori, spaziature e tipografia.

La logica di dominio non deve dipendere dai componenti React Native.
Non presumere che tutti i componenti UI mobili siano riutilizzabili in Next.js.

## Database iniziale

### Incremento editor a tre step

La migrazione 7 aggiunge rubrica `clients`, collegamento opzionale della bozza al cliente, IVA predefinita del preventivo e stato di conferma della lavorazione. Le voci non confermate restano autosalvate nella bozza ma sono escluse da calcoli, emissione e renderer.

La migrazione 8 aggiunge ai soli preventivi la copia dei dati cliente mancanti: referente, telefono, email, codice fiscale e P. IVA. La rubrica resta una sorgente di riempimento, non di rendering retroattivo: il documento e lo snapshot emesso usano esclusivamente la copia della bozza. Gli snapshot schema 3 precedenti restano leggibili con campi cliente vuoti.

Usare solo SQLite sul dispositivo, tramite expo-sqlite.

Non introdurre in questa fase:
- Neon;
- backend;
- registrazione utenti;
- sincronizzazione cloud;
- credenziali remote.

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

Alla finalizzazione:
1. validare il documento;
2. leggere e incrementare il contatore;
3. assegnare il numero;
4. salvare lo snapshot del documento;
5. registrare l'evento nello storico.

Eseguire queste operazioni in una singola transazione SQLite.

Imporre unicità al numero assegnato.
Non usare MAX(numero) + 1 come unico meccanismo di numerazione.
Impedire doppie finalizzazioni causate da tap ripetuti.

La numerazione corrente è annuale: 1/2026, 2/2026 e 1/2027.
La sequenza dell'anno viene creata alla prima emissione e non viene mai decrementata.
Non riutilizzare i numeri annullati.

Implementazione corrente: la migrazione 4 usa sequenze `quotes:ANNO`. Le emissioni leggono e incrementano esclusivamente la sequenza dell'anno locale nella stessa transazione esclusiva che salva dati, righe, numero, stato e snapshot. Gli emessi legacy conservano il numero originario con anno nullo: l'istante UTC precedentemente registrato non è sufficiente a ricostruire con certezza l'anno locale e non viene reinterpretato.

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

Solo SQLite significa che i dati sono locali.
Perdita del dispositivo o disinstallazione possono comportare perdita dati.

La versione utilizzabile deve includere backup e ripristino,
non solo esportazioni dei singoli preventivi.

Il backup comprende database e risorse necessarie, come il logo.
Il ripristino deve validare formato e versione prima di modificare dati.
Non effettuare sovrascritture silenziose.

## Futuro cloud

Registrazione, autenticazione, database remoto e pannello amministratore
sono una fase successiva.

Neon/PostgreSQL è un'opzione, non una dipendenza attuale.
La sincronizzazione richiederà API, autorizzazioni, gestione conflitti
e una strategia di numerazione multi-dispositivo.

UUID e timestamp aiutano, ma non rendono automatica la sincronizzazione.

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

La migrazione locale 14 aggiunge a `quotes` `revision_root_quote_id`, `parent_quote_id` e `revision_number`. Gli esistenti restano Rev.0 (`0`, riferimenti null); una revisione successiva deve indicare una root Rev.0 e il parent della revisione immediatamente precedente. Indici e trigger impediscono numeri negativi, autoriferimenti, radici/parent mancanti, catene non consecutive e doppie revisioni nello stesso root. Il database locale è già isolato per account: ogni riferimento `quotes` validato dal trigger appartiene quindi allo stesso owner locale. Non esiste ancora clonazione, UI, modifica della numerazione, snapshot o PDF per revisioni.

`CreateRevisionUseCase` legge il solo snapshot immutabile dell'emesso e produce una nuova `Quote` draft con ID nuovi per documento e righe. Il repository locale serializza l'inserimento in transazione esclusiva e l'indice unico intercetta collisioni; la sorgente deve essere l'ultima revisione emessa della catena. Il catalogo e il profilo attività corrente non vengono letti. Il collegamento `parent_quote_id` conserva l'accesso a condizioni e dati storici nel relativo snapshot, senza duplicare il profilo nella bozza.

`quote_share_snapshots` conserva il payload immutabile e versionato; `quote_shares` conserva solo l'hash del bearer token e stato. Il bearer recuperabile è cifrato nel vault separato `quote_share_token_secrets`, non leggibile dall'app. Le Edge Function `quote-share-owner` (JWT owner) e `quote-public` (token pubblico) sono gli unici confini per creare, recuperare, revocare, aprire e decidere sul link.
