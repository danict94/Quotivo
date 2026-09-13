# Audit funzionale, dati ed esperienza mobile dei preventivi

Data audit: 11 settembre 2026  
Ambito: codice locale presente in `quotivo-mobile`, documentazione locale e requisiti sintetizzati nella richiesta di audit.  
Esclusioni: nessuna modifica all'app o al database, nessuna installazione, nessun test su dispositivo, nessuna generazione documenti.

## Sintesi esecutiva

Quotivo dispone di un primo percorso reale per creare una bozza, inserire righe economiche, salvarla in SQLite, riaprirla dall'archivio e marcarla come emessa. I totali mostrati nell'app derivano dalle righe e gli importi unitari sono memorizzati in centesimi. Le bozze non ricevono un numero alla creazione e alcuni trigger SQLite impediscono la modifica o cancellazione dei dati emessi.

Questo nucleo non è ancora sufficiente per produrre veri preventivi edili professionali. Il modello rappresenta soltanto cliente, titolo e righe `quantità × prezzo`: mancano modalità a corpo, unità strutturate e selezionabili, introduzione, capitoli, note non economiche, opzioni, dati di attività e cantiere, condizioni, pagamenti, fiscalità esplicita, snapshot completi e documenti esportabili. Non esiste un'anteprima destinata al cliente.

Le criticità più urgenti sono strutturali:

1. La finalizzazione non racchiude salvataggio completo, assegnazione numero e snapshot in un'unica transazione.
2. Il numero viene calcolato con `MAX(number) + 1`, in contrasto con la decisione architetturale sul contatore dedicato.
3. Non esiste un sistema di migrazioni versionate: lo schema è composto soltanto da `CREATE ... IF NOT EXISTS`.
4. Il modello delle righe non distingue prezzo a misura e a corpo, né quantità descrittiva e quantità fatturata.
5. L'editor usa testo libero per le unità e non supporta capitoli, introduzione e opzioni.
6. Non sono presenti generazione o anteprima PDF, DOCX o XLSX.

Valutazione complessiva: **prototipo persistente iniziale, non ancora utilizzabile per emettere un preventivo professionale completo**.

## Fonti e limiti dell'audit

Sono stati letti:

- `AGENTS.md`;
- `README.md`;
- `docs/quotivo-brief.md`;
- `docs/ARCHITECTURE.md`;
- `docs/ROADMAP.md`;
- `docs/HANDOFF.md`;
- `quotivo-mobile/SETUP.md`;
- tutto il codice applicativo attuale: `App.tsx`, `src/domain.ts`, `src/database.ts` e configurazione Expo/npm.

I documenti originali dei preventivi reali non risultano nella cartella ispezionata e non si afferma di averli letti. Le quattro tipologie e l'esempio bagno forniti nella richiesta sono trattati come requisiti di prodotto.

Al momento dell'audit la radice Git verificata era `quotivo/quotivo-mobile` e la documentazione si trovava nella cartella esterna. Dal primo scope di affidabilità questa copia in `quotivo-mobile/docs` è canonica; gli originali esterni sono conservati senza aggiornamenti automatici. Lo stato dell'app conteneva già modifiche non committate, che sono state preservate.

## Stato attuale dimostrato dal codice

### Funzioni presenti

- Apertura di `quotivo.db` tramite `expo-sqlite`.
- Tabelle `quotes` e `quote_items`, chiave esterna con cancellazione a cascata e indice per ordine delle righe.
- Creazione immediata di una bozza vuota persistente, con ID interno e numero `NULL`.
- Editor di cliente, titolo, descrizione riga, quantità, unità libera e prezzo unitario.
- Aggiunta e rimozione delle righe in memoria; salvataggio complessivo delle righe in transazione.
- Totale riga calcolato con `Math.round(quantity × unitPriceCents)` e totale preventivo come somma delle righe.
- Parsing basilare della virgola decimale e formattazione EUR italiana.
- Archivio alimentato da SQLite e dashboard derivata dai preventivi caricati.
- Finalizzazione che assegna un numero e porta lo stato da `draft` a `issued`.
- Trigger che impediscono aggiornamento/cancellazione di un preventivo emesso e inserimento/modifica/cancellazione delle sue righe.
- UI di sola lettura per un preventivo emesso.

