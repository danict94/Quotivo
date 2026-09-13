# Quotivo — Brief tecnico e prodotto

## 1. Visione

Quotivo è un gestionale gratuito per artigiani, imprese e professionisti che devono creare preventivi ordinati, coerenti e professionali senza ricostruire ogni volta il documento da zero.

Il prodotto deve essere utile da solo. Esigenta sarà un servizio collegato e opzionale: Quotivo aiuta a lavorare meglio, Esigenta aiuta a trovare nuove opportunità.

## 2. Obiettivi della prima versione

- Creare preventivi professionali da telefono.
- Generare automaticamente la numerazione progressiva.
- Archiviare e ricercare i preventivi per numero, data, cliente e stato.
- Usare template con voci già predisposte.
- Aggiungere, rimuovere e modificare le voci durante la compilazione.
- Esportare il documento in PDF, Word modificabile ed Excel.
- Funzionare senza connessione per le operazioni principali.
- Preparare una base estendibile a clienti, cantieri, fatture e integrazione Esigenta.

## 3. Utente principale

Artigiano o piccola impresa edile che lavora da smartphone, spesso in cantiere, e vuole produrre rapidamente un documento credibile da inviare via WhatsApp o email.

## 4. Moduli iniziali

### Dashboard

- Nuovo preventivo.
- Ultimi preventivi.
- Totale bozze, inviati e accettati.
- Ricerca rapida.
- Accesso a template, catalogo voci e impostazioni.

### Preventivi

Campi principali:

- numero progressivo
- data creazione
- validità
- cliente
- luogo del lavoro
- titolo e descrizione
- voci di lavorazione
- note, esclusioni e condizioni
- imponibile, sconto, IVA e totale
- stato del documento

### Numerazione

Il sistema assegna il numero alla finalizzazione del preventivo. La numerazione visualizzata sarà semplice: `Preventivo n. 1`, `Preventivo n. 2`, eccetera. Il numero emesso non viene riutilizzato; un documento errato viene annullato o archiviato, non cancellato senza traccia.

La struttura dati manterrà anche un identificativo interno indipendente, così in futuro sarà possibile supportare numerazioni annuali o personalizzate senza rompere lo storico.

### Template

Prima configurazione:

1. Ristrutturazione bagno.
2. Lavori edili generali.
3. Manutenzione e intervento rapido.
4. Template personalizzato.

Ogni template contiene una selezione ordinata di voci predefinite. Nel preventivo le voci possono essere modificate, rimosse o integrate senza alterare il template originale.

### Catalogo voci

Ogni voce può avere:

- nome
- categoria
- unità di misura: m², m, pezzi, ore, giornate, forfait o personalizzata
- prezzo predefinito
- tipo: manodopera, materiale, trasporto, altro
- descrizione e note

### Profilo attività

- dati aziendali
- logo PNG, JPG, WEBP o SVG
- colori e stile del documento
- firma o spazio firma
- condizioni standard
- dati fiscali e IVA predefinita

## 5. Esportazioni

- PDF: formato principale, pronto per il cliente.
- DOCX: documento modificabile.
- XLSX: tabella con formule, quantità, prezzi e totali modificabili.

Il motore dei documenti sarà separato dal modulo preventivi, così sarà possibile aggiungere in futuro fatture, rapportini o altri documenti.

## 6. Navigazione mobile

- Home
- Preventivi
- Clienti
- Template
- Catalogo voci
- Impostazioni

La barra inferiore mostrerà Home, Preventivi, Nuovo e Impostazioni. Il pulsante Nuovo dovrà essere sempre raggiungibile rapidamente.

## 7. Direzione visuale

Design moderno, elegante e professionale, con:

- fondo chiaro caldo o grafite molto scura nelle aree di enfasi
- blu notte come colore principale
- accento terracotta controllato
- tipografia leggibile e contemporanea
- card compatte, bordi morbidi e gerarchia chiara
- nessuna estetica da foglio Excel
- stati di caricamento, errore e vuoto progettati
- grandi aree touch e uso agevole con una mano

Il documento esportato sarà più sobrio dell’app: bianco, ordinato, con logo, intestazione e tabella leggibile.

## 8. Architettura

La prima app mobile sarà React Native con Expo e TypeScript. I componenti, i tipi, le regole di calcolo e il sistema di template saranno organizzati in pacchetti riutilizzabili da una futura app Next.js web.

Persistenza iniziale offline-first con SQLite. Un backend e l’autenticazione saranno aggiunti in uno scope successivo, quando serviranno sincronizzazione e multi-dispositivo.

Struttura prevista:

- `apps/mobile` — app Android/iOS
- `apps/web` — futura versione Next.js
- `packages/domain` — tipi e regole di calcolo
- `packages/ui` — componenti condivisi
- `packages/documents` — esportatori PDF/DOCX/XLSX
- `packages/database` — schema e accesso ai dati
- `packages/config` — configurazione condivisa

## 9. Modello dati essenziale

- `BusinessProfile`
- `Client`
- `Template`
- `CatalogItem`
- `Quote`
- `QuoteItem`
- `QuoteStatusHistory`
- `DocumentExport`

Ogni `QuoteItem` conserverà una copia dei dati usati nel preventivo. Se in futuro il prezzo nel catalogo cambia, i vecchi preventivi non cambieranno.

## 10. Integrazione Esigenta

La prima integrazione sarà discreta e opzionale:

- scheda “Trova nuovi lavori nella tua zona”
- collegamento volontario del profilo professionale
- deep link verso Esigenta

In futuro:

- importazione di una richiesta Esigenta come bozza di preventivo
- collegamento tra professionista e profilo Esigenta
- sincronizzazione dello stato della richiesta

Niente pop-up aggressivi, notifiche pubblicitarie o reindirizzamenti automatici.

## 11. Roadmap a piccoli scope

### Scope 0 — Fondazioni

Brief, identità visiva, struttura monorepo, tipi dominio e regole di calcolo.

### Scope 1 — Prototipo utilizzabile

Dashboard, archivio preventivi, nuovo preventivo, numerazione automatica e salvataggio locale.

### Scope 2 — Template e catalogo

Template predefiniti, editor template, catalogo voci e modifica delle voci durante la compilazione.

### Scope 3 — Profilo e documenti

Logo, dati attività, condizioni standard, PDF, DOCX ed XLSX.

### Scope 4 — Qualità di prodotto

Ricerca, filtri, duplicazione, stati, gestione errori, backup locale e test su Android/iOS.

### Scope 5 — Pubblicazione

Icona, schermate store, privacy policy, build firmate, Google Play Store e Apple App Store.

### Scope 6 — Ecosistema

Account, sincronizzazione cloud, backend e integrazione Quotivo-Esigenta.

## 12. Decisioni da mantenere

- Quotivo deve essere utile anche senza Esigenta.
- La numerazione deve essere automatica e affidabile.
- Il template è una base, non un vincolo.
- I vecchi documenti devono rimanere immutabili nello storico.
- Il lavoro offline è prioritario.
- Le funzioni future devono essere moduli, non codice intrecciato.

