# Quotivo — Passaggio di consegne a Codex locale

## Proprietario e obiettivo

Progetto di Daniele Sapienza.

App gratuita per preventivi professionali destinata ad artigiani
e piccole imprese, inizialmente utilizzata personalmente in edilizia.

Deve diventare un prodotto realmente utilizzabile, non una demo UI.

Esigenta è il progetto collegato, ma Quotivo deve funzionare da solo.

## Ambiente dell'utente

Windows, VS Code, Expo Go sul telefono.

Cartella indicata:
C:\Users\danie\Desktop\PROGETTI\app-mobile\quotivo

App:
C:\Users\danie\Desktop\PROGETTI\app-mobile\quotivo\quotivo-mobile

Repository:
https://github.com/danict94/Quotivo.git

Expo installato riportato:
57.0.22

Verificare package.json e lockfile prima di operare.
Il messaggio del primo commit cita Expo 55, ma non è prova della versione.

## Come vuole lavorare l'utente

Modifiche dirette nella cartella del PC tramite Codex locale.
Non vuole trasferire ZIP o copiare ogni aggiornamento dalla chat.

GitHub serve come storico e copia remota.
Non assumere che una sessione remota modifichi automaticamente il PC.

## Documenti da leggere

1. AGENTS.md nella radice Git dell'app.
2. docs/quotivo-brief.md.
3. docs/ARCHITECTURE.md.
4. docs/ROADMAP.md.
5. Questo file.

La chat precedente non deve essere necessaria per continuare.

## Stato del prototipo originale

App.tsx contieneva prevalentemente:
- dati cliente e preventivi dimostrativi;
- statistiche fisse;
- schermate Home, Archivio e Impostazioni;
- aggiunta di una bozza solo nello stato React;
- numerazione calcolata sulle righe in memoria;
- pulsanti e righe non ancora collegati a veri editor.

Non considerare questo un gestionale già funzionante.
Verificare eventuali sviluppi locali successivi prima di sostituire codice.

## Decisioni confermate

- Expo/React Native per Android e iOS.
- SQLite soltanto nella prima versione.
- Nessun account obbligatorio.
- Nessun Neon o backend ora.
- Template con lavorazioni già inserite.
- Voci aggiungibili, eliminabili e modificabili nel preventivo.
- Logo e profilo attività.
- PDF, Word e Excel come obiettivi della prima versione completa.
- Numerazione alla finalizzazione.
- Storico dei documenti emessi immutabile.
- Design moderno, elegante, sobrio e professionale.
- Espansione futura senza costruire ora tutte le funzioni future.

## Prima attività richiesta

Ispezionare progetto e stato Git, poi implementare lo Scope 1
della ROADMAP per incrementi verificati.

Cominciare da:
- modello dati;
- regole di calcolo testate;
- SQLite e migrazioni;
- creazione, salvataggio e riapertura di una bozza;
- editor delle lavorazioni;
- finalizzazione e archivio.

Non fermarsi alla sola proposta se è possibile implementare
un incremento sicuro e verificabile.

## Attenzioni

La visibilità del repository era pubblica all'ultima verifica remota.
Non assumere che lo sia ancora e non cambiarla automaticamente.
Evitare dati reali dei clienti e segreti nei commit.

La documentazione canonica è ora in `quotivo-mobile/docs` e le istruzioni
canoniche sono in `quotivo-mobile/AGENTS.md`, entrambe dentro la radice Git.
Le copie esterne originali sono state preservate e non vanno mantenute in
parallelo. Non creare un secondo repository annidato.

## Ultimo incremento locale

La barra inferiore dell'app è stata adattata alla safe area tramite `react-native-safe-area-context`, con altezza e padding inferiori derivati dagli inset di sistema. TypeScript e bundle Android risultano verificati; resta necessaria la prova sul telefono dell'utente sia con navigazione a tre tasti sia a gesti.

## Scope affidabilità 1 — 11 settembre 2026

