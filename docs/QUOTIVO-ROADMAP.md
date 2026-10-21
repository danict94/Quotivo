# Quotivo — Roadmap operativa

## Regole di aggiornamento

- Questa roadmap usa i QF-ID definiti esclusivamente in `QUOTIVO-SSOT-PRODOTTO-ROADMAP.md`.
- La ROADMAP cambia al termine di ogni scope, con stato, nota ed evidenza del gate.
- Uno stato può diventare `DONE` solo dopo tutti i gate previsti; codice e test senza deploy o E2E reale restano `PARTIAL`.
- Stati ammessi: `TODO`, `IN_PROGRESS`, `PARTIAL`, `DONE`, `BLOCKED`, `DEFERRED`.

## CURRENT / NEXT / AFTER

- **CURRENT — QF-011 Revisioni** — `PARTIAL`: implementazione locale completa (capability validata, emissione, storico/PDF, supersessione share); resta l'E2E reale della catena.
- **NEXT — QF-006/QF-008 Accesso rapido Home → Archivio** — `PARTIAL`: implementati anche quota FREE Home e latest-only; resta la verifica runtime mobile dell'esperienza completa.
- **AFTER — QF-012 Recenti** — `PARTIAL`: derivazione e UI presenti; resta la prova visiva Android.

## Gate per lo stato DONE

- **Locale:** test pertinenti, typecheck e controlli richiesti dal repository passano.
- **UX mobile:** flusso reale provato su dispositivo alle viewport e stati pertinenti.
- **Remoto:** per account, entitlement, emissione, share o dati pubblici, ambiente distribuito e percorso E2E reale verificati senza dati fittizi.
- **Regressione:** nessun comportamento esistente rilevante è rotto.

## Catalogo operativo

