# Quotivo — Specifica operativa del ciclo completo

Versione 1 — 11 settembre 2026
Destinazione: quotivo-mobile/docs/QUOTIVO-CICLO-COMPLETO.md

## 1. Mandato e precedenza

Questo documento consolida le decisioni dell'utente e sostituisce le precedenti indicazioni in conflitto: un solo modello adattivo, numerazione annuale, funzioni prima del redesign, SQLite senza cloud. Leggere anche AGENTS.md, audit, architettura e roadmap locali. Le istruzioni successive dell'utente prevalgono.

Implementare incrementi funzionanti, non soltanto documentazione o UI. Verificare prima il codice locale e preservare le modifiche esistenti. Nessun commit, push, invio a clienti o pubblicazione autorizzato da questo documento.

## 2. Stato di partenza da verificare

Expo 57.0.22 è stato riportato dall'utente. Le versioni effettive sono definite da package.json e lockfile. L'ultimo resoconto di Codex locale dichiara SQLite persistente, input italiani, migrazioni tramite user_version, contatore persistente, finalizzazione atomica, snapshot e protezione degli emessi. Riporta test, typecheck, Expo Doctor e bundle Android superati. Queste sono informazioni di handoff, non una nuova verifica del codice.

Non rifare ciò che funziona. Estendere test e migrazioni per i cambiamenti necessari. Gli snapshot precedenti contengono solo i campi allora disponibili: non inventare dati retroattivi.

## 3. Obiettivo e limiti

L'utente configura la propria attività, compila un preventivo, vede il documento reale, lo emette, lo condivide e lo ritrova nell'archivio dopo il riavvio.

Ora: modello completo unico; profilo e logo; compilazione; calcoli; anteprima PDF reale; emissione; esportazioni; archivio; backup. La rubrica dedicata segue il primo flusso documento, ma i contatti cliente devono essere previsti da subito.

Dopo: varianti grafiche, redesign senza terracotta, adattamenti per professione, registrazione, sincronizzazione e invio automatico. Nessun Neon, server, account obbligatorio o integrazione pubblicitaria in questa fase. Il modello resta utile senza Esigenta.

## 4. UX: tre passaggi, non un modulo infinito

1. Cliente e lavoro: nome cliente, cantiere, oggetto e introduzione facoltativa.
2. Lavorazioni: voci predefinite o aggiunte, misura, quantità e prezzo; dettagli espandibili.
3. Riepilogo e documento: condizioni, calcoli, anteprima, finalizzazione e condivisione.

Un pulsante chiaro per salvare la bozza; indicazione di modifiche non salvate. Salva, Anteprima e Finalizza acquisiscono l'ultimo input anche con tastiera aperta. Uscendo con modifiche, consentire salvataggio o scarto esplicito. Mostrare errori vicino ai campi e preservare i dati inseriti.

Campi avanzati visibili su richiesta. Nessun titolo vuoto o spazio riservato alle sezioni omesse. Nessuna scelta di template ripetuta a ogni apertura. Catalogo e voci predefinite sono riutilizzabili, ma non costituiscono varianti grafiche.

## 5. Impostazioni attività e risorse

- Denominazione/titolare, indirizzo, P.IVA e/o codice fiscale, telefono ed email.
- Logo PNG/JPG/WEBP/SVG: selezione, anteprima, sostituzione e rimozione.
- Validazione di formato, dimensione e SVG sicuro; niente riferimenti esterni o script.
- Copiare il logo nell'archivio persistente dell'app, non conservare solo un URI temporaneo.
- Validità predefinita, preferenza IVA, condizioni, esclusioni, pagamenti e dati bancari facoltativi.

Profilo modificabile senza alterare i vecchi emessi. Logo opzionale: intestazione ordinata anche senza immagine. I loghi usati dagli emessi vanno conservati/versionati; sostituire il logo corrente non li deve cancellare.

## 6. Cliente e futura area Clienti

