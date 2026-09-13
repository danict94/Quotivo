# Quotivo — Roadmap operativa

## Regola di avanzamento

Procedere per scope piccoli ma completi.
Ogni scope deve avere:
- comportamento reale;
- gestione errori;
- verifiche;
- aggiornamento della documentazione.

Non dichiarare completata una funzione solo perché esiste il pulsante.

## Stato iniziale confermato

Realizzato:
- prima interfaccia Expo;
- dashboard;
- elenco preventivi dimostrativi;
- navigazione tra Home, Archivio e Impostazioni;
- aggiunta in memoria di una riga dimostrativa;
- primo commit e push eseguiti dall'utente;
- Expo 57.0.22 confermato dall'utente;
- Expo Doctor superato secondo l'output fornito.

Non ancora realizzato nel prototipo consegnato:
- persistenza SQLite;
- editor completo del preventivo;
- gestione clienti;
- template modificabili;
- catalogo voci;
- profilo attività;
- logo persistente;
- esportazioni;
- backup e ripristino;
- numerazione definitiva transazionale.

Ricontrollare il codice locale: potrebbe contenere modifiche successive.

## Scope 1 — Fondazioni e preventivo persistente
Stato: DA IMPLEMENTARE

- Separare UI, dominio e accesso dati.
- Configurare SQLite e migrazioni.
- Rimuovere i dati dimostrativi dall'utilizzo normale.
- Creare una bozza senza numero.
- Compilare cliente, titolo, luogo e note.
- Aggiungere/modificare/rimuovere righe.
- Gestire quantità, unità, prezzi, sconti e IVA.
- Mostrare totali calcolati.
- Salvare e riaprire la bozza.
- Finalizzare con numero univoco.
- Bloccare i contenuti del documento emesso.
- Duplicare come nuova bozza.
- Gestire stati, archiviazione e ricerca.
- Alimentare la dashboard con dati reali.

Criteri di accettazione:
- I dati restano dopo il riavvio.
- Due finalizzazioni producono numeri distinti.
- Un doppio tap non emette due documenti.
- Un errore di salvataggio non mostra un falso successo.
- I documenti emessi non cambiano modificando altri dati.
- I test dei calcoli e della numerazione passano.

## Scope 2 — Clienti, catalogo e template
Stato: DA IMPLEMENTARE

- Rubrica clienti con creazione, modifica e ricerca.
- Catalogo con categorie, unità e prezzi.
- Quattro basi iniziali secondo il brief.
- Creazione, duplicazione e modifica dei template.
- Voci precaricate nella nuova bozza.
- Riordino delle righe.
- Condizioni e note predefinite.

Criteri di accettazione:
- Modificare un template non modifica una bozza già creata.
- Cambiare prezzo nel catalogo non altera lo storico.
- Le nuove bozze ereditano i valori aggiornati.
- Eliminare un elemento usato non rompe i documenti esistenti.

## Scope 3 — Attività e documenti
Stato: DA IMPLEMENTARE

- Dati attività.
- Logo persistente.
- Condizioni e pagamenti predefiniti.
- Stile documento configurabile.
- Esportazione PDF.
- Esportazione DOCX.
- Esportazione XLSX.
- Condivisione tramite le funzioni del dispositivo.

Criteri di accettazione:
- Totali identici nell'app e nei documenti.
- DOCX modificabile e XLSX con formule funzionanti.
- PDF multipagina leggibile.
- Nessun dato troncato con descrizioni lunghe.
- Errori di generazione e annullamento condivisione gestiti.

## Scope 4 — Affidabilità e backup
Stato: DA IMPLEMENTARE

- Backup completo esportabile.
- Ripristino validato.
- Test migrazioni.
- Test input non validi.
- Accessibilità e leggibilità.
- Gestione tastiera, aree sicure e pulsante indietro.
- Prove Android e iOS.
- Verifica comportamento senza rete.

Criteri di accettazione:
- Un backup ripristina preventivi, contatore, template e logo.
- Un backup danneggiato non distrugge i dati.
- Un aggiornamento dello schema preserva i dati esistenti.
- Non sono presenti controlli interattivi senza comportamento
  o senza indicazione esplicita di indisponibilità.

## Scope 5 — Distribuzione
Stato: FUTURO

