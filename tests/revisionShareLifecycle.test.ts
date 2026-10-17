import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { finalizeRevisionShareLifecycle } from '../src/features/quote-issuance/finalizeRevisionShareLifecycle';

test('una bozza revisione non modifica alcuna share', async () => {
  const calls: string[][] = [];
  await finalizeRevisionShareLifecycle({
    finalize: async () => 'draft-saved', revisionShare: null,
    sharingRepository: { supersedeParentForRevision: async (...ids) => { calls.push(ids); } },
  });
  assert.deepEqual(calls, []);
});

test('una revisione emessa supersede il parent solo dopo la finalizzazione locale', async () => {
  const events: string[] = [];
  await finalizeRevisionShareLifecycle({
    finalize: async () => { events.push('finalize'); return 'issued'; },
    revisionShare: { parentIssuanceId: 'parent', revisionIssuanceId: 'revision' },
    sharingRepository: { supersedeParentForRevision: async (parent, revision) => { events.push(`supersede:${parent}:${revision}`); } },
  });
  assert.deepEqual(events, ['finalize', 'supersede:parent:revision']);
});

test('un fallimento di emissione non modifica la share precedente e il retry resta idempotente', async () => {
  let supersedeCalls = 0;
  const input = {
    revisionShare: { parentIssuanceId: 'parent', revisionIssuanceId: 'revision' },
    sharingRepository: { supersedeParentForRevision: async () => { supersedeCalls++; } },
  };
  await assert.rejects(() => finalizeRevisionShareLifecycle({ ...input, finalize: async () => { throw new Error('finalize failed'); } }), /finalize failed/);
  assert.equal(supersedeCalls, 0);
  await finalizeRevisionShareLifecycle({ ...input, finalize: async () => 'issued' });
  await finalizeRevisionShareLifecycle({ ...input, finalize: async () => 'issued' });
  assert.equal(supersedeCalls, 2);
});

test('il RPC supersede solo share ACTIVE del parent e conserva gli outcome storici', async () => {
  const sql = await readFile(path.join(process.cwd(), 'supabase', 'migrations', '20261016001000_supersede_parent_revision_shares.sql'), 'utf8');
  assert.match(sql, /revision_issuance\.parent_issuance_id/);
  assert.match(sql, /share_row\.lifecycle = 'ACTIVE'/);
  assert.match(sql, /set lifecycle = 'SUPERSEDED'/);
  assert.doesNotMatch(sql, /set[\s\S]*commercial_outcome\s*=/i);
});
