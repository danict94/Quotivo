import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { jobCostWriteCategories, JobCostEntry, JobWorkEntry } from '../src/features/jobs/JobInputsRepository';
import { projectJobWorkInputs } from '../src/features/jobs/jobFinancialProjection';

const cost = (overrides: Partial<JobCostEntry> = {}): JobCostEntry => ({
  id: 'cost-1', ownerUserId: 'owner', jobId: 'job-1', requestKey: 'cost-request', category: 'MATERIALS', description: 'Material', amountCents: 0, occurredAt: '2026-10-23', workerLabel: null, createdAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T10:00:00Z', ...overrides,
});
const work = (overrides: Partial<JobWorkEntry> = {}): JobWorkEntry => ({
  id: 'work-1', ownerUserId: 'owner', jobId: 'job-1', requestKey: 'work-request', personLabel: 'Mario', role: 'WORKER', workDate: '2026-10-23', durationMinutes: 480, costCents: null, note: null, createdAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T10:00:00Z', ...overrides,
});

test('a work entry cost is included once and generic WORKER is not writable', () => {
  const result = projectJobWorkInputs([], [work({ costCents: 10_000 })]);
  assert.equal(result.totalWorkEntryCosts, 10_000);
  assert.equal(result.totalActualCosts, 10_000);
  assert.equal((jobCostWriteCategories as readonly string[]).includes('WORKER'), false);
});

test('multiple work costs sum correctly and SUBCONTRACTOR remains a generic cost', () => {
  const result = projectJobWorkInputs([cost({ category: 'SUBCONTRACTOR', amountCents: 7_500 })], [work({ costCents: 10_000 }), work({ id: 'work-2', requestKey: 'work-request-2', role: 'COLLABORATOR', costCents: 2_500 })]);
  assert.equal(result.totalWorkEntryCosts, 12_500);
  assert.equal(result.costsByCategory.SUBCONTRACTOR, 7_500);
  assert.equal(result.totalActualCosts, 20_000);
});

test('a legacy WORKER cost remains readable without changing its historical total', () => {
  const result = projectJobWorkInputs([cost({ category: 'WORKER', amountCents: 10_000 })], []);
  assert.equal(result.costsByCategory.WORKER, 10_000);
  assert.equal(result.totalActualCosts, 10_000);
});

test('QF-035B migration rejects new generic personal costs at the database authority', async () => {
  const sql = await readFile(path.join(process.cwd(), 'supabase', 'migrations', '20261023000000_enforce_job_labor_cost_ssot.sql'), 'utf8');
  assert.match(sql, /create trigger job_cost_entries_prevent_generic_worker_cost/i);
  assert.match(sql, /if p_category = 'WORKER' then[\s\S]*JOB_LABOR_COST_MUST_USE_WORK_ENTRY/i);
  assert.match(sql, /'MATERIALS','SUBCONTRACTOR','FUEL','TOLLS_PARKING','RENTAL','DISPOSAL','EQUIPMENT','OTHER'/i);
  assert.match(sql, /Historic WORKER rows remain readable/i);
  assert.match(sql, /revoke all on function public\.prevent_generic_job_worker_cost\(\) from public, anon, authenticated/i);
});
