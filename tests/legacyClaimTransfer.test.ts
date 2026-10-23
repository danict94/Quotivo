import assert from 'node:assert/strict';
import test from 'node:test';
import initSqlJs from 'sql.js';

import { runMigrations } from '../src/migrations';
import { LegacyDataIntegrityError, readLegacyDataSnapshot, transferLegacyData, verifyLegacyDataTransfer, verifyLegacyTargetIntegrity } from '../src/features/local-data/legacyClaimTransfer';
import { repairSingleLegacyIssuedDraft } from '../src/features/local-data/repairLegacyIssuedDraft';
import { SqlJsTestAdapter } from './sqliteTestAdapter';

const SQL = initSqlJs();

async function database() {
  const engine = await SQL;
  const adapter = new SqlJsTestAdapter(new engine.Database());
  await adapter.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(adapter);
  return adapter;
}

async function legacyWithQuote() {
  const legacy = await database();
  await legacy.runAsync("UPDATE business_profiles SET business_name = 'Impresa legacy', updated_at = ? WHERE id = 1", '2026-09-14T10:00:00.000Z');
  await legacy.runAsync("INSERT INTO clients (id,name,contact_name,phone,email,address,tax_id,vat_number,created_at,updated_at) VALUES ('c-1','Cliente legacy','','','','','','','2026-09-14','2026-09-14')");
  await legacy.runAsync("INSERT INTO catalog_items (id,title,price_mode,unit_code,unit_label,price_cents,created_at,updated_at) VALUES ('catalog-1','Voce legacy','measured','piece','pz',1000,'2026-09-14','2026-09-14')");
  await legacy.runAsync("INSERT INTO quotes (id,client_id,client,title,created_at,updated_at) VALUES ('quote-1','c-1','Cliente legacy','Preventivo legacy','2026-09-14','2026-09-14')");
  await legacy.runAsync("INSERT INTO quote_items (id,quote_id,description,quantity,unit,unit_price_cents,position) VALUES ('item-1','quote-1','Prima voce',1,'pz',1000,0)");
  await legacy.runAsync("INSERT INTO quote_items (id,quote_id,description,quantity,unit,unit_price_cents,position) VALUES ('item-2','quote-1','Seconda voce',2,'pz',2000,1)");
  return legacy;
}