Da subito nel preventivo: nome/ragione sociale, referente facoltativo, telefono con prefisso, email, indirizzo, identificativo fiscale facoltativo. Indirizzo cantiere distinto, con comando per copiarlo da quello del cliente. Non obbligare email o telefono per creare un documento.

Successivamente nella stessa versione funzionale: area Clienti con aggiunta, modifica, ricerca e selezione durante la compilazione; elenco dei preventivi associati. Segnalare possibili duplicati senza fusioni automatiche. Creazione rapida dalla bozza senza perdere la compilazione. Nessun accesso alla rubrica del telefono necessario.

La bozza contiene una copia dei dati cliente. Aggiornare la rubrica non sovrascrive silenziosamente il documento; offrire un aggiornamento esplicito nelle bozze. Gli emessi rimangono invariati. Archiviare un cliente non elimina preventivi.

## 7. Struttura del documento

Riferimento principale: preventivo bagno del 28/07/2026, con miglioramenti di chiarezza e impaginazione. Non copiare dati personali, prezzi o clausole tecniche come valori standard.

1. Intestazione: logo e attività; a destra identificazione del documento.
2. Numero annuale, data emissione, data scadenza.
3. Cliente, cantiere e oggetto.
4. Introduzione facoltativa.
5. Lavorazioni/sezioni numerate: titolo, descrizione multilinea/elenco facoltativi, inclusioni/esclusioni, importo.
6. Riepilogo delle lavorazioni e riepilogo economico.
7. Opzioni aggiuntive distinte dal totale base.
8. Condizioni: materiali, esclusioni generali, inizio/durata previsti, pagamenti e validità.
9. Accettazione: testo, luogo/data e spazi firma se abilitati.
10. Piè pagina: riferimento attività e pagina X di Y.

Niente introduzione significa lavorazioni subito sotto l'oggetto. Niente descrizione significa titolo e importo. Nessuna opzione significa sezione assente. Il riepilogo deriva dalle lavorazioni: mai inserimento duplicato degli importi.

Un capitolo può sommare righe a misura/a corpo oppure avere un prezzo unico a corpo con dettagli non valorizzati. Impedire di conteggiare contemporaneamente prezzo del capitolo e dettagli interni.

## 8. Unità, lavorazioni e catalogo

Selettore touch con m², metri lineari (m), m³, pezzi (pz), punti, ore (h), giornate (gg). Unità personalizzate salvabili. Codice interno distinto dall'etichetta. Preservare le unità libere già presenti; normalizzarle solo con regole non ambigue.

A misura: quantità × prezzo unitario. A corpo: importo unico e colonne quantità/prezzo nascoste. Quantità descrittive, come '6 infissi', non obbligano a prezzare per pezzo.

Ogni voce può contenere titolo, dettagli, categoria, inclusioni/esclusioni, materiali del cliente, criterio prezzo, aliquota e indicazione opzionale. Aggiunta, modifica, rimozione e riordino nelle bozze. Catalogo con valori suggeriti e insieme preferito di voci precaricate nei nuovi preventivi. Modifiche al catalogo non alterano documenti già creati.

## 9. IVA e calcoli: regole di prodotto

Scelte italiane predefinite concordate: 4%, 5%, 10%, 22%; aliquota personalizzata salvabile. Il 6% non è un preset standard; preservare eventuali valori già usati. La selezione non certifica l'applicabilità fiscale. Non dedurre l'IVA dal mestiere.

Preferenza sul preventivo, modificabile per riga. 'IVA non applicata' è distinta dall'aliquota zero e permette una dicitura. Non etichettare automaticamente come esente, forfettario o reverse charge. Mostrare separatamente eventuali importi non soggetti nel riepilogo.

Modalità iniziale: prezzi netti IVA esclusa, esplicitamente indicata. Non aggiungere ora un secondo flusso di prezzi lordi se non richiesto.