### Funzioni non dimostrate

- Persistenza dopo chiusura forzata o riavvio verificata su un dispositivo reale.
- Migrazione da una versione precedente dello schema.
- Due finalizzazioni concorrenti o doppio tap verificati automaticamente.
- Correttezza numerica su casi limite, sconti, IVA e quantità frazionarie.
- Produzione, anteprima o condivisione di un documento.
- Funzionamento Android/iOS effettivo, accessibilità con screen reader e comportamento con tastiera fisica/mobile.

## Matrice dei requisiti

Legenda priorità: **P0** blocca emissione affidabile; **P1** necessaria per preventivi professionali; **P2** miglioramento successivo.

| Requisito | Stato | Evidenza nel codice | Priorità |
|---|---|---|---|
| Bozza con ID stabile e senza numero | Presente | `createDraft()` inserisce una riga senza `number`; vincolo `draft/number NULL` | P0, già presente |
| Persistenza SQLite di preventivi e righe | Presente | `quotes`, `quote_items`, `saveDraft()`, `listQuotes()` | P0, da testare su device |
| Riapertura dall'archivio | Presente | caricamento iniziale e `QuoteRow` che apre l'editor | P0, da testare su device |
| Selettore touch delle unità | Assente | `Unità` è un `TextInput` | P0 |
| m², m lineari, m³, pezzi, punti, ore, giornate | Parziale | accettabili solo come testo libero; nessun elenco o semantica | P0 |
| Unità personalizzate salvabili e riutilizzabili | Assente | nessuna tabella/catalogo unità | P1 |
| ID unità separato dall'etichetta | Assente | `QuoteItem.unit` è una singola stringa | P1 |
| Compatibilità con unità libere già salvate | Presente/fragile | la stringa libera viene conservata; servirà migrazione conservativa verso `unit_id + label snapshot` | P0 |
| Prezzo a misura | Presente | totale riga = quantità × centesimi unitari | P0, da irrobustire |
| Prezzo a corpo | Assente | nessun `pricingMode` o importo complessivo | P0 |
| Quantità descrittiva distinta dal criterio prezzo | Assente | l'unica quantità partecipa sempre al calcolo | P0 |
| Oggetto breve separato dall'introduzione | Assente | esiste solo `title` | P0 |
| Capitoli ordinabili con titolo e descrizione | Assente | nessuna entità capitolo | P0 |
| Descrizioni multilinea ed elenchi | Assente | input descrizione senza `multiline`; nessuna struttura elenco | P1 |
| Righe economiche e note descrittive distinte | Assente | tutte le righe hanno quantità e prezzo | P1 |
| Inclusioni/esclusioni per lavorazione | Assente | campi non presenti | P1 |
| Inclusioni/esclusioni generali | Assente | campi non presenti | P1 |
| Manodopera/materiali inclusi, esclusi o del cliente | Assente | nessun tipo o responsabilità fornitura | P1 |
| Riepilogo derivato dagli stessi dati | Parziale | il solo totale globale deriva dalle righe; nessun riepilogo per capitolo/opzioni/fisco | P0 |
| Regola anti doppio conteggio capitolo/righe | Assente | i capitoli non esistono | P0 |
| Opzioni distinte dalle lavorazioni base | Assente | nessun flag/gruppo opzionale | P0 |
| Totale base e totale con opzioni | Assente | un solo totale | P0 |
| Selezione opzioni | Assente | nessuno stato di selezione | P1 |
| Regole sconto/IVA sulle opzioni | Assente | sconto e IVA non esistono | P1 |
| Protezione delle opzioni dopo emissione | Assente nel modello | i trigger proteggerebbero solo le attuali righe; non esistono opzioni | P0 |
| Dati attività e logo | Assente | nessuna entità o UI | P1 |
| Committente separato dal luogo lavori | Assente | `client` è una stringa; luogo non presente | P1 |
| Numero e data emissione | Parziale | numero e `issued_at` persistono, ma la data non è mostrata/configurabile | P0 |
| Validità, inizio e durata prevista | Assente | campi non presenti | P1 |
| Pagamenti per fase e scadenze | Assente | campi non presenti | P1 |
| Verifica percentuali pagamento | Assente | nessun modello/calcolo | P1 |
| Condizioni, esclusioni, accettazione | Assente | campi e documento non presenti | P1 |
| IVA esplicita senza deduzioni automatiche | Assente | nessun campo fiscale | P1 |
| Anteprima cliente distinta dall'editor | Assente | unica vista editor/lettura | P0 |
| Anteprima del PDF realmente generato | Assente | nessun modulo documenti | P0 |
| Anteprima prima della finalizzazione | Assente | nessun comando o renderer | P0 |
| Quattro presentazioni documentali | Assente | nessun layout documento | P1 |
| Stile documento separato dai template lavorazioni | Assente | entrambi non implementati | P1 |
| Un solo modello/calcolo condiviso dai formati | Parziale | esistono funzioni centrali per il totale attuale; nessun DTO documento/esportatore | P0 |
| Impaginazione lunga/multipagina/logo/firme | Assente | nessuna generazione | P1 |
| Colonne adattate alla modalità di prezzo | Assente | nessun documento e nessuna modalità | P1 |
| PDF, DOCX e XLSX coerenti | Assente | dipendenze e codice non presenti | P1 |
| Condivisione senza falso stato inviato | Non applicabile ora | nessuna condivisione; stato limitato a bozza/emesso | P1 |
| Migrazioni conservative | Assente | solo `CREATE TABLE IF NOT EXISTS`; nessun `user_version` o runner | P0 |
| Snapshot completo all'emissione | Parziale insufficiente | righe e stringa cliente diventano immutabili, ma mancano snapshot attività, cliente, condizioni, fisco e configurazione documento | P0 |
| Numerazione transazionale con contatore | Parziale/critico | assegnazione in transazione esclusiva, ma usa `MAX + 1` e il salvataggio avviene prima in un'altra transazione | P0 |
| Protezione dal doppio tap | Parziale | pulsanti disabilitati tramite stato e `UPDATE ... status='draft'`; nessun test e possibile doppio evento prima del render | P0 |
| Calcoli decimali e arrotondamenti definiti | Parziale/fragile | centesimi interi per prezzi, ma quantità `REAL`/JS `number`; unica regola implicita `Math.round` | P0 |
| Sconti e IVA verificati | Assente | modello e test assenti | P1 |
| Totali derivati | Presente per il modello minimo | nessuna colonna totale; somma calcolata dalle righe | P0, già presente |
| Stati vuoti ed errori | Parziale | empty state e `Alert`; caricamento presente, retry e error state persistente assenti | P1 |
| Tastiera e utilizzo da telefono | Parziale | `KeyboardAvoidingView` solo iOS; campi numerici compatti; nessuna prova su device | P1 |
| Accessibilità | Assente | nessuna label/role/hint esplicita; simboli usati nella navigazione | P1 |
| Ricerca e filtri archivio | Assente | lista completa senza controlli | P2 |
| Backend/account/Neon assenti | Presente | solo SQLite; nessuna dipendenza o chiamata remota rilevata | Vincolo rispettato |