- Identità definitiva e verifica disponibilità del nome.
- Identificativi applicazione definitivi.
- Icona e schermate store.
- Informazioni privacy coerenti con i dati realmente trattati.
- Build firmate e test di distribuzione.
- Invio agli store con autorizzazione dell'utente.

## Scope 6 — Account e cloud
Stato: FUTURO, NON IN SCOPE ORA

- Registrazione e autenticazione.
- API e database remoto.
- Sincronizzazione e conflitti.
- Numerazione tra dispositivi.
- Backup cloud.
- Pannello amministratore con accessi limitati.
- Collegamento volontario a Esigenta.

## Registro avanzamento

A ogni scope aggiungere:
- data;
- file modificati;
- comportamento implementato;
- verifiche eseguite e relativo esito;
- verifiche non eseguite;
- problemi aperti;
- prossimo passo.

### 11 settembre 2026 — Correzione barra di navigazione mobile

- File modificati: `quotivo-mobile/App.tsx`, dipendenze npm.
- La barra inferiore usa gli inset di sistema ed evita la sovrapposizione con i controlli Android.
- Aree touch dei tab portate ad almeno 88 × 48 punti; padding dello scroll adattato all'inset inferiore.
- Verifiche: TypeScript, bundle Expo Android e `git diff --check` superati.
- Da verificare: prova visiva su telefono con navigazione a tre tasti e a gesti.

### 11 settembre 2026 — Scope affidabilità 1

- File applicativi: `App.tsx`, `src/domain.ts`, `src/database.ts`, `src/migrations.ts`, `src/quoteTransactions.ts`.
- Test: `tests/reliability.test.ts`; dipendenze di sviluppo `tsx`, `sql.js`, tipi associati.
- Documentazione e `AGENTS.md` copiati conservativamente dentro la radice Git; copie esterne mantenute, copia interna dichiarata canonica.
- Input numerici materializzati sincronicamente al tap, migrazioni versionate, contatore persistente, finalizzazione atomica, snapshot immutabile e guardia doppio tap implementati.
- Test coperti: ultimo input attivo, decimali italiani, migrazione conservativa, inizializzazione/avanzamento contatore, finalizzazione ripetuta, immutabilità e rollback su errore snapshot.
- Limiti: gli emessi storici non hanno snapshot retroattivo; lo snapshot corrente contiene solo i campi esistenti. Mancano ancora quantità decimale non-floating-point, modalità a corpo, sconti/IVA e test Expo Go su dispositivo.
- Verifiche eseguite: `npm test` 5/5, `npm run typecheck`, Expo Doctor 21/21, bundle Android Expo e `git diff --check`, tutti superati.

### 11 settembre 2026 — Profilo attività persistente

- Migrazione schema 3 con profilo attività singleton e valori predefiniti.
- Nuova schermata Impostazioni: dati essenziali visibili e condizioni/validità/pagamenti espandibili.
- Selezione, sostituzione e rimozione logo PNG/JPG/WEBP/SVG; copia persistente nella directory documenti e pulizia conservativa del file sostituito.
- Validazione tramite firma dei raster, corrispondenza MIME, limite 5 MB e filtro SVG attivo/esterno.
- I nuovi snapshot includono profilo e logo base64 effettivamente usati; gli snapshot precedenti restano invariati.
- Verifiche automatiche intermedie: TypeScript superato e 6/6 test superati, inclusi formati e SVG non sicuri.
- Prova dispositivo ancora necessaria: selettore documenti e persistenza dopo riavvio in Expo Go.
- Prossimo incremento: clienti separati dal cantiere, quindi unità e modalità a misura/a corpo.

### 12 settembre 2026 — Ciclo completo, incremento A/B1

- Importata `docs/QUOTIVO-CICLO-COMPLETO.md` nella documentazione canonica; prevale sulle decisioni precedenti in conflitto.
- Migrazione 4 conservativa: unicità numero per anno, data locale, offset, scadenza e sequenze annuali persistenti.
- Gli emessi legacy conservano numero e contenuti senza anno ricostruito; nessuna rinumerazione o deduzione dall'istante UTC.
- Emissione con un solo istante acquisito, anno locale, offset e scadenza in giorni di calendario; snapshot versione 2.
- UI archivio e dettaglio mostrano `numero/anno`; i legacy continuano a mostrare il numero storico.
- Verifiche automatiche intermedie: TypeScript e 8 test superati, incluso cambio anno 2026/2027 e rollback.
- Restano: modello economico esatto, cliente/cantiere, lavorazioni adattive e percorso documentale.

