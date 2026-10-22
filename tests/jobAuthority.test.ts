import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { Job, JobCacheRepository, JobCapability, JobRemoteRepository } from '../src/features/jobs/JobRepository';
import { SQLiteJobCacheRepository } from '../src/features/jobs/SQLiteJobCacheRepository';
import { SupabaseJobRepository } from '../src/features/jobs/SupabaseJobRepository';
import { recoverJobIssuanceSnapshot, resolveJobCapability, StartJobUseCase, TransitionJobStatusUseCase } from '../src/features/jobs/jobAuthorityUseCase';

const job = (id = 'job-rev-1'): Job => ({
  id,
  ownerUserId: 'owner-a',
  sourceRootIssuanceId: 'issuance-rev-0',
  sourceIssuanceId: 'issuance-rev-1',
  sourceRevisionNumber: 1,
  clientName: 'Rossi',
  title: 'Rifacimento bagno',
  quotedAmountCents: 1215500,
  currency: 'EUR',
  status: 'ACTIVE',
  createdAt: '2026-10-21T12:00:00.000Z',
  startedAt: '2026-10-21T12:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  updatedAt: '2026-10-21T12:00:00.000Z',
});

const transition = async () => job();

function cache(initial?: Job, failWrites = false): JobCacheRepository & { values: Map<string, Job> } {
  const values = new Map(initial ? [[initial.sourceRootIssuanceId, initial]] : []);
  return {
    values,
    async getBySourceRootIssuanceId(root) { return values.get(root) ?? null; },
    async save(value) {
      if (failWrites) throw new Error('SQLITE_WRITE_FAILED');
      values.set(value.sourceRootIssuanceId, value);
    },
  };
}

test('offline senza Job sincronizzato non autorizza START', async () => {
  const result = await resolveJobCapability({
    remote: { resolveCapability: async () => { throw new Error('OFFLINE'); }, start: async () => job(), transitionStatus: transition },
    cache: cache(), issuanceId: 'issuance-rev-1', sourceRootIssuanceId: 'issuance-rev-0',
  });
  assert.deepEqual(result, { kind: 'ERROR', code: 'OFFLINE' });
});

test('gli adapter restano contratti isolati: nessun wiring UI o App.tsx', () => {
  const sqlite = new SQLiteJobCacheRepository({
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
    runAsync: async () => undefined,
  });
  assert.ok(sqlite);
  assert.ok(new SupabaseJobRepository({ rpc: async () => ({ data: [], error: null }) }));
});

test('Job remoto valido viene proiettato e resta apribile offline', async () => {
  const persisted = cache();
  const remote: JobRemoteRepository = {
    resolveCapability: async (): Promise<JobCapability> => ({ kind: 'OPEN', job: job() }),
    start: async () => job(), transitionStatus: transition,
  };
  assert.equal((await resolveJobCapability({ remote, cache: persisted, issuanceId: 'issuance-rev-2', sourceRootIssuanceId: 'issuance-rev-0' })).kind, 'OPEN');
  const offline: JobRemoteRepository = { resolveCapability: async () => { throw new Error('OFFLINE'); }, start: async () => job(), transitionStatus: transition };
  const recovered = await resolveJobCapability({ remote: offline, cache: persisted, issuanceId: 'issuance-rev-2', sourceRootIssuanceId: 'issuance-rev-0' });
  assert.equal(recovered.kind, 'OPEN');
  if (recovered.kind === 'OPEN') assert.equal(recovered.job.id, 'job-rev-1');
});

test('doppio tap e retry ricevono lo stesso Job remoto per la stessa chain', async () => {
  const persisted = cache();
  let calls = 0;
  const remote: JobRemoteRepository = {
    resolveCapability: async () => ({ kind: 'START' }),
    start: async () => { calls += 1; return job('job-singleton'); }, transitionStatus: transition,
  };
  const [first, second] = await Promise.all([
    StartJobUseCase({ remote, cache: persisted, issuanceId: 'issuance-rev-1' }),
    StartJobUseCase({ remote, cache: persisted, issuanceId: 'issuance-rev-1' }),
  ]);
  assert.equal(first.job.id, 'job-singleton');
  assert.equal(second.job.id, 'job-singleton');
  assert.equal(calls, 2);
  assert.equal(persisted.values.size, 1);
});

test('fallimento cache dopo creazione remota e retry recuperano lo stesso Job senza riemissione', async () => {
  const remote: JobRemoteRepository = { resolveCapability: async () => ({ kind: 'START' }), start: async () => job('job-created-once'), transitionStatus: transition };
  const first = await StartJobUseCase({ remote, cache: cache(undefined, true), issuanceId: 'issuance-rev-1' });
  assert.equal(first.kind, 'PENDING_CACHE_RECOVERY');
  const persisted = cache();
  const retry = await StartJobUseCase({ remote, cache: persisted, issuanceId: 'issuance-rev-1' });
  assert.equal(retry.kind, 'COMPLETE');
  assert.equal(persisted.values.get('issuance-rev-0')?.id, 'job-created-once');
});

