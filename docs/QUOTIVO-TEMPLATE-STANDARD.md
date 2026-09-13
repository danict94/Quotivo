# Quotivo — contratto Template Standard

Versione 1 — 12 settembre 2026

## Fonti e precedenza

`QUOTIVO-CICLO-COMPLETO.md` definisce comportamento, regole di prodotto e ciclo di vita. Questo documento definisce il contratto strutturale dell'unico documento Standard. `template-mockup-standar.html` è il riferimento visuale canonico. Non esiste ancora un selettore di template grafici e non è incluso alcun Template Pro.

## Struttura adattiva

Il documento usa, nell'ordine: intestazione attività e metadati; cliente, cantiere e oggetto; introduzione facoltativa; lavorazioni ordinate; dettagli, inclusioni ed esclusioni presenti; riepilogo; opzioni separate; condizioni; accettazione e piè pagina. Una sezione vuota non occupa spazio e non mostra un titolo.

Una lavorazione minima contiene nome, trattamento IVA e:

- a misura: quantità scalata a quattro decimali, codice/etichetta unità e prezzo unitario netto in centesimi;
- a corpo: un solo importo netto in centesimi. Quantità, unità e prezzo unitario non sono richiesti e non devono comparire nel documento.

Sono facoltativi descrizione breve, sconto riga, dettagli tecnici, inclusioni ed esclusioni. I dettagli tecnici di una voce a corpo sono descrittivi e non generano un secondo importo.

## Unità e IVA

Le unità predefinite hanno codici stabili: `sqm`, `linear_m`, `cubic_m`, `piece`, `point`, `hour`, `day`; le etichette correnti sono m², ml, m³, pz, punti, h e gg. Le unità personalizzate sono record SQLite riutilizzabili. Le etichette legacy libere restano conservate; vengono associate a un codice solo per corrispondenze esatte non ambigue.

Le aliquote predefinite sono 4%, 5%, 10% e 22%; quelle personalizzate sono persistenti. Valori legacy, incluso 6%, restano leggibili ma non diventano preset. `IVA non applicata` è un trattamento distinto dall'aliquota 0% e può avere una dicitura libera.

## Calcoli

Prezzi e importi sono centesimi; quantità interi scalati per 10.000; aliquote e sconti centesimi di punto. Il motore usa interi/BigInt e arrotondamento half-up. Applica prima lo sconto riga, poi ripartisce lo sconto globale con maggiori resti e pareggio secondo l'ordine delle righe. L'IVA viene arrotondata per gruppo di aliquota/trattamento. Le opzioni non entrano nel totale base.

## Persistenza e snapshot

La migrazione 5 aggiunge i campi senza cancellare o rinumerare dati. Le righe legacy conservano quantità REAL, etichetta unità e prezzo originali come fallback. I nuovi emessi producono snapshot schema 3 con `documentModel: standard-v1`, struttura completa delle righe e risultato economico. Gli snapshot precedenti restano invariati e non ricevono dati ricostruiti.

## Renderer PDF Standard

Aggiornamento v2: `template-standard-v2.html` è una guida visiva, non un vincolo cromatico. Il documento presenta le lavorazioni in una singola tabella con un massimo di sei colonne: `Lavorazione | Q.tà | U.M. | Prezzo | IVA | Importo`. Titolo, descrizione breve, dettagli, inclusioni ed esclusioni specifiche appartengono alla prima cella; queste ultime non vengono duplicate automaticamente come esclusioni generali.

Le righe a corpo mostrano soltanto `A corpo`, IVA e importo, senza quantità, unità o prezzo unitario fittizi. Il renderer compone fogli A4 espliciti, riserva lo spazio inferiore e scrive footer letterali `Pagina X di Y`, evitando i contatori CSS non affidabili nel motore di stampa. `BOZZA` compare soltanto nella preview draft.

Il modello normalizzato è costruito in `src/documents/documentModel.ts`; riceve il risultato del motore economico e il renderer non replica formule fiscali. `standardRenderer.ts` produce HTML escapato e adattivo per `expo-print`, con `@page` fisica 210 × 297 mm e richiesta 595,28 × 841,89 punti. Il PDF di bozza e quello definitivo usano lo stesso renderer `standard-a4-v1`.

Blocchi vuoti, logo assente, opzioni assenti e dettagli assenti non generano sezioni. Le righe a corpo non mostrano quantità o prezzo unitario. CSS paged-media protegge intestazioni, riepilogo, condizioni e firme dai tagli quando possibile; contenuti più lunghi di una pagina possono continuare. Il footer richiede `Pagina X di Y` tramite contatori di pagina. Il comportamento effettivo del motore di stampa Android/iOS, inclusi contatori e spezzature estreme, richiede ancora ispezione visiva su dispositivo.

## Bozza, definitivo e visualizzazione

Le bozze vengono salvate prima del rendering, non ricevono numero, mostrano `BOZZA` e sono create in `Paths.cache/quotivo-drafts`. Alla chiusura della preview il temporaneo viene eliminato.

Dopo la transazione di emissione, il PDF viene generato dallo snapshot schema 3 e conservato in `Paths.document/issued-pdfs` con nome stabile e sanitizzato. `document_exports` registra renderer, URI e stato. Se il filesystem fallisce, il numero resta emesso e `Rigenera PDF` usa lo stesso snapshot senza nuova emissione. Un file definitivo già presente non viene sovrascritto.

La visualizzazione locale usa `react-native-pdf`, non HTML/WebView, e mostra il file PDF reale con scorrimento e zoom. Questa libreria contiene codice nativo e non è inclusa in Expo Go: serve una development build. In Expo Go viene mostrato un limite esplicito, non una falsa anteprima.

## Limite corrente

Il modello corrente non espone un campo distinto per le esclusioni generali; il renderer non le inventa e mantiene soltanto le esclusioni specifiche disponibili.

DOCX/XLSX, condivisione manuale e controllo visuale multipagina restano scope successivi. La configurazione A4 e il renderer sono testati staticamente, ma l'output nativo A4 e `Pagina X di Y` non sono dichiarati verificati finché il PDF non viene ispezionato su dispositivo.
