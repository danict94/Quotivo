# Quotivo — SSOT prodotto

## Governance

Questo è il riferimento canonico per decisioni di prodotto. Contiene solo visione, moduli, feature, regole prodotto/UX, piani e roadmap funzionale generale.

- Lo SSOT cambia solo quando cambia una decisione di prodotto.
- La roadmap operativa è `docs/QUOTIVO-ROADMAP.md`: cambia al termine di ogni scope.
- I QF-ID sono stabili e non rappresentano task tecnici.

## Visione

Quotivo accompagna artigiani, professionisti e piccole imprese dal sopralluogo al preventivo, al lavoro e all'incasso senza ricopiare informazioni. Il preventivo è il nucleo iniziale; l'interfaccia resta mobile-first, affidabile e semplice anche con funzioni avanzate.

Principio: **potente dietro, semplice davanti**. Le informazioni già note vengono riutilizzate, gli stati commerciali sono comprensibili e l'utente conferma sempre le azioni definitive.

## Regole permanenti di prodotto e UX

- Un documento emesso, il suo numero e il suo snapshot restano immutabili; una modifica sostanziale crea una revisione.
- Stati commerciali visibili: Bozza, In attesa, Accettato, Rifiutato. Apertura del link, invio, upload e sincronizzazione sono stati tecnici separati.
- L'esito commerciale definitivo appartiene all'emissione, non al singolo link: la prima decisione Accettato/Rifiutato vince; il link può restare consultabile.
- Nelle superfici operative ogni catena di revisioni mostra una sola revisione corrente; le revisioni precedenti restano accessibili come storico immutabile con i rispettivi documenti.
- Il piano e la quota FREE sono comunicati con valori authoritativi del server; una revisione non consuma una nuova emissione FREE.
- Una issuance accettata può generare un solo Lavoro; il Lavoro conserva come baseline immutabile l'issuance che l'ha originato e una revisione accettata successiva non lo aggiorna automaticamente.
- Ricavi non significa incassi; margine non significa liquidità; margine operativo non significa netto fiscale.
- Nessun successo viene mostrato prima dell'esito reale dell'operazione.
- L'AI interpreta solo metriche e serie canoniche autorizzate: non ricalcola contabilità, margini o tasse e non scrive direttamente nei dati. Ogni proposta passa da conferma utente e use-case Quotivo.
- Progressive disclosure, target touch adeguati, feedback di caricamento/errore/vuoto e leggibilità sono requisiti UX, non decorazioni.
- Downgrade, disattivazione e scadenza di un piano non cancellano dati. L'eliminazione account è distinta, esplicita e irreversibile.
- Ogni feature PRO deve spiegare il beneficio e offrire un percorso non aggressivo verso il piano.

## Moduli e catalogo funzionale

### Preventivi, emissione e documenti

- **QF-001 — Preventivo locale:** bozze, editor, calcoli, cliente, profilo e catalogo come dati riutilizzabili.
- **QF-002 — Emissione e riconciliazione:** autorizzazione, numerazione, snapshot immutabile e recupero coerente dopo interruzioni.
- **QF-003 — PDF, DOCX e condivisione locale:** documenti dal medesimo snapshot, apertura e condivisione esplicite.
- **QF-004 — Link pubblico ed esito:** link pubblico revocabile, apertura, esito commerciale e documento pubblico coerenti.
- **QF-005 — Stati commerciali e badge:** rappresentazione uniforme di Bozza/In attesa/Accettato/Rifiutato.
- **QF-006 — Home commerciale:** panoramica compatta di importi e conteggi per stato, con Nuovo preventivo sempre accessibile e accesso diretto all'Archivio filtrato.
- **QF-007 — Archivio preventivi:** elenco leggibile con numero, intervento, cliente, importo e stato.
- **QF-008 — Filtri e ricerca archivio:** accesso rapido a bozze, emessi, in attesa, accettati e rifiutati, combinabile con la ricerca.
- **QF-009 — Dettaglio preventivo:** centro di controllo per documento, stato, share, PDF e azioni consentite.
- **QF-010 — Esito manuale:** registrazione di accettato/rifiutato con data e fonte, distinta dal link.
- **QF-011 — Revisioni:** catena Rev.0/Rev.n, una sola revisione corrente nelle superfici operative e storico immutabile con PDF per revisione.
- **QF-012 — Lavorazioni recenti:** riuso delle lavorazioni emesse correnti, separato dal catalogo.