Precisione proposta: importi inseriti a 2 decimali, quantità fino a 4, aliquote e sconti percentuali fino a 2. Conservare importi in centesimi, quantità scalate e percentuali in centesimi di punto; usare aritmetica esatta, evitando errori floating point. Validare limiti, overflow, valori vuoti e non finiti.

Ordine di calcolo:
1. Calcolare ogni riga e arrotondare al centesimo con criterio half-up.
2. Applicare eventuale sconto di riga, poi sconto globale, senza risultati negativi.
3. Ripartire lo sconto globale proporzionalmente tra le righe pertinenti; attribuire i centesimi residui con criterio dei maggiori resti e ordine stabile per i pareggi.
4. Raggruppare i netti per aliquota/trattamento.
5. Calcolare e arrotondare l'IVA al centesimo per gruppo.
6. Sommare i netti e l'IVA arrotondata per ottenere il lordo.

Mostrare subtotale, sconti se presenti, netto complessivo, imponibili/IVA per aliquota, eventuali importi senza IVA e totale. UI e documenti usano lo stesso risultato di dominio. In XLSX replicare le medesime regole con formule e precisione esplicite; non calcolare l'IVA per riga se il motore la arrotonda per gruppo.

Test di riferimento: 1.000 al 10% e 500 al 22% = netto 1.500, IVA 210, lordo 1.710. 2,5 × 12,50 = 31,25 prima di imposte.

## 10. Opzioni e pagamenti

Le opzioni non entrano nel totale base. Mostrare totale base, importi opzionali e scenario comprensivo delle opzioni selezionate. Calcolare ciascuno scenario con il medesimo motore; rendere esplicita la base degli sconti globali e dei pagamenti. Nessuna somma ambigua o doppio conteggio.

Riferimento strutturale bagno: 610 + 1.000 + 150 + 400 = 2.160; opzione 300; scenario 2.460 prima di eventuali imposte configurate per il test. Non dedurre dal documento originale il trattamento fiscale.

Pagamenti facoltativi in percentuale o importo: acconto, SAL, saldo con etichette e scadenze descrittive/data. Una modalità per piano evita ambiguità. Se il piano è completo deve coincidere col lordo dello scenario indicato; se è solo un acconto, mostrare il residuo. Gestire centesimi dell'ultima rata per far quadrare la somma. Non simulare incassi reali: si tratta di condizioni del preventivo.

## 11. Date e numerazione annuale

Registrare automaticamente creazione/modifica/emissione con istante e fuso/offset utilizzato. Data mostrata nel documento locale; orario nello storico. Orologio del dispositivo, non data certificata.

Numero assegnato soltanto all'emissione: 1/2026, 2/2026; nel 2027 si parte da 1. Sequenza persistente per anno e unicità anno+numero. Non serve un processo che giri a mezzanotte: creare la sequenza dell'anno alla prima emissione. Una bozza di dicembre emessa a gennaio appartiene a gennaio.

Nella transazione di emissione acquisire una sola volta l'istante, derivare anno/data/scadenza, salvare input aggiornati, numero, contatore, stato e snapshot. Rendere l'operazione idempotente. Un rollback non deve consumare il numero. Se l'orologio torna a un anno già usato, usare il relativo contatore senza azzerarlo; segnalare salti temporali sospetti.

Validità predefinita 30 giorni configurabile: scadenza = data emissione + giorni di calendario; oppure data esplicita scelta dall'utente. Esplicitare che è inclusiva e bloccare scadenze anteriori all'emissione. Nella bozza le date calcolate sono provvisorie e ricalcolate all'emissione.

Migrare la vecchia sequenza senza rinumerare gli emessi. Preservare etichetta storica e snapshot. Derivare l'anno storico solo da dati attendibili; non inventarlo dove manca. Documentare il criterio conservativo e i casi legacy prima della migrazione.

## 12. Anteprima reale ed emissione

Anteprima significa visualizzare le pagine del PDF realmente generato, zoomabili e scorribili, non una ricostruzione approssimativa con componenti UI.

