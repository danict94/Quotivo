import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261024001000_remote_quote_durability.sql');
const migration = () => readFile(migrationPath, 'utf8');

test('QF-042B keeps editable drafts separate from issuance authority', async () => {
  const sql = await migration();
  assert.match(sql, /create table public\.quote_draft_projections/i);
  assert.match(sql, /create table public\.quote_draft_sync_operations/i);
  assert.match(sql, /get_quote_restore_snapshot/i);
  assert.match(sql, /quote_issuance_snapshots/i);
  assert.match(sql, /sync_quote_draft_projection/i);
  assert.doesNotMatch(sql, /insert into public\.quote_issuances/i);
});

test('QF-042B remote draft protocol has versioned idempotency, tombstones and explicit conflicts', async () => {
  const sql = await migration();
  assert.match(sql, /version bigint not null default 1/i);
  assert.match(sql, /deleted_at timestamptz/i);
  assert.match(sql, /p_expected_version/i);
  assert.match(sql, /QUOTE_DRAFT_OPERATION_CONFLICT/i);
  assert.match(sql, /'CONFLICT'/i);
  assert.match(sql, /quote_draft_sync_operations/i);
});

test('QF-042B preserves owner-only writes and leaves helpers private', async () => {
  const sql = await migration();
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.quote_draft_projections.*authenticated/i);
  assert.match(sql, /revoke all on function public\.quote_draft_projection_record.*authenticated/i);
  assert.match(sql, /grant execute on function public\.get_quote_restore_snapshot\(\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.sync_quote_draft_projection\(text, text, bigint, jsonb\) to authenticated/i);
});

test('QF-042B restore projects the canonical commercial outcome without creating another authority', async () => {
  const sql = await readFile(path.join(process.cwd(), 'supabase', 'migrations', '20261024002000_restore_canonical_commercial_outcomes.sql'), 'utf8');
  assert.match(sql, /left join public\.quote_commercial_outcomes/i);
  assert.match(sql, /coalesce\(outcome\.outcome, 'PENDING'\)/i);
  assert.doesNotMatch(sql, /insert into public\.quote_commercial_outcomes/i);
});
