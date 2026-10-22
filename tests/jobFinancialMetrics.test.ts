import assert from 'node:assert/strict';
import test from 'node:test';

import { createJobMetrics, JobFinancialInput, projectJobFinancial } from '../src/features/jobs/jobMetrics';

const input = (overrides: Partial<JobFinancialInput> = {}): JobFinancialInput => ({
  baselineQuotedRevenue: 1_000_000, approvedExtrasRevenue: 0,
  totalActualCosts: 600_000, totalWorkEntryCosts: 0,
  costsByCategory: { MATERIALS: 600_000, WORKER: 0, SUBCONTRACTOR: 0, FUEL: 0, TOLLS_PARKING: 0, RENTAL: 0, DISPOSAL: 0, EQUIPMENT: 0, OTHER: 0 },
  totalWorkMinutes: 9_600, ownerWorkMinutes: 9_600, workerWorkMinutes: 0, totalManHours: 160,
  ...overrides,
});

const truthTable: readonly Readonly<{ name: string; data: Partial<JobFinancialInput>; margin: number; percent: number | null; state: 'PROFIT' | 'BREAK_EVEN' | 'LOSS'; ownerDay: number | null }>[] = [
  { name: '1. ricavo 10.000, costi 6.000, venti giornate titolare', data: {}, margin: 400_000, percent: 4_000, state: 'PROFIT', ownerDay: 20_000 },
  { name: '2. costi maggiori dei ricavi', data: { totalActualCosts: 1_100_000 }, margin: -100_000, percent: -1_000, state: 'LOSS', ownerDay: -5_000 },
  { name: '3. pareggio', data: { totalActualCosts: 1_000_000 }, margin: 0, percent: 0, state: 'BREAK_EVEN', ownerDay: 0 },
  { name: '4. costi zero', data: { totalActualCosts: 0 }, margin: 1_000_000, percent: 10_000, state: 'PROFIT', ownerDay: 50_000 },
  { name: '5. ricavi zero', data: { baselineQuotedRevenue: 0 }, margin: -600_000, percent: null, state: 'LOSS', ownerDay: -30_000 },
  { name: '6. nessuna ora titolare', data: { ownerWorkMinutes: 0 }, margin: 400_000, percent: 4_000, state: 'PROFIT', ownerDay: null },
  { name: '7. titolare e lavoratori', data: { totalWorkMinutes: 14_400, workerWorkMinutes: 4_800 }, margin: 400_000, percent: 4_000, state: 'PROFIT', ownerDay: 20_000 },
  { name: '8. costo lavoro incluso una volta', data: { totalActualCosts: 650_000, totalWorkEntryCosts: 50_000 }, margin: 350_000, percent: 3_500, state: 'PROFIT', ownerDay: 17_500 },
  { name: '9. molte categorie costo', data: { totalActualCosts: 876_543 }, margin: 123_457, percent: 1_235, state: 'PROFIT', ownerDay: 6_173 },
  { name: '10. centesimi', data: { baselineQuotedRevenue: 10_001, totalActualCosts: 6_667, totalWorkMinutes: 480, ownerWorkMinutes: 480 }, margin: 3_334, percent: 3_334, state: 'PROFIT', ownerDay: 3_334 },
  { name: '11. valori grandi', data: { baselineQuotedRevenue: 9_000_000_000_000, totalActualCosts: 1_000_000_000_000 }, margin: 8_000_000_000_000, percent: 8_889, state: 'PROFIT', ownerDay: 400_000_000_000 },
  { name: '12. più attività stesso giorno', data: { totalWorkMinutes: 1_440, ownerWorkMinutes: 1_440 }, margin: 400_000, percent: 4_000, state: 'PROFIT', ownerDay: 133_333 },
  { name: '13. solo lavoratori', data: { ownerWorkMinutes: 0, workerWorkMinutes: 9_600 }, margin: 400_000, percent: 4_000, state: 'PROFIT', ownerDay: null },
  { name: '14. margine positivo minimo', data: { totalActualCosts: 999_999 }, margin: 1, percent: 0, state: 'PROFIT', ownerDay: 0 },
  { name: '15. margine negativo minimo', data: { totalActualCosts: 1_000_001 }, margin: -1, percent: 0, state: 'LOSS', ownerDay: 0 },
];

for (const row of truthTable) test(row.name, () => {
  const result = createJobMetrics(projectJobFinancial(input(row.data)));
  assert.equal(result.operatingMargin, row.margin);
  assert.equal(result.operatingMarginPercent, row.percent);
  assert.equal(result.economicState, row.state);
  assert.equal(result.operatingMarginPerOwnerDay, row.ownerDay);
});

test('metrics includes approved extras without conflating them with actual costs', () => {
  const result = createJobMetrics(projectJobFinancial(input({ approvedExtrasRevenue: 50_000 })));
  assert.equal(result.projectedRevenue, 1_050_000);
  assert.equal(result.actualCosts, 600_000);
  assert.equal(result.operatingMargin, 450_000);
});

test('approved extras defaults to zero only in the domain projection', () => {
  const { approvedExtrasRevenue: _unused, ...withoutExtras } = input();
  assert.equal(projectJobFinancial(withoutExtras).approvedExtrasRevenue, 0);
});

test('proprietà: segno del margine e stato restano sempre coerenti', () => {
  for (const actualCosts of [0, 999_999, 1_000_000, 1_000_001, 2_000_000]) {
    const result = createJobMetrics(projectJobFinancial(input({ totalActualCosts: actualCosts })));
    assert.equal(result.operatingMargin, result.projectedRevenue - result.actualCosts);
    assert.equal(result.economicState, result.operatingMargin > 0 ? 'PROFIT' : result.operatingMargin < 0 ? 'LOSS' : 'BREAK_EVEN');
  }
});

test('invalid money and minutes are rejected explicitly', () => {
  assert.throws(() => projectJobFinancial(input({ totalActualCosts: -1 })), /Costi effettivi/);
  assert.throws(() => projectJobFinancial(input({ ownerWorkMinutes: 1.5 })), /Minuti titolare/);
  assert.throws(() => projectJobFinancial(input({ totalWorkEntryCosts: -1 })), /Costi attività/);
});