### Anagrafica e configurazione operativa

- **QF-013 — Clienti:** rubrica, ricerca e copia indipendente dei dati nel preventivo.
- **QF-014 — Catalogo lavorazioni:** voci personali riutilizzabili, modificabili e non retroattive.
- **QF-015 — Profilo attività e brand:** dati attività, logo, condizioni e stile documentale.
- **QF-016 — Template preventivo:** basi riutilizzabili di lavorazioni e condizioni, senza alterare le bozze create.

### Account, FREE/PRO e ciclo di vita

- **QF-017 — Accesso e identità:** registrazione, accesso, logout e ripresa coerente della sessione.
- **QF-018 — Lifecycle account:** account ACTIVE/DEACTIVATED, riattivabile e con dati preservati.
- **QF-019 — Eliminazione account:** flusso definitivo con spiegazione, riautenticazione, conferma esplicita e wipe finale solo dopo esito reale.
- **QF-020 — Esportazione dati account:** copia portabile dei dati prima dell'eliminazione.
- **QF-021 — Entitlement FREE/PRO:** livello effettivo finale e quota FREE, decisi da authority server-side e separati dalla loro origine.
- **QF-022 — Grant PRO:** assegnazioni con origine, validità, revoca e scadenza senza perdita dati al downgrade.
- **QF-023 — Gestione amministrativa piani:** ricerca utente e gestione dei grant senza modifiche manuali ai dati.
- **QF-024 — Pagina Piano:** stato e origine del piano comprensibili in Impostazioni.
- **QF-025 — Pagina Scopri Pro:** confronto chiaro fra FREE e PRO; prezzo non ancora definitivo.
- **QF-026 — Upsell contestuale:** accesso alle feature PRO con spiegazione del beneficio, senza vicoli ciechi o pressione continua.
- **QF-027 — Codici promozionali:** campagne, validità, limiti e redemption tracciabile.
- **QF-028 — Campagna Esigenta:** codice promozionale che può concedere PRO temporaneo secondo regole dichiarate.
- **QF-029 — Billing:** acquisto e rinnovo mobile, con backend Quotivo come authority dell'entitlement.

### Lavoro e gestione economica

- **QF-030 — Lavoro:** trasformazione idempotente di un'issuance accettata in contesto operativo, con riferimento alla revisione origine e baseline preventivata immutabile.
- **QF-031 — Stati lavoro:** Da iniziare, In corso, Completato e Chiuso, con regole del modulo dedicate.
- **QF-032 — Sopralluogo strutturato:** note, misure, richieste, verifiche e materiali prima del preventivo.
- **QF-033 — Foto e documenti lavoro:** allegati collegati al giusto cliente, sopralluogo, lavoro o preventivo.
- **QF-034 — Rapportino lavoro:** persone, ore, attività, materiali, problemi, extra e foto.
- **QF-035 — Costi:** costi effettivi del Lavoro per materiali, operai/dipendenti/collaboratori, fornitori/subappalti, carburante, parcheggi/pedaggi, noleggi, smaltimento, attrezzature e altre spese.
- **QF-036 — Extra e variazioni:** extra separati dal preventivo origine, con approvazione esplicita e contributo distinto ai ricavi del Lavoro.
- **QF-037 — Preventivato vs consuntivo:** proiezione prevista/reale di ricavi, costi, tempi e scostamenti, senza formule duplicate nelle superfici UI.
- **QF-038 — Margine:** margine economico e di cassa, percentuale, rendimento per giorno/ora e stato di redditività comprensibili, senza pretendere un netto fiscale.

### Fiscale, incassi e continuità

- **QF-039 — Fatturazione elettronica:** fatture collegate al Lavoro, non un modulo isolato; creazione, controllo, invio ed esito alimentano la situazione economica del Lavoro.
- **QF-040 — Incassi:** acconti, saldi, parziali e residuo collegati alle fatture/Lavoro e distinti dai ricavi.
- **QF-041 — Scadenze:** importi da incassare, scadenze e solleciti.
- **QF-042 — Backup e sync:** protezione, ripristino e continuità fra dispositivi.
- **QF-043 — Export premium:** pacchetti documentali e dati account oltre agli export base.