## Bug e rischi riproducibili

### B1 — Salvataggio e finalizzazione non atomici (P0)

Percorso nel codice:

1. `finalizeDraft()` chiama `saveDraft(quote)`.
2. `saveDraft()` termina la propria transazione.
3. Solo dopo viene aperta una transazione esclusiva per assegnare numero e stato.

Se il secondo passaggio fallisce, le ultime modifiche risultano salvate ma il documento resta bozza. Soprattutto, non esiste una singola transazione che validi, incrementi un contatore, salvi lo snapshot e registri lo storico come richiesto dall'architettura. È un difetto dimostrato staticamente; per riprodurre l'errore concreto occorre iniettare un fallimento tra le due transazioni.

### B2 — Numerazione basata su `MAX(number) + 1` (P0)

La query di finalizzazione calcola il progressivo dalla tabella dei preventivi. L'architettura richiede esplicitamente una `NumberSequence` e vieta `MAX + 1` come unico meccanismo. Oggi i trigger riducono il rischio di riuso perché impediscono la cancellazione degli emessi, ma non sostituiscono un contatore monotono con migrazione e test dedicati.

### B3 — Nessuna migrazione degli schemi già installati (P0)

`initializeDatabase()` esegue `CREATE TABLE/TRIGGER IF NOT EXISTS`. Una futura aggiunta di colonne, indici o vincoli non aggiornerà in modo controllato un database esistente. Non è registrata alcuna versione schema e non esistono test upgrade/rollback. Questo blocca l'estensione sicura dei nuovi campi richiesti.

