import assert from 'node:assert/strict';
import test from 'node:test';
import initSqlJs, { Database } from 'sql.js';
import { runMigrations } from '../src/migrations';

class SqlJsMigrationAdapter {
  constructor(readonly db: Database) {}
  async execAsync(sql: string) { this.db.run(sql); }
  async getFirstAsync<T>(sql: string) {
    const statement = this.db.prepare(sql);
    try { return statement.step() ? statement.getAsObject() as T : null; }
    finally { statement.free(); }
  }
}

async function database() {
  const SQL = await initSqlJs();
  const adapter = new SqlJsMigrationAdapter(new SQL.Database());
  await adapter.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(adapter);
  return adapter;
}

const insertQuote = (id: string, revisionNumber = 0, root: string | null = null, parent: string | null = null) =>
  `INSERT INTO quotes (id, client, title, created_at, updated_at, revision_number, revision_root_quote_id, parent_quote_id)
   VALUES ('${id}', 'Cliente', 'Titolo', '2026-10-14T00:00:00.000Z', '2026-10-14T00:00:00.000Z', ${revisionNumber}, ${root === null ? 'NULL' : `'${root}'`}, ${parent === null ? 'NULL' : `'${parent}'`})`;

test('La migrazione revisioni inizializza i preventivi esistenti come Rev.0', async () => {
  const adapter = await database();
  await adapter.execAsync(insertQuote('legacy'));
  assert.deepEqual(await adapter.getFirstAsync('SELECT revision_root_quote_id, parent_quote_id, revision_number FROM quotes WHERE id = \'legacy\''), {
    revision_root_quote_id: null, parent_quote_id: null, revision_number: 0,
  });
});

test('I vincoli revisioni richiedono root Rev.0 e parent consecutivo nella stessa banca dati account', async () => {
  const adapter = await database();
  await adapter.execAsync(insertQuote('root'));
  await adapter.execAsync(insertQuote('rev-1', 1, 'root', 'root'));
  await adapter.execAsync(insertQuote('rev-2', 2, 'root', 'rev-1'));
  await assert.rejects(() => adapter.execAsync(insertQuote('missing-parent', 1, 'root', null)), /root e parent/);
  await assert.rejects(() => adapter.execAsync(insertQuote('self', 1, 'root', 'self')), /se stessa/);
  await assert.rejects(() => adapter.execAsync(insertQuote('wrong-parent', 2, 'root', 'root')), /precedente/);
  await assert.rejects(() => adapter.execAsync(insertQuote('duplicate-revision', 1, 'root', 'root')), /UNIQUE/);
});
