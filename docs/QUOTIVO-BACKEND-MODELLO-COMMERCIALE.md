# Quotivo — Modello backend commerciale

## Scopo e precedenza

Questo documento descrive il contratto backend effettivamente presente in `supabase/migrations/` e `supabase/functions/`. Non è una dichiarazione di deploy: lo stato di un ambiente remoto va verificato separatamente. Per prodotto e priorità prevalgono SSOT e roadmap QF.

## Confini di authority

- SQLite rimane locale-first per bozze, clienti, catalogo, snapshot e file locali.
- Supabase è authority per identità, entitlement, lifecycle account, issuance/numerazione autorizzata, quota FREE, share pubblica ed esito commerciale.
- Le UI chiamano contratti feature-specifici; non introducono una seconda authority locale per esito, quota o entitlement.

## Emissione e revisione

`quote_issuances` identifica una emissione per owner e `client_quote_id`. Le RPC `authorize_quote_issue` e `authorize_quote_revision_issue` sono idempotenti e assegnano il numero canonico. Una revisione conserva numero e anno della root, contiene root/parent/revision number e non avanza la quota FREE.

L'emissione locale viene riconciliata esplicitamente con l'issuance remota. PDF e snapshot non sono prova autonoma dello stato `issued` e non generano issuance o numeri durante la recovery.

## Quota ed entitlement

`quote_monthly_quota()` è l'helper server-side canonica: usa `auth.uid()`, il confine mensile server, il piano effettivo e conta esclusivamente issuance Rev.0. `get_quote_monthly_quota`, `authorize_quote_issue` e `authorize_quote_revision_issue` riusano questa semantica. FREE restituisce limite 3 e residuo; PRO restituisce limite/residuo null.

L'entitlement effettivo deriva da grant PRO attivi, validi e non revocati. La fonte/origine del grant resta separata dall'effettivo piano consumato dall'app.

## Lifecycle account

`account_lifecycle` è l'unica authority di disponibilità remota. `assert_account_active` protegge i writer e i link pubblici. ACTIVE/DEACTIVATED è idempotente; disattivare non cancella storia, documenti o SQLite locale. Offline non modifica lo stato canonico.

## Share e outcome commerciale

`quote_shares` rappresenta lifecycle del link (`ACTIVE`, `REVOKED`, `SUPERSEDED`) e non l'authority dell'esito. Il token pubblico è trattato fuori dall'app owner; `quote-share-owner` è il confine JWT del proprietario e `quote-public` quello token pubblico.

`quote_commercial_outcomes` contiene al massimo una riga per `quote_issuance_id`: ACCEPTED/REJECTED, source MANUAL/PUBLIC_LINK, timestamp server e opzionale source share. L'assenza di riga equivale a PENDING. `record_quote_commercial_outcome` usa first-write-wins; un secondo tentativo restituisce `ALREADY_DECIDED` e non sovrascrive. Il campo legacy in `quote_shares` è una proiezione transitoria di compatibilità, non source of truth.

Una revisione non trasferisce outcome alla nuova issuance. Dopo emissione di una revisione, la supersessione della share parent è un'operazione retry-safe distinta dal successo dell'emissione.

## Verifica richiesta

Le migrazioni e le Edge Function nel repository descrivono il contratto; ogni modifica remota richiede migration/deploy limitati allo scope, verifica dell'ambiente linked ed E2E con account/test isolato. Non eseguire reset o scritture manuali sui dati reali per validare il contratto.