### B4 — Valori numerici non validi diventano silenziosamente zero (P0)

`parseDecimal()` restituisce `0` per testo non numerico, infinito o negativo. L'utente non riceve un errore: un refuso può quindi trasformare silenziosamente quantità o prezzo in zero. Il database ammette inoltre quantità e importi pari a zero. Occorre distinguere input vuoto, non valido, fuori limite e zero intenzionale.

### B5 — Possibile perdita dell'ultimo valore numerico prima del salvataggio (P0 da verificare su device)

`NumericField` conserva una stringa locale e aggiorna il preventivo nel callback `onBlur`. Premere immediatamente “Salva” o “Finalizza” mentre il campo è attivo può provocare una gara tra blur, aggiornamento React e handler del pulsante; `persist()` può osservare la versione precedente di `quote`. La sequenza degli eventi va verificata su Android e iOS e rimossa facendo convergere esplicitamente i valori dell'editor prima della validazione.

### B6 — Uscita dall'editor senza gestione modifiche (P1)

Il comando “Archivio” chiude l'editor senza salvare e senza avviso. Il tasto indietro Android non è gestito. Le modifiche in memoria possono andare perse. Al contrario, premere “Nuovo” crea subito nel database una bozza vuota: uscire senza compilarla lascia una riga vuota nell'archivio. È necessario scegliere e comunicare una politica coerente (autosave affidabile oppure conferma salva/scarta).

### B7 — Doppio tap gestito solo parzialmente (P0 da verificare)

`setSaving(true)` e `disabled={saving}` riducono i tap ripetuti, mentre il predicato SQL impedisce che la stessa riga venga emessa due volte. Prima del nuovo render potrebbero tuttavia partire due handler. Il secondo dovrebbe fallire, mostrando potenzialmente un errore dopo il successo del primo. Mancano un mutex sincrono/ref, idempotenza esplicita e test di concorrenza.

### B8 — Il trigger rende impossibili anche gli aggiornamenti commerciali (P1)

Il trigger `prevent_issued_quote_update` blocca ogni `UPDATE` della riga emessa. Protegge i contenuti, ma impedirebbe anche passaggi leciti come inviato, accettato, rifiutato o annullato. Stato commerciale, storico eventi e contenuto snapshot devono essere separati.

### B9 — Errori asincroni in uscita non gestiti localmente (P1)

`closeEditor()` attende `refresh()` senza `try/catch`. È richiamato anche da callback di `Alert`; un errore di lettura SQLite può produrre una Promise rifiutata e lasciare la navigazione in uno stato incoerente.

### B10 — Prestazioni archivio non scalabili (P2)

`listQuotes()` carica tutti i preventivi e tutte le righe, poi associa le righe con un `filter` completo per ciascun preventivo. È adeguato a pochi record, ma ha costo crescente e non offre paginazione, ricerca o caricamento del dettaglio su richiesta.