- Migrazioni SQLite versionate fino alla versione 2, conservative sullo schema precedente.
- Contatore persistente `number_sequences`, inizializzato una sola volta dal massimo storico.
- Finalizzazione atomica: dati correnti, righe, incremento, numero, stato e snapshot nella stessa transazione esclusiva.
- Snapshot schema 1 immutabile dei soli campi oggi disponibili: cliente testuale, titolo e righe. Non contiene profilo attività, indirizzo cliente, condizioni o fiscalità perché tali dati non esistono ancora nel modello; non sono stati inventati snapshot retroattivi per i documenti già emessi.
- Mutex UI sincrono contro tap ripetuti e controllo database sullo stato della bozza.
- Gli input numerici attivi vengono materializzati dal buffer testuale prima di Salva/Finalizza, senza dipendere dal blur.
- Test SQLite con `sql.js` e runner `tsx`; eseguire `npm test`.
- Verifiche concluse: 5/5 test superati, TypeScript superato, Expo Doctor 21/21, bundle Android generato e `git diff --check` superato.
- Prova Expo Go ancora necessaria: aggiornare l'app, creare una bozza, digitare l'ultimo prezzo e toccare subito Salva/Finalizza senza chiudere la tastiera; riaprire e verificare valore, totale e numero.

## Profilo attività — 11 settembre 2026

La migrazione 3 e la schermata Impostazioni salvano dati fiscali, indirizzo, contatti e valori predefiniti. Il logo è copiato in memoria persistente, validato e sostituibile/rimovibile. I nuovi snapshot includono profilo e logo base64; quelli precedenti non vengono riscritti. Dipendenze Expo aggiunte per necessità: `expo-document-picker` e `expo-file-system`, nelle versioni compatibili installate da Expo.

Restano da provare fisicamente in Expo Go: scelta di ciascun formato logo, riavvio completo, anteprima raster e rimozione. Il prossimo incremento funzionale è la rubrica clienti con indirizzo cliente separato dal luogo di esecuzione.

## Ciclo completo — incremento A/B1 del 12 settembre 2026

La specifica operativa è ora canonica in `docs/QUOTIVO-CICLO-COMPLETO.md`. La migrazione 4 introduce numerazione annuale e conserva gli emessi legacy con `number_year = NULL`, perché il vecchio timestamp UTC non prova l'anno locale. Le nuove emissioni usano sequenze `quotes:ANNO`, salvano data locale, offset e scadenza e producono snapshot versione 2. Eseguire `npm test`: sono coperti passaggio anno, stessa numerazione su anni diversi e conservazione legacy.

Prossimo incremento: quantità scalate/calcoli fiscali e, subito dopo, cliente/cantiere nel flusso a tre passaggi. La prova Expo Go deve verificare visualizzazione `1/ANNO`, scadenza e riapertura; non è ancora una prova su dispositivo eseguita da Codex.

## Fix logo Android — 12 settembre 2026

`choosePersistentLogo()` non legge più `asset.uri` con `File.bytes()`. Usa `copyToCacheDirectory: true`, poi `expo-file-system/legacy.copyAsync` per portare qualunque URI concesso dal picker, incluso `content://`, in un file univoco sotto `Paths.cache`. Lettura e validazione avvengono solo lì; la copia persistente segue soltanto in caso di successo. `src/logoImport.ts` rende il flusso testabile e garantisce la pulizia best-effort in `finally`.

Dopo un secondo riscontro su Expo Go Android, la copia SAF è stata integrata con due fallback: `expo/fetch` scrive i byte in un nuovo file privato; per URI locali leggibili resta un trasferimento Base64 tramite API legacy. Nessun fallback usa `File.bytes()` sull'URI del picker. Se tutti falliscono, l'alert include i dettagli dei singoli tentativi utili a identificare il provider.

Da provare su Android/Expo Go: selezione da Foto e da un provider documenti, persistenza dopo riavvio, sostituzione e rimozione. Non sono stati aggiunti permessi storage.