In bozza: salvare i dati validi, generare PDF marcato BOZZA senza numero definitivo e con date provvisorie esplicite. Consentire contenuti incompleti nell'anteprima indicando i campi mancanti, ma bloccare la finalizzazione finché non validi. La bozza non consuma numeri. Tornare all'editor non perde dati.

Requisiti minimi di emissione: attività identificata, cliente identificato, oggetto, almeno una lavorazione valida, unità/quantità dove pertinenti, trattamento IVA scelto e date coerenti. Email, telefono, logo e testi facoltativi non sono obbligatori. Definire la politica dei totali zero; proporre conferma esplicita per evitare emissioni accidentali.

Alla finalizzazione congelare tutti i contenuti, impostazioni di calcolo/rendering, dati cliente/attività, condizioni, opzioni e riferimenti al logo persistente. Generare quindi il PDF definitivo dallo snapshot e mostrarlo prima di condividere.

Database e filesystem non hanno una transazione comune: se l'emissione è confermata ma il PDF fallisce, mantenere numero e documento emesso, mostrare errore e consentire di rigenerare dallo stesso snapshot senza nuova emissione. Separare stato documento e stato generazione file.

Conservare il PDF definitivo e la versione del modello; l'anteprima dell'emesso apre lo stesso file che verrà condiviso. Modifiche alle preferenze o a future versioni grafiche non devono alterarlo. L'anteprima di bozza differisce dal definitivo solo per dati che vengono fissati all'emissione e rimozione della marcatura BOZZA.

Verificare il visualizzatore disponibile sulla versione Expo effettiva: non presumere che una WebView renda PDF su ogni piattaforma. Se serve una development build, dichiararlo e fornire istruzioni; non sostituire silenziosamente il PDF con HTML chiamandolo anteprima fedele.

Impaginazione A4: testo leggibile, descrizioni lunghe, titoli uniti al primo contenuto, tabelle con intestazioni ripetute, margini, totali non troncati, piè pagina. Nessuno spazio per campi assenti.

## 13. Esportazione, condivisione e futuro invio

PDF è il formato primario; DOCX è realmente modificabile; XLSX contiene celle/formule modificabili. Tutti derivano dagli stessi dati. Le copie modificate esternamente non aggiornano l'archivio e non sono lo snapshot canonico. Non rinominare HTML/CSV come formati Office.

Ora: condivisione manuale tramite dispositivo e salvataggio del file. Mostrare anteprima e scegliere formato; gestire annullamento ed errori. Aprire la condivisione o un'app email non prova l'invio o la consegna. Stato 'inviato' registrabile manualmente con data e canale; non dichiarare allegati o destinatari precompilati se il meccanismo della piattaforma non li supporta.

Futuro: invio email/WhatsApp automatico solo dopo richiesta separata, scelta del servizio, autorizzazione, destinatario verificato, messaggio e allegato definitivi. Prevedere segreti lato server, idempotenza, retry e stati affidabili. Non implementare integrazioni, invii programmati o credenziali adesso. Salvare l'email di un cliente non autorizza alcun invio.

## 14. Archivio e ciclo di vita

Bozza modificabile → emesso immutabile → inviato (conferma manuale) → accettato o rifiutato. Annullamento registrato con motivazione senza cancellazione dello storico. Archiviazione separata dallo stato commerciale.

Scaduto è un'indicazione derivata per offerte aperte oltre la scadenza; non riscrive il documento né annulla un'accettazione. Registrare accettazione manuale con data; non dichiarare firma digitale o accettazione verificata online.

Ricerca per cliente, titolo, numero; filtri per anno, data, stato e archivio. Ordinamento per date reali e numeri interi, non stringhe. Dettaglio con anteprima, esportazioni, storico e duplicazione. La duplicazione genera una bozza senza numero né vecchia data emissione; permette aggiornamenti espliciti dei dati correnti. Eliminazione solo bozze con conferma.

## 15. Persistenza e backup

Schema versionato e repository separati dalla UI. Relazioni, query parametrizzate e transazioni. Snapshot nuovi completi; mantenere leggibili quelli legacy. Non eliminare database per risolvere errori di migrazione.

