import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migrationPath = path.join(root, 'supabase', 'migrations', '20261016002000_account_lifecycle_foundation.sql');
const read = (file: string) => readFile(file, 'utf8');

test('account lifecycle inizializza ACTIVE per account esistenti e futuri con RLS owner-only', async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /create table public\.account_lifecycle[\s\S]*status text not null default 'ACTIVE'/i);
  assert.match(sql, /insert into public\.account_lifecycle \(user_id\)[\s\S]*from auth\.users/i);
  assert.match(sql, /insert into public\.account_lifecycle \(user_id\) values \(new\.id\)/i);
  assert.match(sql, /enable row level security[\s\S]*users read own account lifecycle/i);
  assert.match(sql, /Users can update their active profile[\s\S]*assert_account_active\(auth\.uid\(\)\)/i);
});

test('lifecycle is idempotent and the central guard distinguishes auth and deactivation', async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /function public\.assert_account_active[\s\S]*AUTH_REQUIRED/i);
  assert.match(sql, /ACCOUNT_DEACTIVATED/i);
  assert.match(sql, /function public\.set_account_lifecycle[\s\S]*on conflict \(user_id\) do nothing/i);
  assert.match(sql, /where lifecycle\.user_id = v_user_id and lifecycle\.status is distinct from p_status/i);
});

test('all server writers call the lifecycle guard and public links are blocked', async () => {
  const sql = await read(migrationPath);
  for (const fn of ['initialize_quote_sequence', 'advance_quote_sequence', 'authorize_quote_issue', 'authorize_quote_revision_issue', 'create_quote_share_secure', 'revoke_quote_share', 'supersede_parent_revision_shares']) {
    const start = sql.indexOf(`function public.${fn}`);
    assert.ok(start >= 0, `${fn} is missing`);
    assert.match(sql.slice(start, start + 2500), /perform public\.assert_account_active\(\)/i);
  }
  const owner = await read(path.join(root, 'supabase', 'functions', 'quote-share-owner', 'index.ts'));
  const publicFn = await read(path.join(root, 'supabase', 'functions', 'quote-public', 'index.ts'));
  assert.match(owner, /ACCOUNT_DEACTIVATED/);
  assert.match(owner, /auth\.rpc\('assert_account_active'\)/);
  assert.match(publicFn, /db\.rpc\('assert_account_active', \{ p_user_id: share\.owner_user_id \}\)/);
});