## Template Standard — 12 settembre 2026

La migrazione corrente è la 5. `src/domain.ts` contiene il motore economico condiviso; `quote_items` mantiene i campi legacy e aggiunge la rappresentazione strutturata. Il fallback associa un'etichetta legacy a un codice unità solo per corrispondenza esatta. Tabelle `measurement_units` e `vat_rates` contengono preset e valori personalizzati riusabili. Il 6% non è predefinito ma può essere conservato come personalizzato/legacy.

L'editor offre misura/corpo, unità touch, IVA, introduzione, sconti e dettagli facoltativi. Salva/Finalizza continuano a materializzare anche i buffer numerici attivi. Le opzioni sono modellate e separate dal totale base; l'UI corrente permette di marcare una voce opzionale nei dettagli, ma non include ancora uno scenario selezionato nel riepilogo.

Le nuove emissioni creano snapshot versione 3 con `documentModel: standard-v1`, tutte le proprietà effettive delle righe, profilo e risultato economico. Le versioni 1/2 restano leggibili e immutate. Il contratto è `docs/QUOTIVO-TEMPLATE-STANDARD.md`; l'HTML è un riferimento visuale, non un PDF generato.

Prova Expo Go: aprire una bozza, aggiungere una voce, alternare A misura/A corpo, creare un'unità personalizzata, scegliere aliquote diverse, digitare l'ultimo prezzo e salvare subito; riaprire e controllare valori e totale. Poi emettere una bozza di prova e verificare che sia bloccata. Restano da verificare fisicamente wrapping dei selettori, tastiera e leggibilità su schermi stretti.

Prossimo scope: cliente e cantiere distinti nel primo passaggio; successivamente renderer PDF effettivo conforme allo Standard. DOCX/XLSX, backup e catalogo restano aperti. Nessun commit o push eseguito.

## Editor a tre step e rubrica minima — 12 settembre 2026

## Completamento cliente e PDF Standard — 12 settembre 2026

## Cleanup modello lavorazione DEV — 12 settembre 2026

Il modello canonico non contiene più `group_name`, `summary_label`, `notes` né `option_selected`. Il database di sviluppo è `quotivo-dev-v2.db`, creato da migrazioni riallineate per installazioni pulite. `isOptional` rende la lavorazione un’opzione esclusa dal totale base e stampata con il suo importo calcolato, mai con `0,00 €` derivante da uno stato UI inesistente. Il prossimo audit non deve reintrodurre questi campi senza una necessità di dominio dimostrata.

Migrazione 8 conserva la copia completa del cliente nella bozza (`nome`, referente, telefono, email, indirizzo, CF, P. IVA) e nel nuovo snapshot emesso. La rubrica può essere modificata senza alterare la copia del preventivo. Gli snapshot legacy/schema 3 incompleti restano leggibili: il renderer omette i campi non presenti senza inventarli.

Nel PDF Standard la prima pagina presenta i dati cliente/cantiere etichettati; dalla seconda pagina l'header è minimale e senza logo. Il footer mantiene `Pagina X di Y`. L'editor conserva Descrizione breve visibile, mentre gli altri campi descrittivi restano deliberatamente invariati nel pannello Dettagli facoltativi, in attesa dell'audit dedicato.

Migrazione 7: tabella locale `clients`, collegamento opzionale della bozza, `default_vat_basis_points` su preventivo e `confirmed` su lavorazione. Il nuovo editor mostra i tre step, ricerca/riuso del cliente salvato, cantiere separato o uguale all’indirizzo cliente, una lavorazione aperta per volta e card compatte dopo Conferma. Le lavorazioni non confermate sono autosalvate ma non alterano i calcoli, il PDF o lo snapshot emesso.

Da provare su telefono: creare un cliente e salvarlo in rubrica, riaprirlo in un’altra bozza, confermare una voce a misura e una a corpo, lasciare una terza incompleta, verificare totale/anteprima/emissione e la resa PDF con IVA unica e mista.

