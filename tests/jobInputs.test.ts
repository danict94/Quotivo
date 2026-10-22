import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { JobCostEntry, JobInputsCacheRepository, JobInputsRemoteRepository, JobWorkEntry } from '../src/features/jobs/JobInputsRepository';
import { JobInputsApplicationService } from '../src/features/jobs/JobInputsApplicationService';
import { projectJobWorkInputs } from '../src/features/jobs/jobFinancialProjection';

const cost = (id = 'cost-1'): JobCostEntry => ({ id, ownerUserId: 'owner', jobId: 'job-1', requestKey: `request-${id}`, category: 'MATERIALS', description: 'Piastrelle', amountCents: 12000, occurredAt: '2026-10-22', workerLabel: null, createdAt: '2026-10-22T10:00:00Z', updatedAt: '2026-10-22T10:00:00Z' });
const work = (id = 'work-1'): JobWorkEntry => ({ id, ownerUserId: 'owner', jobId: 'job-1', requestKey: `request-${id}`, personLabel: 'Mario', role: 'OWNER', workDate: '2026-10-22', durationMinutes: 450, costCents: null, note: null, createdAt: '2026-10-22T10:00:00Z', updatedAt: '2026-10-22T10:00:00Z' });

test('proiezione Job centralizza costi e minuti senza introdurre margini', () => {
  const result = projectJobWorkInputs([cost(), { ...cost('cost-2'), category: 'FUEL', amountCents: 3000 }], [work(), { ...work('work-2'), role: 'WORKER', durationMinutes: 240 }]);
  assert.equal(result.totalActualCosts, 15000);
  assert.equal(result.costsByCategory.MATERIALS, 12000);
  assert.equal(result.costsByCategory.FUEL, 3000);
  assert.equal(result.totalWorkMinutes, 690);
  assert.equal(result.ownerWorkMinutes, 450);
  assert.equal(result.workerWorkMinutes, 240);
  assert.equal(result.totalManHours, 11.5);
});

test('service salva solo la risposta remota e usa cache in sola lettura offline', async () => {
  const storedCosts = new Map<string, JobCostEntry>(); const storedWork = new Map<string, JobWorkEntry>();
  const cache: JobInputsCacheRepository = { list: async () => ({ costs: [...storedCosts.values()], workEntries: [...storedWork.values()] }), saveCost: async (entry) => { storedCosts.set(entry.id, entry); }, removeCost: async (id) => { storedCosts.delete(id); }, saveWork: async (entry) => { storedWork.set(entry.id, entry); }, removeWork: async (id) => { storedWork.delete(id); } };
  let offline = false;
  const remote: JobInputsRemoteRepository = { list: async () => { if (offline) throw new Error('OFFLINE'); return { costs: [cost()], workEntries: [work()] }; }, createCost: async () => cost(), updateCost: async () => cost(), deleteCost: async () => undefined, createWork: async () => work(), updateWork: async () => work(), deleteWork: async () => undefined };
  const service = new JobInputsApplicationService(remote, cache);
  const online = await service.load('job-1'); assert.equal(online.offline, false); assert.equal(storedCosts.size, 1);
  offline = true; const cached = await service.load('job-1'); assert.equal(cached.offline, true); assert.equal(cached.inputs.workEntries[0]?.id, 'work-1');
});

test('migration QF-035A protegge owner, scritture dirette e contratti idempotenti', async () => {
  const sql = await readFile(path.join(process.cwd(), 'supabase', 'migrations', '20261022001000_job_costs_and_work_inputs.sql'), 'utf8');
  assert.match(sql, /create table public\.job_cost_entries/i); assert.match(sql, /create table public\.job_work_entries/i);
  assert.match(sql, /unique \(owner_user_id, request_key\)/i); assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.job_cost_entries/i); assert.match(sql, /create function public\.create_job_cost_entry/i);
  assert.match(sql, /create function public\.create_job_work_entry/i); assert.match(sql, /on conflict \(owner_user_id, request_key\) do nothing/i);
  assert.match(sql, /grant execute on function public\.list_job_cost_entries[\s\S]*public\.create_job_cost_entry/i); assert.match(sql, /assert_account_active/i);
});
