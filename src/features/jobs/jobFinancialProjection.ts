import { JobCostCategory, JobCostEntry, JobWorkEntry } from './JobInputsRepository';

export type JobWorkMetrics = Readonly<{
  totalActualCosts: number;
  costsByCategory: Readonly<Record<JobCostCategory, number>>;
  totalWorkMinutes: number;
  ownerWorkMinutes: number;
  workerWorkMinutes: number;
  totalManHours: number;
}>;

/** Pure SSOT for future economic projections. UI, charts and AI consume this result only. */
export function projectJobWorkInputs(costs: readonly JobCostEntry[], workEntries: readonly JobWorkEntry[]): JobWorkMetrics {
  const costsByCategory = { MATERIALS: 0, WORKER: 0, SUBCONTRACTOR: 0, FUEL: 0, TOLLS_PARKING: 0, RENTAL: 0, DISPOSAL: 0, EQUIPMENT: 0, OTHER: 0 } satisfies Record<JobCostCategory, number>;
  for (const cost of costs) costsByCategory[cost.category] += cost.amountCents;
  const totalWorkMinutes = workEntries.reduce((total, entry) => total + entry.durationMinutes, 0);
  const ownerWorkMinutes = workEntries.filter((entry) => entry.role === 'OWNER').reduce((total, entry) => total + entry.durationMinutes, 0);
  const workerWorkMinutes = workEntries.filter((entry) => entry.role !== 'OWNER').reduce((total, entry) => total + entry.durationMinutes, 0);
  return { totalActualCosts: costs.reduce((total, entry) => total + entry.amountCents, 0), costsByCategory, totalWorkMinutes, ownerWorkMinutes, workerWorkMinutes, totalManHours: totalWorkMinutes / 60 };
}