## Primo ciclo PDF reale — 12 settembre 2026

Aggiornamento renderer Standard v2: `src/documents/standardRenderer.ts` compone fogli A4 espliciti con gerarchia lavorazione/voce, tabella a sei colonne, dettagli facoltativi nella cella Voce e trattamento A corpo senza quantità o prezzo unitario fittizi. I footer sono valori letterali coerenti, non contatori CSS, e il definitivo non contiene BOZZA. Il renderer usa il gruppo neutro `Lavorazioni` in assenza di un eventuale `groupName` runtime; il modello dati non è stato modificato. Non essendoci un campo distinto per le esclusioni generali, il renderer non le inventa. Resta necessaria una prova visiva del PDF reale con caso minimo, multipagina e testi lunghi.

Nuovi moduli in `src/documents`: modello normalizzato, renderer adattivo, naming, servizio filesystem, workflow post-emissione e viewer. La bozza usa `expo-print` e cache privata; il definitivo viene generato dallo snapshot e conservato in `Paths.document/issued-pdfs`. `document_exports` registra `ready/failed`. Un errore dopo il commit non recupera il numero e abilita una rigenerazione idempotente.

Dipendenze motivate: `expo-print` genera il file; `react-native-pdf` e `react-native-blob-util` mostrano realmente il PDF locale con zoom/scorrimento; i due config plugin preparano il progetto nativo; `expo-dev-client` abilita la development build; `expo-constants` distingue Expo Go. Il viewer non funziona in Expo Go perché il client precompilato non contiene i moduli nativi.

Formato richiesto: CSS `@page` 210 × 297 mm e opzioni di stampa 595,28 × 841,89. Test automatici verificano configurazione, struttura adattiva, bozza/definitivo, totali dallo snapshot, naming e retry; non certificano il MediaBox prodotto dal renderer nativo. Serve ancora prova fisica con casi minimo, Standard e multipagina, inclusi footer `Pagina X di Y`, overflow, zoom e ritorno all'editor.

Per provare il viewer: collegare il telefono Android via USB con debugging attivo, eseguire `npx expo run:android --device`, poi per i successivi cambi JS `npx expo start --dev-client`. Il comando genera la cartella Android tramite CNG: non commetterla automaticamente. Expo Go può ancora modificare e generare, ma non mostra il PDF incorporato.

Restano fuori: condivisione, DOCX/XLSX, catalogo, area Clienti dedicata, backup e cloud. Nessun commit o push eseguito.

Verifiche automatiche concluse: `npm test` 20/20, `npm run typecheck`, Expo Doctor 21/21, bundle Android Expo, configurazione pubblica e Prebuild Android superati; `git diff --check` senza errori. Il manifest generato marca per rimozione READ/WRITE_EXTERNAL_STORAGE. Le directory temporanee `android` e `.expo-export-pdf` create per le verifiche sono state rimosse perché rigenerabili e non canoniche. Nessuna prova del viewer su development build o ispezione visuale del PDF è stata eseguita da Codex.

## Catalogo locale lavorazioni — 12 settembre 2026

La migrazione 9 crea `catalog_items` con il perimetro minimo: `title`, `price_mode`, `unit_code`/`unit_label` per A misura, `price_cents` e timestamp. Il titolo è univoco senza distinzione maiuscole/minuscole. Non conserva IVA, sconti, descrizioni o dati documentali.

In Step 2, “Salva nel catalogo” materializza gli input numerici attivi e, se il titolo esiste, propone Aggiorna o Annulla; “Aggiungi dal catalogo” cerca e copia i soli valori catalogabili nella lavorazione corrente. Mentre si digita il titolo sono visibili al massimo tre suggerimenti inline, senza risultati vuoti o collegamenti vivi. Il Catalogo è una tab principale e permette ricerca, creazione, modifica e eliminazione confermata. Nessuna modifica a calcoli, snapshot, PDF, emissione o numerazione.

