import assert from 'node:assert/strict';
import test from 'node:test';
import initSqlJs, { Database } from 'sql.js';

import { SQLiteRevisionChainCapabilityRepository } from '../src/features/revisions/SQLiteRevisionChainCapabilityRepository';
import { runMigrations } from '../src/migrations';

class SqliteAdapter {
  constructor(readonly db: Database) {}
  async execAsync(sql: string) { this.db.run(sql); }
  async getFirstAsync<T>(sql: string, ...params: string[]) {
    const statement = this.db.prepare(sql, params);
    try { return statement.step() ? statement.getAsObject() as T : null; }
    finally { statement.free(); }
  }
  async getAllAsync<T>(sql: string, ...params: string[]) {
    const statement = this.db.prepare(sql, params);
    try { const rows: T[] = []; while (statement.step()) rows.push(statement.getAsObject() as T); return rows; }
    finally { statement.free(); }
  }
}

async function database() {
  const SQL = await initSqlJs();
  const adapter = new SqliteAdapter(new SQL.Database());
  await adapter.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(adapter);
  return adapter;
}

async function insert(adapter: SqliteAdapter, id: string, revisionNumber: number, root: string | null, parent: string | null, status: 'draft' | 'issued') {
  const issued = status === 'issued';
  await adapter.db.run(
    'INSERT INTO quotes (id, number, number_year, client, title, status, created_at, updated_at, issued_at, revision_root_quote_id, parent_quote_id, revision_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, issued ? 7 : null, issued ? 2026 : null, 'Cliente', 'Titolo', status, '2026-10-19T10:00:00.000Z', '2026-10-19T10:00:00.000Z', issued ? '2026-10-19T10:00:00.000Z' : null, root, parent, revisionNumber],
  );
}

test('SQLite: matrice Rev0 fino a Rev3 mantiene CREATE, RESUME e storico', async () => {
  const adapter = await database();
  const repository = new SQLiteRevisionChainCapabilityRepository(adapter);
  await insert(adapter, 'rev0', 0, null, null, 'issued');
  assert.deepEqual(await repository.resolve('rev0'), { kind: 'CREATE' });

  await insert(adapter, 'rev1-draft', 1, 'rev0', 'rev0', 'draft');
  assert.deepEqual(await repository.resolve('rev0'), { kind: 'RESUME', draftQuoteId: 'rev1-draft' });

  await adapter.db.run("UPDATE quotes SET status='issued', number=7, number_year=2026, issued_at='2026-10-19T11:00:00.000Z' WHERE id='rev1-draft'");
  assert.deepEqual(await repository.resolve('rev0'), { kind: 'NONE_HISTORICAL' });
  assert.deepEqual(await repository.resolve('rev1-draft'), { kind: 'CREATE' });

  await insert(adapter, 'rev2-draft', 2, 'rev0', 'rev1-draft', 'draft');
  assert.deepEqual(await repository.resolve('rev1-draft'), { kind: 'RESUME', draftQuoteId: 'rev2-draft' });
  await adapter.db.run("UPDATE quotes SET status='issued', number=7, number_year=2026, issued_at='2026-10-19T12:00:00.000Z' WHERE id='rev2-draft'");
  assert.deepEqual(await repository.resolve('rev1-draft'), { kind: 'NONE_HISTORICAL' });
  assert.deepEqual(await repository.resolve('rev2-draft'), { kind: 'CREATE' });

  await insert(adapter, 'rev3-draft', 3, 'rev0', 'rev2-draft', 'draft');
  assert.deepEqual(await repository.resolve('rev2-draft'), { kind: 'RESUME', draftQuoteId: 'rev3-draft' });
});

test('SQLite: source assente e lineage corrotto sono errori espliciti', async () => {
  const adapter = await database();
  const repository = new SQLiteRevisionChainCapabilityRepository(adapter);
  assert.deepEqual(await repository.resolve('missing'), { kind: 'ERROR_NOT_FOUND' });

  await insert(adapter, 'rev0', 0, null, null, 'issued');
  await insert(adapter, 'rev1', 1, 'rev0', 'rev0', 'issued');
  await adapter.db.run('DROP TRIGGER prevent_issued_quote_update');
  await adapter.db.run("UPDATE quotes SET revision_root_quote_id='missing-root' WHERE id='rev1'");
  assert.deepEqual(await repository.resolve('rev1'), { kind: 'ERROR_INVALID_LINEAGE' });
});