### 12 settembre 2026 — Correzione import logo Android

- Corretto il crash Expo Go `FileSystemFile.bytes: Missing READ permission`: la lettura non avviene più direttamente sull'URI del picker.
- `expo-document-picker` mantiene esplicitamente `copyToCacheDirectory: true`; URI `content://` e `file://` vengono prima copiati in cache privata tramite API Expo compatibile SAF.
- Firma, MIME, limite 5 MB e sicurezza SVG vengono verificati esclusivamente sulla copia privata; solo dopo viene creata la copia persistente.
- Temporanei rimossi in `finally`; copia persistente parziale rimossa su errore; sostituzione/rimozione e snapshot invariati.
- Nessun permesso storage Android aggiunto.
- Verifiche automatiche intermedie: 10/10 test e TypeScript superati. Prova fisica Expo Go Android ancora necessaria.
- Dopo riscontro reale di un provider che rifiutava anche `copyAsync`, aggiunti fallback ordinati `expo/fetch` e trasferimento Base64 legacy. Ogni tentativo fallito pulisce il file parziale; validazione e `File.bytes()` restano limitati alla copia privata.
- Verifiche finali del fix: 12/12 test, TypeScript ed Expo Doctor 21/21 superati; `git diff --check` senza errori.

### 12 settembre 2026 — Template Standard, dominio e editor minimo

- Definito il contratto canonico `QUOTIVO-TEMPLATE-STANDARD.md` e portato il riferimento HTML nella radice Git.
- Migrazione 5 additiva: lavorazioni a misura/a corpo, dettagli facoltativi, opzioni, sconti, IVA, introduzione, unità e aliquote personalizzate persistenti.
- Motore economico esatto con quantità a quattro decimali, centesimi, percentuali a due decimali, half-up, sconto globale a maggiori resti e IVA per gruppo.
- Editor mobile: selettori touch per modalità, unità e IVA; creazione di unità/aliquote riusabili; dettagli espandibili; riepilogo imponibile/IVA/totale.
- Nuove emissioni: snapshot schema 3 `standard-v1` con struttura e risultato economico; snapshot storici invariati.
- Verifiche automatiche e limiti sono registrati in HANDOFF. Restano cliente/cantiere e generazione/anteprima del documento effettivo; nessun PDF è stato simulato.

### 12 settembre 2026 — Editor preventivo a tre step

- Migrazione 7: rubrica clienti minima SQLite, IVA predefinita per preventivo e stato conferma delle lavorazioni.
- Editor organizzato in Cliente e lavoro, Lavorazioni, Riepilogo e documento. Le voci confermate diventano card compatte; una voce aperta non contribuisce a totale, PDF o emissione.
- Il Template Standard usa una sola tabella lavorazioni e nasconde visivamente la colonna IVA quando tutte le righe economiche hanno lo stesso trattamento.
- Resta richiesta una prova UX/PDF su dispositivo.

### 12 settembre 2026 — Completamento cliente e PDF Standard

- Migrazione 8 additiva: copia completa dei dati cliente sul preventivo e congelamento nello snapshot emesso; la modifica successiva della rubrica non cambia bozze o documenti già creati.
- PDF: Cliente/Cantiere hanno etichette esplicite e mostrano solo dati presenti; il logo e l'intestazione completa restano sulla prima pagina, mentre le pagine successive usano l'header minimo.
- Editor: descrizione breve visibile sotto il nome voce; unità e IVA selezionabili da controllo compatto con valori custom persistenti.

### 12 settembre 2026 — Cleanup modello lavorazione DEV

- Rimossi dal modello, schema pulito, editor, snapshot e renderer: gruppo, etichetta riepilogo, note e stato opzione selezionata.
- `isOptional` ora esclude sempre la lavorazione dal totale base e la mostra nelle opzioni con il suo importo reale.
- L’app usa il database di sviluppo nuovo `quotivo-dev-v2.db`; nessun dato di sviluppo precedente viene migrato.

### 12 settembre 2026 — Primo ciclo PDF reale