Verifiche: `npm test` 29/29, `npm run typecheck` e `git diff --check` superati. Da provare su Expo Go: salvare una voce a misura, riutilizzarla in una nuova riga, aggiornare il duplicato e verificare che una voce a corpo non richieda U.M.

## Rubrica clienti essenziale — 13 settembre 2026

La tab Clienti usa esclusivamente `clients` e il repository esistente: ricerca per nome/referente, lista compatta, dettaglio con i sette campi già previsti, salvataggio e cancellazione confermata. Nessun CRM o dato aggiuntivo.

Le migrazioni 10-11 sono necessarie perché il vecchio riferimento `quotes.client_id` bloccava la cancellazione. Ora usa `ON DELETE SET NULL`; l’unica eccezione controllata al trigger di immutabilità consente questo scollegamento tecnico su un emesso, senza modificare testo cliente, importi o snapshot. Test automatico copre la conservazione del preventivo emesso e snapshot dopo l’eliminazione.

Verifiche: `npm test` 30/30, `npm run typecheck` e `git diff --check` superati. Da provare su Expo Go: crea/modifica un cliente, collegalo a una bozza, elimina il cliente e verifica che la bozza e un eventuale emesso restino consultabili.

## Export e condivisione documenti — 13 settembre 2026

Da un documento emesso, “Esporta / Condividi” offre PDF e Word. Il PDF non viene renderizzato di nuovo: viene riusato il definitivo già registrato, copiato solo in cache con un nome leggibile per il share sheet. Il DOCX viene generato dal medesimo snapshot tramite `buildFinalDocumentModel`, poi scritto in `Paths.document/issued-docx` e condiviso con `expo-sharing`.

`docx` 9.7.1 è l’unica libreria OOXML aggiunta; `expo-sharing` 57.0.19 è installata con Expo. Il test genera il DOCX e verifica la firma ZIP e `[Content_Types].xml`. Non esiste persistenza di export DOCX e nessun export modifica preventivo, PDF, snapshot o numerazione.

Verifiche: `npm test` 31/31, `npm run typecheck` e `git diff --check` superati. Da provare fisicamente: aprire un emesso, condividere PDF e Word, quindi aprire il Word ricevuto in Microsoft Word/Google Docs e verificare tabella e totale.

## Collegamenti profilo e rubrica nel preventivo — 13 settembre 2026

Step 1 legge il BusinessProfile senza copiarlo nella bozza: mostra un riepilogo o una card di configurazione e passa alle Impostazioni salvando prima la bozza corrente. “Torna al preventivo” riapre la stessa bozza; anteprima e finalizzazione richiedono la denominazione attività, come il flusso di emissione esistente.

Il campo cliente conserva i suggerimenti inline e aggiunge una ricerca compatta della rubrica. Il dettaglio cliente può creare una bozza con la copia dei sette valori esistenti; da quel momento rubrica e preventivo sono indipendenti. Nessuna migrazione.

Verifiche: `npm test` 31/31, `npm run typecheck` e `git diff --check` superati. Da provare su Expo Go: aprire Impostazioni da Step 1 e tornare, selezionare un cliente dalla rubrica, quindi creare un preventivo dal dettaglio cliente.

## Flusso immediato post-emissione — 13 settembre 2026

Dopo `finalizeDraft` l’editor legge lo snapshot definitivo e passa al riepilogo emesso, senza aprire automaticamente il viewer PDF. Mostra numero/data, Condividi (PDF), Esporta PDF/Word e Torna ai preventivi. Le azioni richiamano `prepareFinalPdfForShare`, `generateStoredFinalDocx` e `shareDocument`, già usate dal dettaglio Archivio: nessun renderer, schema o logica di emissione duplicata o modificata. Da provare su dispositivo: finalizzare una bozza, condividere PDF e DOCX dal riepilogo e poi verificare le stesse azioni riaprendo l’emesso dall’Archivio.

