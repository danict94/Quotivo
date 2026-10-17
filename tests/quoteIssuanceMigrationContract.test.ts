import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260915000000_012_rewrite_authorize_quote_issue.sql');

async function migration() {
  return readFile(migrationPath, 'utf8');
}

test('Migration 012 elimina FOUND e usa un record issuance esplicito per il retry idempotente', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /\bFOUND\b/i);
  assert.match(sql, /v_existing_issuance\.id is not null/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /where q\.user_id = v_user_id\s+and q\.client_quote_id = trim\(stable_quote_id\)/i);
});

test('Migration 012 assegna e restituisce sempre il numero canonico per AUTHORIZED', async () => {
  const sql = await migration();
  assert.match(sql, /returning \* into v_existing_issuance/i);
  assert.match(sql, /v_existing_issuance\.sequence_number is null[\s\S]*v_existing_issuance\.sequence_year is null[\s\S]*v_existing_issuance\.display_number is null/i);
  assert.match(sql, /v_display_number := v_sequence_number::text \|\| '\/' \|\| v_sequence_year::text/i);
  assert.match(sql, /true,\s*'AUTHORIZED',\s*v_existing_issuance\.id,[\s\S]*v_existing_issuance\.sequence_number,[\s\S]*v_existing_issuance\.sequence_year,[\s\S]*v_existing_issuance\.display_number/i);
});

test('Migration 012 mantiene quota esplicita e allocazione atomica della sequenza', async () => {
  const sql = await migration();
  assert.match(sql, /select count\(\*\)::integer\s+into v_monthly_count/i);
  assert.match(sql, /if not v_is_pro and v_monthly_count >= 3/i);
  assert.match(sql, /update public\.quote_number_sequences as s[\s\S]*last_number = s\.last_number \+ 1[\s\S]*returning s\.last_number into v_sequence_number/i);
  assert.match(sql, /insert into public\.quote_issuances/i);
});