Aggiornamento renderer Standard v2: introdotte gerarchia gruppo/voce, tabella professionale a sei colonne, dettagli facoltativi nella cella Voce, righe A corpo prive di valori fittizi e pagine A4 esplicite con footer letterale `Pagina X di Y`. Il watermark BOZZA è limitato alla preview draft. Nessuna modifica a dominio, SQLite, snapshot, numerazione, emissione o Template Pro; le esclusioni generali restano omesse finché non esiste un dato distinto.

- Pipeline separata modello documentale/renderer/PDF con `expo-print`; formato richiesto A4 210 × 297 mm e renderer `standard-a4-v1`.
- Anteprima bozza salva gli input attivi, non assegna numero e genera un PDF temporaneo marcato BOZZA.
- Emissione atomica invariata; dopo il commit genera dal relativo snapshot un PDF definitivo persistente e non sovrascrivibile.
- Migrazione 6 additiva con indirizzi cliente/cantiere e stato `document_exports`; errore post-emissione recuperabile tramite `Rigenera PDF` senza nuova numerazione.
- Viewer reale `react-native-pdf`: zoom e scorrimento in development build. Expo Go non supporta il modulo nativo e mostra il limite esplicitamente.
- Verifiche automatiche documentate in HANDOFF. Ispezione visuale A4/multipagina e prova development build su telefono ancora necessarie.
- Verifiche concluse: 20/20 test, TypeScript, Expo Doctor 21/21, bundle Android, risoluzione config plugin, Prebuild Android e `git diff --check` superati. Il manifest generato rimuove esplicitamente READ/WRITE_EXTERNAL_STORAGE.

### 12 settembre 2026 — Catalogo locale lavorazioni

- Migrazione 9 aggiunge `catalog_items`: titolo univoco, modalità, U.M. solo per voci a misura e prezzo in centesimi.
- L’editor può salvare la lavorazione corrente nel catalogo o copiarne una cercata, senza collegamenti vivi con il preventivo.
- La navigazione principale include Catalogo: ricerca, creazione, modifica e cancellazione con conferma.
- Il campo Lavorazione suggerisce fino a tre corrispondenze inline e precompila la copia selezionata senza aggiornare il catalogo.
- Verifiche automatiche: 29/29 test, TypeScript e `git diff --check` superati. Resta la prova fisica su dispositivo.

### 13 settembre 2026 — Rubrica clienti essenziale

- Aggiunta destinazione Clienti con ricerca, creazione, modifica e cancellazione confermata sulla tabella SQLite esistente.
- Migrazioni 10-11 ricostruiscono il solo vincolo di riferimento: cancellare un cliente scollega `client_id` ma conserva bozze, emessi e snapshot immutabili.
- Verifiche automatiche: 30/30 test, TypeScript e `git diff --check` superati. Resta la prova fisica su dispositivo.

### 13 settembre 2026 — Export e condivisione documenti

- Preventivi emessi: menu compatto per condividere il PDF finale esistente o un DOCX derivato dal medesimo snapshot immutabile.
- Aggiunte le dipendenze minime `docx` per OOXML reale ed `expo-sharing` SDK 57 per il foglio nativo Android/iOS.
- Verifiche automatiche: 31/31 test, TypeScript e `git diff --check` superati; il DOCX viene verificato come archivio OOXML valido.

### 13 settembre 2026 — Collegamenti profilo e rubrica nel preventivo

- Step 1 mostra il riepilogo del BusinessProfile esistente, reindirizza alle Impostazioni e blocca anteprima/finalizzazione se manca la denominazione richiesta.
- Aggiunti selettore compatto dalla Rubrica e “Crea preventivo” dal dettaglio cliente; la bozza riceve sempre una copia autonoma dei dati cliente.
- Nessuna migrazione o campo aggiuntivo. Verifiche automatiche: 31/31 test, TypeScript e `git diff --check` superati.

### 13 settembre 2026 — Flusso immediato post-emissione

- Dopo la finalizzazione atomica viene riletto lo snapshot emesso e viene mostrato direttamente un riepilogo “Preventivo emesso” con numero e data.
- Il riepilogo riusa le stesse funzioni PDF/DOCX e share sheet del dettaglio Archivio: Condividi PDF, Esporta PDF/Word e Torna ai preventivi. Il dettaglio Archivio conserva le proprie azioni.

### 13 settembre 2026 — Gestione bozze vuote ed eliminazione