## Gestione bozze vuote ed eliminazione — 13 settembre 2026

`hasMeaningfulDraftContent` separa la riga iniziale vuota dai dati inseriti: alla chiusura dell’editor elimina la bozza solo se cliente (inclusi i dati collegati), titolo, introduzione, sconto e lavorazioni sono tutti vuoti/default. Home e Archivio hanno `⋯` solo sulle bozze; la conferma elimina la riga `quotes` e, tramite il vincolo esistente, le sue `quote_items`, senza toccare clienti o catalogo. Test: 33/33, TypeScript e `git diff --check` superati. Da provare su Expo Go: aprire/uscire da un nuovo preventivo, poi ripetere dopo avere scritto titolo o una lavorazione e usare `⋯` in Home e Archivio.

## UI Foundations — 13 settembre 2026

`src/ui/tokens.ts` è la fonte comune di colori, spacing, radius, typography, ombre/elevation e target touch. `src/ui/components.tsx` offre Button, Input, Card, Section, Select, Toggle ed EmptyState, senza framework UI; `src/ui/Icon.tsx` incapsula la sola libreria `@expo/vector-icons` (MaterialCommunityIcons). L’integrazione è deliberatamente incrementale: Input/Toggle/EmptyState, Select catalogo, CTA Expo Go PDF e tab bar usano già la foundation; restano invariati layout, navigazione, dati, PDF/DOCX, calcoli ed emissione. Test: 33/33, TypeScript e `git diff --check` superati. Da controllare visivamente su Expo Go: icone tab, contrasto e target touch.

## Redesign light/dark — 13 settembre 2026

`src/ui/theme.tsx` gestisce `light`, `dark` e `system`, memorizzando la preferenza con AsyncStorage separatamente dal database preventivi. Senza preferenza salvata appare il solo onboarding “Scegli il tuo tema”; Impostazioni contiene sempre Aspetto. La palette semantica deriva dai mockup esterni `../docs/quotivo-ui-mockup.html` e `../docs/quotivo-ui-light.html`; il brand mark provvisorio è `BrandMark` in App.tsx, unico punto da sostituire con il futuro SVG. Dipendenza aggiunta: `@react-native-async-storage/async-storage` compatibile Expo 57. Test: 33/33, TypeScript e `git diff --check` superati. Da provare su Expo Go: primo avvio, tre preferenze, riavvio e cambio automatico del sistema.

## Audit responsive mobile — 13 settembre 2026

Le card preventivo non assumono più un numero fisso: il riferimento, titolo, cliente, importo e badge hanno aree flessibili, `minWidth: 0`, wrapping/troncamento e scala prudente. Le tre opzioni Aspetto sono verticali e full-width; tab bar a cinque voci, righe catalogo/export, pannelli e logo non richiedono larghezze rigide. Test automatici 33/33, TypeScript e `git diff --check` superati. La verifica non sostituibile è Expo Go a 320, 360, 390 e 430px, in Light/Dark, con nominativi e importi molto lunghi.

## Branding ufficiale Quotivo — 13 settembre 2026

La sorgente canonica nel repository è `asset/quotivo-logo-master.svg`, copia byte-identica dell'asset esterno fornito (che non è stato rimosso). `src/ui/QuotivoLogo.tsx` è l'unico punto UI: `QuotivoLogo` carica il master completo, `QuotivoMark` carica `asset/quotivo-mark.svg`, estrazione geometrica del solo `#quotivo-mark` senza modifiche a colori o forme. I PNG in `asset/` sono sole derivazioni di piattaforma della Q per `icon`, foreground adaptive, monochrome e splash; `app.json` ne è l'unico riferimento nativo.