test('la transizione remota aggiorna la cache solo dalla risposta valida e il retry è idempotente', async () => {
  const completed = { ...job(), status: 'COMPLETED' as const, completedAt: '2026-10-22T12:00:00.000Z', updatedAt: '2026-10-22T12:00:00.000Z' };
  const persisted = cache();
  const remote: JobRemoteRepository = { resolveCapability: async () => ({ kind: 'OPEN', job: completed }), start: async () => completed, transitionStatus: async () => completed };
  const result = await TransitionJobStatusUseCase({ remote, cache: persisted, jobId: completed.id, targetStatus: 'COMPLETED' });
  assert.equal(result.kind, 'COMPLETE');
  assert.equal(persisted.values.get(completed.sourceRootIssuanceId)?.status, 'COMPLETED');
});

test('fallimento cache dopo transizione remota è recuperabile senza una seconda transizione', async () => {
  const paused = { ...job(), status: 'PAUSED' as const, updatedAt: '2026-10-22T12:00:00.000Z' };
  let calls = 0;
  const remote: JobRemoteRepository = { resolveCapability: async () => ({ kind: 'OPEN', job: paused }), start: async () => paused, transitionStatus: async () => { calls += 1; return paused; } };
  const first = await TransitionJobStatusUseCase({ remote, cache: cache(undefined, true), jobId: paused.id, targetStatus: 'PAUSED' });
  assert.equal(first.kind, 'PENDING_CACHE_RECOVERY');
  const persisted = cache();
  const retry = await TransitionJobStatusUseCase({ remote, cache: persisted, jobId: paused.id, targetStatus: 'PAUSED' });
  assert.equal(retry.kind, 'COMPLETE');
  assert.equal(calls, 2);
  assert.equal(persisted.values.get(paused.sourceRootIssuanceId)?.status, 'PAUSED');
});

test('recovery storico registra solo lo snapshot immutabile della stessa issuance', async () => {
  const recovered: Array<{ quoteId: string; issuanceId: string }> = [];
  await recoverJobIssuanceSnapshot({
    quoteId: 'quote-rev-1',
    issuanceId: 'issuance-rev-1',
    recovery: { recover: async (input) => { recovered.push(input); } },
  });
  assert.deepEqual(recovered, [{ quoteId: 'quote-rev-1', issuanceId: 'issuance-rev-1' }]);
});

test('migration rende authority remota idempotente, owner-isolata e basata su snapshot', async () => {
  const sql = await readFile(path.join(process.cwd(), 'supabase', 'migrations', '20261021003000_job_authority_foundation.sql'), 'utf8');
  assert.match(sql, /create table public\.jobs/i);
  assert.match(sql, /unique \(owner_user_id, source_root_issuance_id\)/i);
  assert.match(sql, /quote_issuance_snapshots/i);
  assert.match(sql, /quote_commercial_outcomes/i);
  assert.match(sql, /outcome\.outcome = 'ACCEPTED'/i);
  assert.match(sql, /parent_issuance_id = v_source\.id/i);
  assert.match(sql, /INVALID_LINEAGE/i);
  assert.match(sql, /on conflict \(owner_user_id, source_root_issuance_id\) do nothing/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /owner_user_id = auth\.uid\(\)/i);
  assert.match(sql, /revoke all on function public\.resolve_job_capability_internal/i);
  assert.match(sql, /grant execute on function public\.start_job\(uuid\) to authenticated/i);
  const correction = await readFile(path.join(process.cwd(), 'supabase', 'migrations', '20261021004000_fix_job_start_conflict_target.sql'), 'utf8');
  assert.match(correction, /on conflict on constraint jobs_owner_user_id_source_root_issuance_id_key do nothing/i);
});

test('migration QF-031 canonicalizza stati, timestamp e transizioni server-side', async () => {
  const sql = await readFile(path.join(process.cwd(), 'supabase', 'migrations', '20261022000000_job_states.sql'), 'utf8');
  assert.match(sql, /update public\.jobs set status = 'ACTIVE' where status = 'OPEN'/i);
  assert.match(sql, /status in \('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'\)/i);
  assert.match(sql, /create function public\.transition_job_status/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /v_job\.status = p_target_status/i);
  assert.match(sql, /grant execute on function public\.transition_job_status\(uuid, text\) to authenticated/i);
});