test('claim trasferisce integralmente profilo, clienti, catalogo, bozza e righe', async () => {
  const legacy = await legacyWithQuote();
  const target = await database();
  const snapshot = await readLegacyDataSnapshot(legacy);

  await transferLegacyData(target, snapshot, 'replace');

  assert.equal(await verifyLegacyDataTransfer(target, snapshot, true), true);
  assert.equal((await target.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM quotes'))?.count, 1);
  assert.equal((await target.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM quote_items WHERE quote_id = ?', 'quote-1'))?.count, 2);
});

test('failure durante il claim fa rollback e il retry non duplica', async () => {
  const legacy = await legacyWithQuote();
  const target = await database();
  const snapshot = await readLegacyDataSnapshot(legacy);
  await target.execAsync("CREATE TRIGGER fail_legacy_item BEFORE INSERT ON quote_items WHEN NEW.id = 'item-2' BEGIN SELECT RAISE(ABORT, 'failure simulata'); END;");

  await assert.rejects(() => transferLegacyData(target, snapshot, 'replace'), /failure simulata/);
  assert.equal((await target.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM quotes'))?.count, 0);
  assert.equal((await target.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM quote_items'))?.count, 0);

  await target.execAsync('DROP TRIGGER fail_legacy_item');
  await transferLegacyData(target, snapshot, 'replace');
  await transferLegacyData(target, snapshot, 'merge');

  assert.equal(await verifyLegacyDataTransfer(target, snapshot, false), true);
  assert.equal((await target.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM quotes'))?.count, 1);
  assert.equal((await target.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM quote_items'))?.count, 2);
});

test('retry merge con soli duplicati resta integro e può chiudere il claim senza sovrascrivere il target', async () => {
  const legacy = await legacyWithQuote();
  const target = await database();
  const snapshot = await readLegacyDataSnapshot(legacy);
  await transferLegacyData(target, snapshot, 'replace');
  await target.runAsync("UPDATE clients SET name = 'Cliente account' WHERE id = 'c-1'");

  await transferLegacyData(target, snapshot, 'merge');

  assert.equal((await target.getFirstAsync<{ name: string }>("SELECT name FROM clients WHERE id = 'c-1'"))?.name, 'Cliente account');
  assert.equal(await verifyLegacyTargetIntegrity(target), true);
});

test('il claim rifiuta una sorgente draft con snapshot o PDF emesso prima di scrivere dati', async () => {
  const legacy = await legacyWithQuote();
  const target = await database();
  await legacy.runAsync("INSERT INTO issued_quote_snapshots (quote_id, schema_version, snapshot_json, created_at) VALUES ('quote-1', 3, '{}', '2026-09-14')");
  await legacy.runAsync("INSERT INTO document_exports (quote_id, renderer_version, file_uri, status, error_message, created_at, updated_at) VALUES ('quote-1', 'standard-v1', NULL, 'ready', NULL, '2026-09-14', '2026-09-14')");

  await assert.rejects(() => readLegacyDataSnapshot(legacy).then((snapshot) => transferLegacyData(target, snapshot, 'replace')),
    (error: unknown) => error instanceof LegacyDataIntegrityError && error.code === 'LEGACY_SOURCE_DRAFT_HAS_ISSUED_ARTIFACTS');
  assert.equal((await target.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM quotes'))?.count, 0);
});

test('il retry merge rifiuta una collisione target draft con artefatti emessi della sorgente', async () => {
  const legacy = await legacyWithQuote();
  const target = await database();
  await legacy.runAsync("UPDATE quotes SET status='issued', number=7, number_year=2026, issued_at='2026-09-14' WHERE id='quote-1'");
  await legacy.runAsync("INSERT INTO issued_quote_snapshots (quote_id, schema_version, snapshot_json, created_at) VALUES ('quote-1', 3, '{\"number\":7}', '2026-09-14')");
  await target.runAsync("INSERT INTO quotes (id, client, title, created_at, updated_at) VALUES ('quote-1', 'Target', 'Bozza', '2026-09-14', '2026-09-14')");

  await assert.rejects(() => readLegacyDataSnapshot(legacy).then((snapshot) => transferLegacyData(target, snapshot, 'merge')),
    (error: unknown) => error instanceof LegacyDataIntegrityError && error.code === 'LEGACY_TARGET_DRAFT_CONFLICT_WITH_ISSUED_ARTIFACTS');
  assert.equal((await target.getFirstAsync<{ status: string }>("SELECT status FROM quotes WHERE id='quote-1'"))?.status, 'draft');
});

test('repair legacy promuove transazionalmente un solo draft con snapshot e PDF finali coerenti', async () => {
  const target = await database();
  await target.runAsync("INSERT INTO quotes (id,client,title,created_at,updated_at) VALUES ('legacy-issued','Cliente','Titolo','2026-09-14','2026-09-14')");
  await target.runAsync("INSERT INTO issued_quote_snapshots (quote_id,schema_version,snapshot_json,created_at) VALUES ('legacy-issued',3,?, '2026-09-14')", JSON.stringify({id:'legacy-issued',status:'issued',number:45,numberYear:2026,issuedAt:'2026-09-14T10:00:00.000Z',issuedLocalDate:'2026-09-14',issuedOffsetMinutes:120,validUntil:'2026-10-14',revisionRootQuoteId:null,parentQuoteId:null,revisionNumber:0}));
  await target.runAsync("INSERT INTO document_exports (quote_id,renderer_version,file_uri,status,error_message,created_at,updated_at) VALUES ('legacy-issued','standard-v1','file://issued.pdf','ready',NULL,'2026-09-14','2026-09-14')");

  const repaired = await repairSingleLegacyIssuedDraft(target);
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.candidate.quoteId, 'legacy-issued');
  assert.equal(repaired.rowsAffected, 1);
  assert.deepEqual(await target.getFirstAsync('SELECT status,number,number_year,issued_at FROM quotes WHERE id=\'legacy-issued\''), {status:'issued',number:45,number_year:2026,issued_at:'2026-09-14T10:00:00.000Z'});
  assert.equal((await target.getFirstAsync<{count:number}>("SELECT COUNT(*) AS count FROM issued_quote_snapshots WHERE quote_id='legacy-issued'"))?.count,1);
  const noCandidate = await repairSingleLegacyIssuedDraft(target);
  assert.equal(noCandidate.repaired, false);
  assert.equal(noCandidate.reason, 'NONE');
});