## Proposta minima di estensione del modello dati

La proposta evita quattro modelli separati per i quattro layout. Il contenuto resta unico; presentazione e template sono riferimenti/configurazioni distinti. Prima di applicarla serve un sistema di migrazioni versionate e testato sui database correnti.

### Principi

- Gli importi monetari restano interi in centesimi.
- Le quantità non devono usare floating point senza una regola esplicita: conservarle come intero scalato (`quantity_minor` + `quantity_scale`) oppure come stringa decimale canonica validata.
- Ogni dato stampato in un documento emesso deve essere presente nello snapshot, anche se deriva da profilo, cliente, catalogo o template.
- Le righe economiche producono i totali; riepiloghi e documenti consumano gli stessi calcoli di dominio.
- Un capitolo usa una sola strategia economica: `sum_items`, `fixed_body_price` oppure `descriptive_only`.
- La quantità descrittiva è separata dalla quantità usata per il prezzo.
- Le opzioni sono righe/gruppi esplicitamente marcati e non alterano lo snapshot emesso.

### Entità minime

**Quote**

- `id`, `number`, `status`, `created_at`, `updated_at`, `issued_at`;
- `subject` (oggetto breve), `introduction` (testo esteso);
- `client_id` facoltativo e `client_snapshot_json` all'emissione;
- `worksite_snapshot_json`, separato dal committente;
- `business_snapshot_json` e `document_settings_snapshot_json` all'emissione;
- `valid_until`, `expected_start`, `expected_duration_text`;
- `general_inclusions`, `general_exclusions`, `conditions`, `acceptance_text`;
- `discount_kind`, `discount_value`, `vat_rate_basis_points` nullable, mai dedotti automaticamente;
- `document_layout_id` separato da `source_template_id`;
- `archived_at`, separato dallo stato commerciale.

**QuoteSection**

- `id`, `quote_id`, `position`, `title`, `description`;
- `pricing_mode`: `sum_items | fixed_body_price | descriptive_only`;
- `body_price_cents` nullable e valido soltanto per `fixed_body_price`;
- `is_optional`, `option_default_selected` per le bozze;
- inclusioni, esclusioni e note di sezione.

**QuoteItem**

- campi esistenti più `section_id`, `position`, `kind` (`economic | note`);
- `pricing_mode`: `measured | body`;
- `quantity_minor`, `quantity_scale` per il calcolo;
- `descriptive_quantity_text` facoltativo, ad esempio “6 infissi”;
- `unit_id` nullable e `unit_label_snapshot` obbligatorio;
- `body_price_cents` per la modalità a corpo, alternativo a `unit_price_cents`;
- `supply_responsibility`: `included | excluded | customer_supplied | not_applicable`;
- inclusioni/esclusioni/note per lavorazione;
- `is_optional` o appartenenza a una sezione opzionale.

**UnitDefinition**

- `id` stabile, `code` stabile, `label`, `symbol`, `is_custom`, `active`, `position`;
- record iniziali: m², m lineare, m³, pezzo, punto, ora, giornata;
- per le vecchie stringhe libere: mantenere sempre `unit_label_snapshot`; associare a un ID solo quando la corrispondenza è certa.

**PaymentScheduleItem**

- `id`, `quote_id`, `position`, `label`;
- `percentage_basis_points` oppure `amount_cents`, con modalità esplicita;
- `due_rule`/`due_text`;
- validazione che la somma percentuale sia 100% quando la modalità è percentuale.

**NumberSequence**

- chiave di sequenza, `next_number`, timestamp/versione;
- lettura e incremento nella stessa transazione esclusiva della finalizzazione;
- non decrementata in caso di annullamento successivo.

**QuoteStatusHistory**

- `id`, `quote_id`, evento, timestamp, note;
- consente stati commerciali senza mutare lo snapshot economico.

**IssuedQuoteSnapshot**