| Ordine | QF-ID | Stato | Nota basata sul repository | Gate residuo |
|---:|---|---|---|---|
| 1 | QF-001 | PARTIAL | Bozze, editor, calcoli e persistenza locale hanno codice e test. | E2E dispositivo del ciclo completo. |
| 2 | QF-002 | PARTIAL | Emissione, numerazione e riconciliazione hanno repository, migrazioni e test. | Ambiente remoto distribuito ed E2E di recovery. |
| 3 | QF-003 | PARTIAL | PDF/DOCX e condivisione locale sono presenti. | Apertura/condivisione reale su dispositivo e app riceventi. |
| 4 | QF-004 | PARTIAL | Share lifecycle, esito pubblico e function pubbliche esistono nel repository. | Deploy verificato ed E2E link pubblico. |
| 5 | QF-005 | DONE | Badge commerciali uniformi verificati manualmente su Bozza, In attesa e Accettato; stato share separato. | Tutti i gate previsti superati. |
| 6 | QF-006 | PARTIAL | Panoramica Home con metriche canoniche, card verso Archivio e quota FREE compatta server-authoritative; Home mostra solo la revisione corrente di ogni chain. | Verifica runtime mobile dell'accesso rapido e della quota. |
| 7 | QF-007 | DONE | Card archivio con Bozza/numero, intervento, cliente, importo e badge commerciale verificata runtime su mobile. | Tutti i gate previsti superati. |
| 8 | QF-008 | PARTIAL | Ricerca combinabile con filtri commerciali, incluso Emessi (= issued, bozze escluse), applicati dopo `currentQuoteProjection`. | Verifica runtime mobile del filtro e della combinazione. |
| 9 | QF-009 | DONE | Dettaglio emesso con stato commerciale separato dal lifecycle share e azioni coerenti, verificato manualmente runtime/UX; la struttura a tab Riepilogo/Documento/Attività è presente nel codice e coperta da test. | Tutti i gate previsti superati; il controllo visivo della nuova gerarchia resta parte della verifica corrente QF-011/QF-006. |
| 10 | QF-010 | DONE | Authority canonica, backfill legacy, UI/cache, deploy ed E2E manuale/public-link, conflitto e revisioni verificati; runtime utente PASS. | Tutti i gate previsti superati. |
| 11 | QF-011 | PARTIAL | Modello e emissione revisioni, `RevisionChainCapability` SQLite validata, azioni CREATE/RESUME, storico read-only con PDF, latest-only e recovery idempotente della supersessione share sono implementati e testati. | E2E reale Rev.0→Rev.n: quota invariata, outcome non trasferito, PDF/storico, share precedente SUPERSEDED e proiezioni Home/Archivio. |
| 12 | QF-012 | PARTIAL | Derivazione e UI Recenti con test sono presenti. | Prova visiva Android. |
| 13 | QF-013 | PARTIAL | Rubrica e collegamento al preventivo sono presenti. | E2E dispositivo. |
| 14 | QF-014 | PARTIAL | Catalogo locale e riuso sono presenti. | E2E dispositivo. |
| 15 | QF-015 | PARTIAL | Profilo, logo e documenti sono presenti. | Verifica device/PDF reale. |
| 16 | QF-016 | TODO | Template riutilizzabili completi non verificati. | Implementazione e test. |
| 17 | QF-017 | PARTIAL | Auth provider/repository e schermata accesso sono presenti. | E2E reale dei provider. |
| 18 | QF-018 | PARTIAL | Lifecycle ACTIVE/DEACTIVATED, repository/guard server-side, UI e logout bounded sono presenti con test. | Deploy ed E2E disattiva/riattiva e retry offline. |
| 19 | QF-019 | TODO | Eliminazione definitiva account non verificata. | Prodotto, sicurezza, deploy ed E2E. |
| 20 | QF-020 | TODO | Export dati account non verificato. | Implementazione e test. |
| 21 | QF-021 | PARTIAL | Bootstrap ed entitlement repository/migrazioni sono presenti; quota FREE legge `usedThisMonth`, limite e residuo dalla stessa authority server-side dell'emissione. | E2E FREE/PRO su account reale, inclusa Rev.0 che consuma quota e Rev.n che non la consuma. |
| 22 | QF-022 | PARTIAL | Fondazioni grant sono presenti; flusso prodotto non verificato. | UI/amministrazione, deploy ed E2E. |
| 23 | QF-023 | TODO | CRM amministrativo non verificato. | Implementazione e controlli accesso. |
| 24 | QF-024 | TODO | Pagina Piano non verificata. | Implementazione e UX/E2E. |
| 25 | QF-025 | TODO | Pagina Scopri Pro non verificata. | Decisione pricing, implementazione e UX. |
| 26 | QF-026 | TODO | Upsell contestuale non verificato. | Implementazione e UX. |
| 27 | QF-027 | TODO | Codici promo non verificati. | Regole, backend e test. |
| 28 | QF-028 | TODO | Campagna Esigenta non verificata. | Promo, entitlement ed E2E. |
| 29 | QF-029 | DEFERRED | Billing dipende da pricing e provider definitivi. | Decisione prodotto e integrazione store. |
| 30 | QF-030 | TODO | Modulo lavoro/commessa non verificato. | Modello, UX e test. |
| 31 | QF-031 | TODO | Stati lavoro non verificati. | Regole prodotto e implementazione. |
| 32 | QF-032 | TODO | Sopralluogo strutturato non verificato. | UX, modello e test. |
| 33 | QF-033 | TODO | Media/documenti lavoro non verificati. | Modello, storage e UX. |
| 34 | QF-034 | TODO | Rapportino non verificato. | UX, modello e test. |
| 35 | QF-035 | TODO | Costi lavoro non verificati. | Modello, calcoli e test. |
| 36 | QF-036 | TODO | Extra/variazioni non verificati. | Regole e test. |
| 37 | QF-037 | TODO | Consuntivo non verificato. | Calcoli, UX e test. |
| 38 | QF-038 | TODO | Margine non verificato. | Calcoli e UX. |
| 39 | QF-039 | TODO | Fatturazione elettronica non verificata. | Brief fiscale, provider e test. |
| 40 | QF-040 | TODO | Incassi non verificati. | Modello, UX e test. |
| 41 | QF-041 | TODO | Scadenze/solleciti non verificati. | Modello, UX e test. |
| 42 | QF-042 | TODO | Backup/sync completo non verificato. | Progetto, ripristino e E2E. |
| 43 | QF-043 | TODO | Export premium/dati account non verificati. | Prodotto e test. |
| 44 | QF-044 | TODO | Memo vocale AI non verificato. | Privacy, UX e integrazione. |
| 45 | QF-045 | TODO | Sopralluogo vocale AI non verificato. | UX, privacy e integrazione. |
| 46 | QF-046 | TODO | Memoria contestuale non verificata. | Modello dati, privacy e UX. |
| 47 | QF-047 | TODO | Preventivo AI assistito non verificato. | Guardrail, UX e test. |
| 48 | QF-048 | TODO | Assistente Quotivo non verificato. | Scope, autorizzazioni e UX. |
| 49 | QF-049 | TODO | Onboarding prodotto/analytics non verificati. | Decisioni privacy, UX e misurazione. |
| 50 | QF-050 | DEFERRED | Referral/creator dipende dal prodotto pronto al lancio. | Piano campagna e analytics. |

## Riepilogo dello stato documentato

- `DONE`: 4
- `PARTIAL`: 15
- `TODO`: 29
- `IN_PROGRESS`: 0
- `BLOCKED`: 0
- `DEFERRED`: 2

Questo riepilogo non attribuisce `DONE` a codice, test o migrazioni non accompagnati dai gate reali richiesti. `docs/ROADMAP.md` è superseded e non va usato per aggiornare stati o priorità.