`npx expo prebuild --platform android --no-install` ha rigenerato le risorse Android: l'adaptive icon dichiara foreground, background bianco e monochrome. Nome app `Quotivo`, Android package e iOS bundle identifier `com.quotivo.app` sono invariati. Da provare fisicamente dopo reinstallazione Android: launcher/app drawer (Q centrata), tema monocromatico del launcher se disponibile, splash chiara e scura, poi wordmark in top bar.

## Stabilità rendering PDF/DOCX — 13 settembre 2026

`paginateWorkItems` non tratta più l'intera tabella come un blocco indivisibile: stima l'altezza di ciascuna lavorazione (titolo, testi facoltativi, inclusioni ed esclusioni), ripete la tabella solo quando la prossima riga non entra e riserva capacità diverse per prima pagina e pagine con header compatto. Il riepilogo rimane separabile alla pagina seguente.

`docxDocument.ts` imposta A4 portrait (`11906 × 16838` DXA), margini 720 DXA e larghezza utile 10466 DXA. Tutte le tabelle usano `TableLayoutType.FIXED`, `columnWidths`, larghezze cella, margini cella e spacing espliciti; cliente/cantiere/intestazione non concatenano più i campi. Test 34/34 verifica anche XML OOXML per A4, margini, `tblLayout=fixed` e assenza di percentuali. Da provare fisicamente esportando un emesso e aprendo il DOCX in Word e WPS Android con ragione sociale, indirizzo e titolo molto lunghi.

## Rifinitura UI/UX finale — 13 settembre 2026

`App.tsx` conserva layout mobile-first anche a larghezze ridotte: header e righe possono andare a capo, statistiche e campi compatti non richiedono spazio rigido, card e importi hanno aree flessibili. La tagline Home è stata rimossa. `PdfPreview.tsx` ha ora una X da 48px in safe area e registra `BackHandler` per chiudere esclusivamente l'anteprima; la precedente azione “Editor” non compare più.

In Step 2 il nuovo bottom sheet “Scegli dal catalogo” non sostituisce i suggerimenti inline: ricerca tutte le voci con normalizzazione NFD (quindi `tint` trova “Tinteggiatura”), mostra prezzo/U.M. e richiama `copyCatalogItem`, mantenendo la copia indipendente. Test 34/34, TypeScript e `git diff --check` superati. Restano le prove visuali reali 320/360/390/430px, Light/Dark, Back gesture e apertura/chiusura del bottom sheet su Android.
# Android release canonical workflow

## Step 0A â€” Guardrail qualitÃ  locali (14 ottobre 2026)

Sono disponibili gli script npm `code:lines`, `code:duplicates`, `code:cycles`, `code:dead` e l'aggregatore `code:guard`. Le configurazioni sono `.jscpd.json` e `.dependency-cruiser.cjs`; `scripts/check-code-lines.cjs` applica le soglie 400/600 righe e `scripts/code-guard.cjs` esegue ogni controllo anche quando uno precedente fallisce. I risultati Knip sono soltanto un inventario iniziale: non sono stati eliminati file, export o dipendenze e non sono stati introdotti boundary architetturali.

## Step 0B â€” Calibrazione Knip (14 ottobre 2026)

`knip.json` dichiara gli entrypoint runtime e dinamici: `App.tsx`, configurazione Expo, test, script, config plugin, API route Vercel e Edge Function Deno. Le due segnalazioni Expo senza import (`expo-updates`, `expo-system-ui`) sono ignorate nominativamente; gli import HTTPS di `esm.sh` restano dipendenze runtime Deno. `jszip` Ã¨ un uso diretto nei test ed Ã¨ devDependency esplicita. Restano 8 export e 7 tipi da classificare in un futuro scope; nessun refactor o cancellazione autorizzati o eseguiti.

## Step 0C â€” Knip senza debt corrente (14 ottobre 2026)

## Step 1 â€” Modello dati revisioni (14 ottobre 2026)