- `quote_id`, `schema_version`, payload canonico completo, hash facoltativo, timestamp;
- contiene dati documento e risultati di calcolo al momento dell'emissione;
- il payload non sostituisce necessariamente le tabelle normalizzate, ma costituisce la fonte immutabile per rigenerare lo stesso documento.

### Regole di calcolo proposte

Per ogni riga:

- `measured`: quantità decimale validata × prezzo unitario in centesimi, con arrotondamento definito al centesimo;
- `body`: usa `body_price_cents`; la quantità descrittiva non moltiplica il prezzo;
- `note`: importo zero e nessuna colonna economica obbligatoria.

Per ogni capitolo:

- `sum_items`: somma esclusivamente le righe economiche del capitolo;
- `fixed_body_price`: usa esclusivamente il prezzo del capitolo e ignora le righe descrittive ai fini del totale;
- `descriptive_only`: zero.

Totali:

- totale base = somma di sezioni/righe non opzionali;
- totale opzioni selezionate = somma delle sole opzioni scelte nella bozza o nel contesto di anteprima;
- imponibile, sconto e IVA seguono una policy esplicita e testata, inclusa la policy sulle opzioni;
- il preventivo emesso congela selezione opzioni e risultati. Eventuali alternative post-emissione richiedono nuova bozza/revisione, non una modifica silenziosa.

L'esempio bagno deve produrre dagli stessi dati: base `610 + 1.000 + 150 + 400 = 2.160 euro`; opzione smaltimento `300 euro`; totale con opzione `2.460 euro`.

## Flusso mobile consigliato

1. **Nuovo preventivo** — scelta rapida tra vuoto e template di lavorazione; nessun numero assegnato.
2. **Dati** — committente, luogo lavori, oggetto, introduzione, date e validità.
3. **Contenuti** — capitoli in card comprimibili, riordinabili; aggiunta di riga economica o nota descrittiva.
4. **Editor riga** — descrizione multilinea, selettore touch unità, modalità “a misura/a corpo”, quantità descrittiva facoltativa, inclusioni e fornitura materiali.
5. **Opzioni** — sezione separata con totale base sempre visibile e simulazione del totale con opzioni.
6. **Condizioni** — sconto/IVA espliciti, pagamenti, durata, esclusioni e accettazione.
7. **Anteprima** — generazione dello stesso PDF che sarà condiviso, con watermark “BOZZA” e nessun consumo del numero. Scelta del layout documentale indipendente dal template lavorazioni.
8. **Controllo finale** — riepilogo errori/blocchi, conferma emissione e protezione robusta dal doppio tap.
9. **Emissione** — unica transazione per validazione finale dei dati persistiti, incremento contatore, numero, snapshot e storico.
10. **Dettaglio emesso** — anteprima immutabile, esportazioni e azioni commerciali; per cambiare contenuti usare “Duplica come nuova bozza”.

Per l'uso a una mano, le azioni primarie devono restare raggiungibili ma non coprire i campi. Il selettore unità può essere un bottom sheet con unità recenti/predefinite, ricerca e voce “Personalizzata”. Le card capitolo riducono la lunghezza percepita; il totale resta ancorato ma non deve nascondere l'ultimo campo con tastiera aperta.

## Piano di implementazione per piccoli scope

### Scope A — Migrazioni e test del dominio (dipendenza di tutti gli altri)

- Introdurre runner di migrazioni con versione schema e migrazione conservativa dello schema corrente.
- Estrarre repository e calcoli dall'attuale file UI.
- Definire tipo decimale quantità, validazione e arrotondamenti.
- Aggiungere test per parsing, misura, corpo, capitoli e totali.

Accettazione: database corrente aggiornato senza perdita; test upgrade da schema attuale; input non valido rifiutato; esempio bagno corretto.

### Scope B — Unità e modalità di prezzo (prima priorità funzionale)

- Creare `UnitDefinition` e seed delle sette unità richieste.
- Bottom sheet touch con unità recenti e personalizzate.
- Migrare le unità libere preservando l'etichetta snapshot.
- Aggiungere modalità `measured/body` e quantità descrittiva distinta.