Backup esportabile con database coerente, loghi/versioni, PDF emessi e manifesto di versione. Gestire WAL mediante backup consistente, non copiando alla cieca il solo file principale. Ripristino validato prima di sostituire dati, con copia recuperabile del precedente stato; errore o backup corrotto non deve danneggiare l'archivio. Questa fase non richiede merge tra dispositivi.

## 16. Ordine operativo e risultati attesi

A. Verificare delta fra questa specifica e codice/audit, aggiornare documenti in conflitto senza riscrivere il progetto. Affidabilità esistente preservata.
B. Definire ed estendere modello unico, migrazioni, unità, calcoli, date/numero annuale e snapshot.
C. Profilo/logo e dati cliente nel preventivo; compilazione completa con dettagli facoltativi, opzioni e pagamenti.
D. PDF effettivo, anteprima bozza/definitiva, emissione e condivisione manuale; completare il primo percorso end-to-end.
E. Area Clienti dedicata, catalogo e voci predefinite riutilizzabili.
F. DOCX/XLSX, ricerca/stati/duplicazione dove mancanti, backup/ripristino.
G. Prove integrate Android/iOS e aggiornamento documentazione. Varianti grafiche e invio automatico restano fuori.

Procedere senza chiedere conferma a ogni incremento; fermarsi solo per blocchi reali che richiedono l'utente. Non dichiarare tutto completato se manca una voce. Nessun commit/push. Eventuali build/account esterni richiedono una scelta separata.

## 17. Verifiche di accettazione

- Input italiano anche senza blur, errori conservativi e dati dopo riavvio.
- Migrazione con bozze/emessi legacy; nessuna rinumerazione.
- Cambio anno, fuso, scadenza di calendario, finalizzazione ripetuta e rollback.
- Calcoli misti, sconti, centesimi residui, opzioni, importi senza IVA.
- Prezzi a corpo senza colonne vuote; unità selezionate persistenti.
- Caso bagno completo e caso minimo con una lavorazione senza descrizione.
- Cliente modificato e logo sostituito senza cambiamenti agli emessi.
- PDF multipagina ispezionato; file in anteprima uguale a quello condiviso.
- Fallimento del rendering dopo emissione recuperabile senza nuovo numero.
- Annullamento condivisione senza falso stato inviato.
- DOCX apribile e modificabile, XLSX ricalcolato con totali coerenti.
- Backup ripristinato con contatori e risorse; backup corrotto respinto.
- Typecheck e test pertinenti; Expo Doctor se cambiano dipendenze.

Distinguere test automatici, bundle, prove su dispositivo e controlli non eseguiti. Un bundle riuscito non prova visualizzatore, condivisione o impaginazione.

## Emissione e reconciliation locale↔remoto

Non inferire mai lo stato `issued` da PDF o snapshot locali. Un'emissione è provata esclusivamente da una issuance Supabase unica e coerente per owner, `client_quote_id`, revisione, numero/anno, `issued_at` e documento. La reconciliation è transazionale e idempotente: non crea issuance, numeri o PDF e deve superare il post-check di quote, artefatti e foreign key.

## Account lifecycle server-side

`account_lifecycle` is the only server-side account availability source: existing and new accounts start `ACTIVE`; `DEACTIVATED` preserves history, PDFs and tokens but blocks every writer, upload and public link through `assert_account_active`. The state transition is idempotent, server-side and never deletes data.

The app caches lifecycle only to describe the account in Settings. Deactivate/reactivate always call the server use cases; offline never changes local lifecycle authority or removes local SQLite data.

## 18. Consegna di ogni incremento

Aggiornare ROADMAP/HANDOFF con funzioni reali, verifiche, limiti e prossimo passo. Restituire una breve prova guidata su Expo Go o development build, spiegando quale ambiente è stato effettivamente verificato. Mantenere traccia dei requisiti rimanenti fino al completamento.

