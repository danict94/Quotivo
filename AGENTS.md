# Istruzioni per Codex — Quotivo

Questa è la copia canonica delle istruzioni, collocata nella radice Git. La precedente copia `../AGENTS.md` è conservata soltanto come copia storica e non va aggiornata in parallelo.

## Avvio

Leggere:
- docs/quotivo-brief.md
- docs/ARCHITECTURE.md
- docs/ROADMAP.md
- docs/HANDOFF.md

Verificare percorso corrente, radice Git e stato dei file.
Non presumere che la struttura proposta nei documenti sia già presente.

## Conservazione del lavoro

Le modifiche esistenti appartengono all'utente.
Non sovrascriverle o annullarle.
Se interferiscono con il lavoro richiesto, chiarire prima di procedere.

Non usare reset distruttivi, pulizie indiscriminate o force push.
Non creare repository Git annidati.

Non eseguire commit, push, pubblicazioni o cambi di visibilità
senza una richiesta esplicita per l'operazione.

Non includere node_modules, .expo, segreti o dati reali dei clienti.

## Modalità di sviluppo

Lavorare direttamente sulla copia locale aperta.
Procedere per scope piccoli, completi e verificabili.

Separare:
- interfaccia;
- regole di dominio;
- persistenza;
- esportazioni.

Non riscrivere l'app da zero senza una necessità motivata.
Non introdurre subito il monorepo futuro.

Preservare la direzione visuale, correggendo accessibilità,
leggibilità e comportamento mobile.

Nessun pulsante deve simulare un successo non avvenuto.
Non lasciare dati dimostrativi mescolati a quelli reali.

## Database e documenti

SQLite offline-first.
Nessun backend o account nella fase attuale.

Numeri definitivi assegnati transazionalmente alla finalizzazione.
Contenuti emessi immutabili.
Calcoli monetari testati.
Migrazioni senza perdita dati.
Backup e ripristino previsti prima dell'uso reale continuativo.

## Dipendenze

Controllare package.json e package-lock.json.
Non dedurre la versione Expo dal nome di un commit.

Usare versioni compatibili con l'SDK installato.
Non eseguire npm audit fix --force.
Motivare ogni nuova dipendenza.

## Verifiche

Eseguire i controlli disponibili pertinenti:
- TypeScript;
- test di dominio;
- test della persistenza e delle migrazioni;
- Expo Doctor dopo modifiche alle dipendenze;
- git diff --check.

Expo Doctor non sostituisce test funzionali o prove su dispositivo.
Non dichiarare Android, iOS o esportazioni verificati senza averli provati.

Se non è possibile eseguire un controllo, indicarlo esplicitamente.

## Chiusura di ogni scope

Aggiornare ROADMAP.md con stato reale, verifiche e problemi aperti.
Aggiornare ARCHITECTURE.md quando cambia una decisione.
Aggiornare HANDOFF.md con le informazioni necessarie alla prossima sessione.

Rispondere in italiano indicando:
- cosa funziona ora;
- cosa è stato verificato;
- cosa manca;
- come provare l'incremento.

Non dichiarare l'app completa o pronta per gli store
finché i criteri necessari non sono soddisfatti.