- Uscendo dall’editor, una bozza viene scartata solo se non contiene campi cliente, titolo, introduzione, sconto globale né una lavorazione con contenuto o valori diversi dalla riga vuota iniziale.
- Home e Archivio mostrano il pulsante azioni `⋯` esclusivamente sulle bozze: la conferma “Elimina bozza” rimuove bozza e lavorazioni, senza agire su clienti o catalogo.
- Verifiche automatiche: `npm test` 33/33, `npm run typecheck` e `git diff --check` superati. Resta la prova touch su Expo Go.

### 13 settembre 2026 — UI Foundations

- Aggiunti i token condivisi per colori, spaziature, raggi, tipografia, elevazione e target touch in `src/ui/tokens.ts`.
- Aggiunti componenti base leggeri (`Button`, `Input`, `Card`, `Section`, `Select`, `Toggle`, `EmptyState`) e wrapper icone; gli input, toggle, stato vuoto, selettore catalogo, preview PDF e tab bar iniziano a riusarli.
- `@expo/vector-icons` è l’unica dipendenza aggiunta, installata con Expo 57; tab bar e ritorno preview non usano più glifi testuali. Nessun flusso, schema, calcolo o documento è stato modificato.
- Verifiche automatiche: `npm test` 33/33, `npm run typecheck` e `git diff --check` superati. Resta solo la verifica visiva su Expo Go.

### 13 settembre 2026 — Redesign light/dark

- Implementati token semantici Light/Dark dalla palette di riferimento, tema Sistema e scelta obbligatoria al primo avvio; la preferenza è salvata localmente e modificabile da Impostazioni > Aspetto.
- Home, archivio, editor, clienti, catalogo, impostazioni e azioni emesso riusano superfici, bordi, testi, green/violet e card del nuovo sistema. Il brand mark temporaneo è centralizzato in un solo componente.
- Nessuna modifica a SQLite business, migrazioni, calcoli, PDF/DOCX, snapshot, numerazione o workflow. Verifiche: `npm test` 33/33, typecheck e `git diff --check` superati; resta la prova visiva Expo Go.

### 13 settembre 2026 — Audit responsive mobile

- Corrette le card preventivo con numeri/documenti, titoli, clienti e importi lunghi: ora hanno area flessibile, limiti coerenti e troncamento controllato.
- Aspetto usa tre controlli verticali a target touch completo; tab bar, azioni export/catalogo, form a colonne, logo e pannelli gestiscono wrapping e `minWidth: 0` sui viewport stretti.
- Verifiche automatiche: `npm test` 33/33, `npm run typecheck` e `git diff --check` superati. Da verificare fisicamente 320/360/390/430px, entrambi i temi.

### 13 settembre 2026 — Branding ufficiale Quotivo

- `asset/quotivo-logo-master.svg` è la copia canonica byte-identica della sorgente consegnata; l'originale esterno è stato preservato. `asset/quotivo-mark.svg` contiene esclusivamente il gruppo `#quotivo-mark` originale.
- L'app usa il master per il brand completo e la Q estratta per onboarding, launcher/adaptive/monochrome icon e splash. Nome `Quotivo` e identificativo `com.quotivo.app` restano invariati.
- Rigenerata la configurazione Android con Expo Prebuild. Restano da verificare fisicamente icona e splash dopo reinstallazione della build Android.

### 13 settembre 2026 — Stabilità rendering PDF/DOCX

- La paginazione Standard ora distribuisce le righe singolarmente in base allo spazio verticale stimato della prima pagina e delle pagine successive, senza spostare l'intera tabella in anticipo. Footer, margini e running header restano invariati.
- Il DOCX usa A4 portrait, margini e tabelle a griglia DXA con layout fisso; intestazione, cliente e cantiere usano paragrafi distinti. Da confermare con Word/WPS Android usando dati molto lunghi.

### 13 settembre 2026 — Rifinitura UI/UX finale

- Rimossi overflow prevedibili su viewport stretti: sezioni, statistiche, intestazioni archivio/editor, campi compatti e riepiloghi ora possono contrarsi o andare a capo mantenendo target touch leggibili.
- Home non mostra più la tagline sotto il logo. L'anteprima PDF ha chiusura X in safe area e intercetta il Back Android senza uscire dall'app.
- Step 2 aggiunge un bottom sheet “Scegli dal catalogo”, con ricerca parziale case/accent-insensitive e copia indipendente della voce. Da verificare fisicamente a 320/360/390/430px in Light e Dark.
