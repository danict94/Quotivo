import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { finalizeRevisionShareLifecycle, recoverRevisionShareLifecycle } from '../src/features/quote-issuance/finalizeRevisionShareLifecycle';

test('una bozza revisione non modifica alcuna share', async () => {
  const calls: string[][] = [];
  const result = await finalizeRevisionShareLifecycle({
    finalize: async () => 'draft-saved', revisionShare: null,
    sharingRepository: { supersedeParentForRevision: async (...ids) => { calls.push(ids); } },
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(result.supersession, { kind: 'NOT_REQUIRED' });
});

test('una revisione emessa supersede il parent solo dopo la finalizzazione locale', async () => {
  const events: string[] = [];
  const result = await finalizeRevisionShareLifecycle({
    finalize: async () => { events.push('finalize'); return 'issued'; },
    revisionShare: { parentIssuanceId: 'parent', revisionIssuanceId: 'revision' },
    sharingRepository: { supersedeParentForRevision: async (parent, revision) => { events.push(`supersede:${parent}:${revision}`); } },
  });
  assert.deepEqual(events, ['finalize', 'supersede:parent:revision']);
  assert.deepEqual(result.supersession, { kind: 'COMPLETE' });
});

test('un fallimento di emissione non modifica la share precedente', async () => {
  let supersedeCalls = 0;
  const input = {
    revisionShare: { parentIssuanceId: 'parent', revisionIssuanceId: 'revision' },
    sharingRepository: { supersedeParentForRevision: async () => { supersedeCalls++; } },
  };
  await assert.rejects(() => finalizeRevisionShareLifecycle({ ...input, finalize: async () => { throw new Error('finalize failed'); } }), /finalize failed/);
  assert.equal(supersedeCalls, 0);
  assert.equal(supersedeCalls, 0);
});

test('errore remoto dopo emissione resta recuperabile senza ripetere emissione', async () => {
  let emissions = 0;
  let attempts = 0;
  const repository = {
    supersedeParentForRevision: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('remote unavailable');
    },
  };
  const result = await finalizeRevisionShareLifecycle({
    finalize: async () => { emissions += 1; return 'issued-rev2'; },
    revisionShare: { parentIssuanceId: 'rev1-issuance', revisionIssuanceId: 'rev2-issuance' },
    sharingRepository: repository,
  });
  assert.equal(emissions, 1);
  assert.equal(result.emission, 'issued-rev2');
  assert.equal(result.supersession.kind, 'PENDING_RECOVERY');
  await recoverRevisionShareLifecycle(repository, { parentIssuanceId: 'rev1-issuance', revisionIssuanceId: 'rev2-issuance' });
  await recoverRevisionShareLifecycle(repository, { parentIssuanceId: 'rev1-issuance', revisionIssuanceId: 'rev2-issuance' });
  assert.equal(emissions, 1);
  assert.equal(attempts, 3);
});

test('Rev2 e Rev3 supersedono solo la revisione parent immediata della chain', async () => {
  const calls: string[][] = [];
  const repository = { supersedeParentForRevision: async (...ids: string[]) => { calls.push(ids); } };
  await recoverRevisionShareLifecycle(repository, { parentIssuanceId: 'rev1-issuance', revisionIssuanceId: 'rev2-issuance' });
  await recoverRevisionShareLifecycle(repository, { parentIssuanceId: 'rev2-issuance', revisionIssuanceId: 'rev3-issuance' });
  assert.deepEqual(calls, [
    ['rev1-issuance', 'rev2-issuance'],
    ['rev2-issuance', 'rev3-issuance'],
  ]);
});

test('il RPC supersede solo share ACTIVE del parent e conserva gli outcome storici', async () => {
  const sql = await readFile(path.join(process.cwd(), 'supabase', 'migrations', '20261016001000_supersede_parent_revision_shares.sql'), 'utf8');
  assert.match(sql, /revision_issuance\.parent_issuance_id/);
  assert.match(sql, /share_row\.lifecycle = 'ACTIVE'/);
  assert.match(sql, /set lifecycle = 'SUPERSEDED'/);
  assert.doesNotMatch(sql, /set[\s\S]*commercial_outcome\s*=/i);
});
