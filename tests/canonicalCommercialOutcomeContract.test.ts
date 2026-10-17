import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function source(relativePath: string) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('canonical commercial outcome is unique per issuance, immutable, and backfills legacy public decisions', async () => {
  const migration = await source('supabase/migrations/20261017001000_canonical_commercial_outcomes.sql');
  assert.match(migration, /create table public\.quote_commercial_outcomes/);
  assert.match(migration, /quote_issuance_id uuid primary key/);
  assert.match(migration, /outcome in \('ACCEPTED', 'REJECTED'\)/);
  assert.match(migration, /source in \('MANUAL', 'PUBLIC_LINK'\)/);
  assert.match(migration, /row_number\(\) over[\s\S]*partition by share\.quote_issuance_id/i);
  assert.match(migration, /quote_commercial_outcomes_immutable/);
});

test('record RPC implements first-write-wins and explicit final-decision conflict', async () => {
  const migration = await source('supabase/migrations/20261017001000_canonical_commercial_outcomes.sql');
  assert.match(migration, /insert into public\.quote_commercial_outcomes[\s\S]*on conflict \(quote_issuance_id\) do nothing[\s\S]*returning \* into inserted/i);
  assert.match(migration, /raise exception 'ALREADY_DECIDED'/);
  assert.match(migration, /p_source = 'PUBLIC_LINK'[\s\S]*share\.lifecycle = 'ACTIVE'/);
});

test('public link records canonical PUBLIC_LINK outcomes and keeps its legacy field as projection only', async () => {
  const publicFunction = await source('supabase/functions/quote-public/index.ts');
  assert.match(publicFunction, /from\('quote_commercial_outcomes'\)/);
  assert.match(publicFunction, /rpc\('record_quote_commercial_outcome'/);
  assert.match(publicFunction, /p_source: 'PUBLIC_LINK'/);
  assert.match(publicFunction, /p_source_share_id: share\.id/);
  assert.match(publicFunction, /Legacy compatibility projection only/);
  assert.match(publicFunction, /page\(snapshot\.payload as PublicPayload, commercialOutcome/);
});

test('owner function exposes a manual API contract with explicit ALREADY_DECIDED and RLS errors', async () => {
  const ownerFunction = await source('supabase/functions/quote-share-owner/index.ts');
  assert.match(ownerFunction, /action === 'record-manual-outcome'/);
  assert.match(ownerFunction, /p_source: 'MANUAL'/);
  assert.match(ownerFunction, /ALREADY_DECIDED/);
  assert.match(ownerFunction, /error: 'RLS'/);
});
