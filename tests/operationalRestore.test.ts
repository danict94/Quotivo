import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { Job } from '../src/features/jobs/JobRepository';
import { JobCostEntry, JobWorkEntry } from '../src/features/jobs/JobInputsRepository';
import { OperationalRestoreLocalRepository, OperationalRestoreRemoteRepository, OperationalRestoreSnapshot } from '../src/features/operational-restore/OperationalRestoreContracts';
import { OperationalRestoreSyncService } from '../src/features/operational-restore/OperationalRestoreSyncService';

const job = (): Job => ({ id:'job-1', ownerUserId:'owner-a', sourceRootIssuanceId:'issuance-0', sourceIssuanceId:'issuance-1', sourceRevisionNumber:1, clientName:'Rossi', title:'Bagno', quotedAmountCents:1000000, currency:'EUR', status:'ACTIVE', createdAt:'2026-10-24T10:00:00.000Z', startedAt:'2026-10-24T10:00:00.000Z', completedAt:null, cancelledAt:null, updatedAt:'2026-10-24T10:00:00.000Z' });
const cost = (): JobCostEntry => ({ id:'cost-1', ownerUserId:'owner-a', jobId:'job-1', requestKey:'cost-key', category:'MATERIALS', description:'Piastrelle', amountCents:250000, occurredAt:'2026-10-25', workerLabel:null, createdAt:'2026-10-25T10:00:00.000Z', updatedAt:'2026-10-25T10:00:00.000Z' });
const work = (): JobWorkEntry => ({ id:'work-1', ownerUserId:'owner-a', jobId:'job-1', requestKey:'work-key', personLabel:'Mario', role:'OWNER', workDate:'2026-10-25', durationMinutes:480, costCents:50000, note:null, createdAt:'2026-10-25T10:00:00.000Z', updatedAt:'2026-10-25T10:00:00.000Z' });
const snapshot = (): OperationalRestoreSnapshot => ({ shares:[{ id:'share-1', issuanceId:'issuance-1', lifecycle:'ACTIVE', openedAt:null, createdAt:'2026-10-24T10:00:00.000Z' }], jobs:[job()], costs:[cost()], workEntries:[work()], missingSnapshotIssuanceIds:[] });

class Local implements OperationalRestoreLocalRepository {
  applied: OperationalRestoreSnapshot[] = [];
  failOnce = false;
  async replaceProjection(value: OperationalRestoreSnapshot) { if (this.failOnce) { this.failOnce=false; throw new Error('SQLITE_FAILED'); } this.applied.push(value); }
}
class Remote implements OperationalRestoreRemoteRepository {
  calls = 0;
  constructor(private readonly value: OperationalRestoreSnapshot) {}
  async getSnapshot() { this.calls += 1; return this.value; }
}

test('operational discovery replaces a complete projection idempotently without duplicating a Job chain', async () => {
  const local = new Local(); const remote = new Remote(snapshot()); const service = new OperationalRestoreSyncService(local, remote);
  await service.sync(); await service.sync();
  assert.equal(remote.calls, 2);
  assert.equal(local.applied.length, 2);
  assert.equal(local.applied[1].jobs.filter((entry) => entry.sourceRootIssuanceId === 'issuance-0').length, 1);
  assert.equal(local.applied[1].costs[0]?.amountCents, 250000);
  assert.equal(local.applied[1].workEntries[0]?.costCents, 50000);
});

test('a failed local replacement leaves retry to apply the same remote-authoritative snapshot', async () => {
  const local = new Local(); local.failOnce=true; const remote = new Remote(snapshot()); const service = new OperationalRestoreSyncService(local, remote);
  await assert.rejects(service.sync(), /SQLITE_FAILED/);
  await service.sync();
  assert.equal(local.applied.length, 1);
  assert.equal(local.applied[0].jobs[0]?.sourceIssuanceId, 'issuance-1');
});

test('missing immutable snapshots are explicit recovery records, never reconstructed from shares', async () => {
  const local = new Local(); const remote = new Remote({ ...snapshot(), missingSnapshotIssuanceIds:['issuance-missing'] });
  await new OperationalRestoreSyncService(local, remote).sync();
  assert.deepEqual(local.applied[0].missingSnapshotIssuanceIds, ['issuance-missing']);
});

test('operational restore SQL is owner-scoped, token-free, and grants only its public read RPC', async () => {
  const sql = await readFile(path.join(process.cwd(), 'supabase', 'migrations', '20261024003000_operational_remote_discovery.sql'), 'utf8');
  assert.match(sql, /security definer set search_path = ''/i);
  assert.match(sql, /where share_row\.owner_user_id = auth\.uid\(\)/i);
  assert.match(sql, /where job\.owner_user_id = auth\.uid\(\)/i);
  assert.match(sql, /ISSUANCE_MISSING_SNAPSHOT/);
  assert.doesNotMatch(sql, /token_hash|token_ciphertext|quote_share_token_secrets/i);
  assert.match(sql, /revoke all on function public\.get_operational_restore_snapshot\(\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.get_operational_restore_snapshot\(\) to authenticated/i);
});