### AI, voce e crescita

- **QF-044 — Memo vocale AI:** trascrizione e strutturazione di lavorazioni, misure, richieste e note, con proposte confermabili.
- **QF-045 — Sopralluogo vocale AI:** raccolta guidata sul posto con evidenza dei dati mancanti e passaggio ai dati strutturati.
- **QF-046 — Memoria contestuale:** informazioni autorizzate e legate a cliente, Lavoro, documenti e storico economico.
- **QF-047 — Preventivo assistito da AI:** bozza da sopralluogo con priorità a catalogo, costi reali storici e storico dell'utente; ogni aggiornamento catalogo resta proposto, mai automatico.
- **QF-048 — Assistente Quotivo:** interrogazione autorizzata di preventivo, Lavoro, attività, tempi, persone, costi, extra, fatture, incassi, catalogo, metriche e serie temporali; propone azioni che il use-case applica solo dopo conferma.
- **QF-049 — Onboarding e analytics prodotto:** primo valore rapido e misurazione essenziale del percorso utente.
- **QF-050 — Referral e creator:** campagne attribuibili con beneficio e conversione misurabili.

## Roadmap funzionale generale

1. Rendere affidabile e comprensibile il ciclo preventivo: QF-001—QF-012.
2. Consolidare anagrafica e configurazione: QF-013—QF-016.
3. Rendere sostenibili accesso, lifecycle e valore FREE/PRO: QF-017—QF-029.
4. Estendere dal preventivo al lavoro e alla redditività: QF-030—QF-038.
5. Chiudere fatturazione, incassi e continuità: QF-039—QF-043.
6. Aggiungere AI operativa e crescita quando il nucleo è maturo: QF-044—QF-050.

## Economia del Lavoro e lettura AI

Il Lavoro rende leggibile una catena unica: **Preventivo → Lavoro → attività/tempo/persone → costi → extra → fatture → incassi → previsto vs reale → margine → andamento**.

### Dati economici e temporali canonici

- Ricavi: baseline del preventivo accettato, extra approvati, fatture emesse e incassi restano valori distinti.
- Costi: materiali, persone, fornitori/subappalti, carburante, parcheggi/pedaggi, noleggi, smaltimento, attrezzature e altre spese.
- Tempo: data di inizio/fine, giorni effettivi, ore, tempo del titolare, lavoratori impiegati, giorni/ore per lavoratore e giornate/uomo totali.

Le metriche canoniche previste sono `projectedRevenue`, `actualRevenue`, `actualCosts`, `forecastRemainingCosts`, `projectedFinalCost`, `cashMargin`, `economicMargin`, `marginPercent`, `totalManDays`, `ownerWorkDays`, `ownerWorkHours`, `revenuePerWorkDay`, `profitPerWorkDay`, `revenuePerHour`, `profitPerHour`, `collectedAmount`, `outstandingAmount`, `cashPosition` e gli scostamenti previsto/reale. Il loro significato è di dominio e non dipende da grafici, UI o prompt.

Le serie temporali canoniche previste comprendono costi cumulativi, incassi cumulativi, ricavi, previsto vs reale e margine nel tempo. Possono supportare gli stati informativi **In profitto**, **In perdita** e **Margine a rischio**, senza fissare ora soglie arbitrarie.

### Fiscalità e catalogo futuro

Il motore economico operativo resta indipendente dalla fiscalità. In futuro `FiscalProfile` e `TaxEstimateProvider` potranno stimare imposte, contributi e netto fiscale, ma non sono parte delle metriche operative né autorizzano ora calcoli IRPEF, INPS, IVA da versare, imposte societarie o costo fiscale dei dipendenti.

Catalogo e AI potranno confrontare prezzi personali, costi reali storici, listini fornitori e prezzari regionali/ufficiali, evidenziarne la differenza percentuale e proporre un aggiornamento. Nessun prezzo o catalogo viene aggiornato senza conferma esplicita.
