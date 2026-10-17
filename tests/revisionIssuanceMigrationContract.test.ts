import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const migrationPath=path.join(process.cwd(),'supabase','migrations','20261015000000_016_quote_revision_issuance.sql');
async function migration(){return readFile(migrationPath,'utf8');}

test('La migrazione revisioni sostituisce l univocita del numero base con indici per root e revisione',async()=>{
  const sql=await migration();
  assert.match(sql,/drop index public\.quote_issuances_owner_number_unique/i);
  assert.match(sql,/quote_issuances_owner_base_number_unique[\s\S]*revision_number = 0/i);
  assert.match(sql,/quote_issuances_owner_revision_unique[\s\S]*revision_root_issuance_id, revision_number/i);
});

test('RPC revisione non avanza sequenze e conta soltanto le emissioni base per quota',async()=>{
  const sql=await migration(); const revisionRpc=sql.slice(sql.indexOf('create function public.authorize_quote_revision_issue'));
  assert.match(revisionRpc,/pg_advisory_xact_lock/i);
  assert.match(revisionRpc,/q\.revision_number=0/i);
  assert.doesNotMatch(revisionRpc,/update public\.quote_number_sequences/i);
  assert.match(revisionRpc,/INVALID_REVISION_ROOT|INVALID_REVISION_PARENT/i);
  assert.match(revisionRpc,/REVISION_ALREADY_EXISTS/i);
});