`quotes` dispone ora di `revision_root_quote_id`, `parent_quote_id` e `revision_number`: la Rev.0 usa `0`/null/null, mentre Rev.1+ deve puntare alla root Rev.0 e al parent consecutivo. La migrazione 14 usa default retrocompatibili, indice parziale unico e trigger SQLite. Le banche dati locali sono isolate per account, dunque i riferimenti interni alla tabella `quotes` sono nello stesso owner. Non sono stati implementati clone, UI, emissione speciale, snapshot/PDF revisionati, share o recent items. Test del modello in `tests/revisionModel.test.ts`.

## Step 2 â€” Bozza revisione da emesso (14 ottobre 2026)

`CreateRevisionUseCase` legge `issued_quote_snapshots`, rifiuta sorgenti non emesse o non piÃ¹ ultime, crea nuovi ID per quote/righe e conserva cliente, righe, quantitÃ , U.M., prezzi, IVA e sconto storici. Il profilo/condizioni non viene letto dal profilo corrente: Ã¨ disponibile nel snapshot immutabile del parent. `createRevisionDraftFromIssuedQuote` Ã¨ l'adapter SQLite transazionale e `@public` come entry repository per il futuro comando UI; non Ã¨ ancora collegato alla UI. I test coprono Rev.0â†’draft Rev.1, Rev.1â†’draft Rev.2, prezzi/totale storici, ID nuovi, immutabilitÃ  sorgente e collisione.

Knip ora passa senza finding. I simboli `@public` sono eccezioni per contratto e non ignore globali: `createDocxDocument` resta re-export di compatibilitÃ ; i tipi dominio/documento sono serializzati o persistiti; `ValidationState` e `compareVersions` sono contratti di feature; `Card` e `Section` sono primitive UI condivise. Sono stati rimossi solo `legacyTransferContainsAll`, `shadows` e i modifier `export` non necessari su `isExpoGoRuntime` e `itemBaseCents`. Non toccare queste annotazioni per far passare Knip senza verificare prima il relativo contratto.

Usare esclusivamente `npm run android:release` per produrre l'APK standalone. Richiede JDK 17 e un `.env` gitignored con le due variabili Expo pubbliche Supabase. Non eseguire `gradlew clean` alla cieca né build release manuali con env impostate a mano: lo script carica l'ambiente, verifica Codegen e bundle, usa Gradle senza daemon e copia l'APK solo dopo il successo. Per il preflight rapido usare `npm run android:release:check`.

## Varianti Android

Stable resta `Quotivo` / `com.quotivo.app` / `quotivo`; sviluppo è `Quotivo Dev` / `com.quotivo.app.dev` / `quotivo-dev`. Usare `npm run android:dev` e `npm run start:dev` esclusivamente per la variante Dev. Le due app hanno sandbox Android distinte, quindi SQLite, AsyncStorage e SecureStore non sono condivisi. Aggiungere `quotivo-dev://auth/callback` alle Redirect URLs Supabase prima del primo Google login Dev.

## Quote issuance

`quote_issuance` è l'identità backend canonica dell'emissione autorizzata. Scope 6 collegherà snapshot pubblico, sharing e stato tramite `issuance_id`; non inserire questi concetti nel ledger quota.
## Recenti lavorazioni — 16 ottobre 2026

`src/features/recent-work-items/recentWorkItems.ts` deriva le lavorazioni dai preventivi emessi e sceglie una sola revisione corrente per chain; non aggiunge una tabella. Nell’editor, il bottom sheet Recenti offre Usa (copia modificabile) e Salva nel catalogo (normale controllo duplicati); una voce già catalogata è segnalata. Test 80/80, typecheck e code guard passano; resta una prova visiva Android del bottom sheet.

## Scope 6B

Migration remota 008 e Edge Function `quote-share-owner` / `quote-public` distribuite. Il dominio futuro resta configurato da `app_config.public_base_url`; prima dell'uso reale va instradato verso la Function pubblica, altrimenti usare temporaneamente l'endpoint Edge tecnico configurato. I token non sono in SQLite né in tabelle leggibili dall'app.