Dipende da A.  
Accettazione: una riga a misura calcola quantità × prezzo; “6 infissi” a corpo usa un solo importo; unità personalizzata ricompare e le vecchie righe restano leggibili.

### Scope C — Introduzione, capitoli e righe descrittive (prima priorità compositiva)

- Separare oggetto e introduzione multilinea.
- Introdurre sezioni ordinate e tre strategie economiche.
- Distinguere note da righe economiche.
- Implementare riordino accessibile e regola anti doppio conteggio.

Dipende da A e B.  
Accettazione: sono rappresentabili preventivo tabellare, capitolo a corpo e preventivo sintetico; nessun importo viene reinserito nel riepilogo.

### Scope D — Anteprima PDF reale della bozza (prima priorità documentale)

- Definire un DTO documento unico derivato dal dominio.
- Implementare inizialmente un layout PDF sobrio e multipagina.
- Mostrare il file PDF realmente generato con watermark bozza.
- Gestire descrizioni lunghe, intestazioni ripetute, numero pagina e colonne condizionali.

Dipende da A–C; dati attività/logo possono inizialmente essere opzionali.  
Accettazione: anteprima disponibile senza numero e identica al PDF condivisibile; totali uguali all'app; nessuna sovrapposizione in casi lunghi.

### Scope E — Finalizzazione affidabile e snapshot

- Introdurre `NumberSequence`, storico e snapshot completo.
- Unificare salvataggio, numero, snapshot e storico in una transazione esclusiva.
- Proteggere doppio tap e rendere l'operazione idempotente.
- Separare stato commerciale da contenuto immutabile; aggiungere duplicazione come bozza.

Dipende dal DTO canonico dello Scope D e dalle migrazioni A.  
Accettazione: due emissioni ricevono numeri distinti; tap ripetuto produce una sola emissione; un fallimento non lascia emissioni parziali; il PDF rigenerato dallo snapshot non cambia.

### Scope F — Opzioni e condizioni economiche

- Opzioni distinte, selezione solo in bozza/anteprima e due totali.
- Sconto e IVA con regole esplicite anche sulle opzioni.
- Pagamenti per fase con validazione percentuali.

Dipende da A–E.  
Accettazione: esempio bagno 2.160/300/2.460; 30/40/30 e 30/70 validi; percentuali diverse da 100 bloccano emissione; nessuna aliquota precompilata per deduzione.

### Scope G — Dati completi e quattro presentazioni

- Profilo attività/logo, cliente e cantiere separati, validità/durata, inclusioni/esclusioni e accettazione.
- Aggiungere layout tabellare, per capitoli, sintetico a corpo e descrittivo con riepilogo.
- Mantenere layout documentali separati dai template delle lavorazioni.

Dipende da C–F.  
Accettazione: i quattro casi reali sono rappresentabili dallo stesso modello; lo snapshot contiene tutto ciò che viene stampato.

### Scope H — DOCX, XLSX, condivisione e affidabilità mobile

- Generare DOCX modificabile e XLSX con numeri/formule dallo stesso DTO.
- Condivisione senza dichiarare invio avvenuto.
- Autosave o conferma uscita, ricerca archivio, accessibilità, backup/ripristino e test device.

Dipende dal DTO e snapshot stabili.  
Accettazione: contenuti e totali coincidono nei tre formati; annullare la condivisione non cambia lo stato; backup verificato; flussi Android/iOS accessibili.

## Criteri di accettazione e test trasversali

### Dominio

- Quantità: `1`, `1,5`, `0,25`, migliaia italiane e limiti massimi.
- Input vuoto, lettere, segni multipli, negativo, `NaN` e infinito producono errore visibile, non zero silenzioso.
- Arrotondamento documentato sui mezzi centesimi e coerente in app/PDF/DOCX/XLSX.
- Riga a misura e riga a corpo con quantità descrittiva.
- Capitolo `sum_items` e `fixed_body_price` non si sommano due volte.
- Sconto percentuale/fisso, IVA assente e aliquote configurate esplicitamente.
- Opzioni escluse/incluse con totale base invariato.
- Pagamenti 30/40/30 e 30/70; rifiuto di somme diverse da 100%.

