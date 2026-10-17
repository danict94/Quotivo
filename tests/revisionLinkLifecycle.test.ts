import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('un link superseded resta storico e blocca le decisioni senza redirect', async () => {
  const source = await readFile(path.join(root, 'supabase', 'functions', 'quote-public', 'index.ts'), 'utf8');
  assert.match(source, /Documento sostituito da una revisione più recente/);
  assert.match(source, /share\.lifecycle !== 'ACTIVE' && share\.lifecycle !== 'SUPERSEDED'/);
  assert.match(source, /if \(share\.lifecycle !== 'ACTIVE'\) return generic\(\);/);
  assert.match(source, /share\.lifecycle === 'SUPERSEDED'/);
});

test('la condivisione di una revisione crea una share distinta ACTIVE/PENDING', async () => {
  const edge = await readFile(path.join(root, 'supabase', 'functions', 'quote-share-owner', 'index.ts'), 'utf8');
  const migration = await readFile(path.join(root, 'supabase', 'migrations', '20260915175944_split_quote_share_lifecycle_and_outcome.sql'), 'utf8');
  assert.match(edge, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(migration, /quote_issuance_id, snapshot_id, owner_user_id, token_hash,[\s\S]*'ACTIVE', 'PENDING'/);
});