### Persistenza e migrazioni

- Creazione, salvataggio, chiusura app, riavvio e riapertura.
- Migrazione da una copia reale dello schema attuale con unità libere.
- Migrazione interrotta non distruttiva; riavvio idempotente.
- Fallimento durante salvataggio righe esegue rollback completo.
- Due finalizzazioni parallele ricevono numeri distinti.
- Doppio tap sulla stessa bozza produce una sola emissione e una risposta coerente.
- Annullamento non riutilizza il numero.
- Modifica catalogo/profilo/template non cambia snapshot o documenti emessi.
- Trigger e repository consentono storico commerciale ma bloccano contenuti emessi.

### Esperienza mobile

- Touch target adeguati, label accessibili, ordine screen reader e contrasto.
- Uso con una mano su schermi piccoli; testo ingrandito; orientamento previsto.
- Tastiera non copre campo o azione; ultimo valore viene sempre salvato.
- Indietro Android, swipe iOS e uscita esplicita gestiscono modifiche non salvate.
- Stato vuoto, errore apertura DB, errore salvataggio, retry e spazio insufficiente.
- Editor con molte righe/capitoli e descrizioni lunghe senza rallentamenti evidenti.

### Documenti

- Anteprima ottenuta dal PDF effettivamente prodotto.
- Bozza con watermark e senza numero definitivo.
- Test visuali di ogni layout: una pagina, multipagina, descrizioni lunghe, tabelle spezzate, logo largo/alto, firme e condizioni.
- Intestazioni tabella ripetute, numeri pagina e nessuna sovrapposizione.
- Colonne quantità/unità/prezzo assenti quando prive di significato.
- Confronto automatico dei totali nei tre formati e nel DTO.
- DOCX realmente editabile e XLSX con celle numeriche/formule, non file rinominati.

## Controlli eseguiti

- Verifica del percorso corrente e della radice Git.
- Lettura completa dei documenti locali elencati nella sezione fonti.
- Inventario dei file applicativi, esclusi `node_modules`, cache e output generati.
- Ispezione statica completa di UI, dominio, repository SQLite, schema, trigger e configurazioni.
- Verifica dello stato Git prima dell'audit: modifiche applicative preesistenti presenti e preservate.
- Ricerca di backend/Neon: non sono state rilevate dipendenze o chiamate nel codice applicativo ispezionato.
- `npm run typecheck`: superato senza errori.
- `git diff --check`: superato; presenti soltanto avvisi Git sulla futura conversione LF/CRLF dei file applicativi già modificati.

## Verifiche ancora necessarie

- Test manuali su Android e iOS/Expo Go di tutti i flussi, inclusi tastiera, back e doppio tap.
- Prova reale di persistenza dopo terminazione e riavvio.
- Test automatizzati del dominio: al momento non è configurato un test runner.
- Test SQLite su transazioni, trigger, concorrenza e future migrazioni.
- Expo Doctor: non eseguito in questo audit per evitare che `npx` installi strumenti non presenti, in rispetto al divieto di installare dipendenze.
- Anteprima/esportazioni: impossibili da verificare perché non implementate.
- Documenti reali originali: non disponibili; serviranno campioni anonimizzati per validare completezza e impaginazione.
- Accessibilità con screen reader e dimensioni testo maggiorate.
- Prestazioni con archivi e preventivi grandi.

## Decisione consigliata

Non procedere direttamente con quattro template visivi o con DOCX/XLSX. Prima consolidare migrazioni e modello di calcolo, poi implementare nell'ordine: **selettore unità e prezzo a corpo → introduzione/capitoli → DTO documento e anteprima PDF reale → finalizzazione atomica con snapshot**. Questa sequenza evita di duplicare regole fragili nei formati e consente di validare presto i preventivi reali più comuni.
