import { centsPerOwnerDay, centsPerOwnerHour, ratioBasisPoints, workDaysFromMinutes } from './jobFinancialCalculator';
import { JobWorkMetrics } from './jobFinancialProjection';

export type JobEconomicState = 'PROFIT' | 'BREAK_EVEN' | 'LOSS';

export type JobFinancialInput = Readonly<JobWorkMetrics & {
  baselineQuotedRevenue: number;
  approvedExtrasRevenue?: number;
}>;

export type JobFinancialProjection = Readonly<Omit<JobFinancialInput, 'approvedExtrasRevenue'> & {
  approvedExtrasRevenue: number;
  projectedRevenue: number;
}>;

export type JobMetrics = Readonly<JobFinancialProjection & {
  actualCosts: number;
  operatingMargin: number;
  operatingMarginPercent: number | null;
  revenuePerOwnerHour: number | null;
  operatingMarginPerOwnerHour: number | null;
  revenuePerOwnerDay: number | null;
  operatingMarginPerOwnerDay: number | null;
  totalManDays: number;
  economicState: JobEconomicState;
}>;

/** Canonical Job economics. Money is integer cents and percentages are basis points. */
export function projectJobFinancial(input: JobFinancialInput): JobFinancialProjection {
  assertFinancialInteger(input.baselineQuotedRevenue, 'Ricavo preventivato');
  const approvedExtrasRevenue = input.approvedExtrasRevenue ?? 0;
  assertFinancialInteger(approvedExtrasRevenue, 'Extra approvati');
  assertFinancialInteger(input.totalActualCosts, 'Costi effettivi');
  assertFinancialInteger(input.totalWorkEntryCosts, 'Costi attività');
  assertFinancialInteger(input.ownerWorkMinutes, 'Minuti titolare');
  assertFinancialInteger(input.workerWorkMinutes, 'Minuti lavoratori');
  assertFinancialInteger(input.totalWorkMinutes, 'Minuti totali');
  Object.values(input.costsByCategory).forEach((cents) => assertFinancialInteger(cents, 'Costo per categoria'));
  const projectedRevenue = input.baselineQuotedRevenue + approvedExtrasRevenue;
  if (!Number.isSafeInteger(projectedRevenue)) throw new Error('Ricavo previsto troppo grande.');
  return { ...input, approvedExtrasRevenue, projectedRevenue };
}

function assertFinancialInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} deve essere un intero non negativo.`);
}

/** Derives displayable/AI-safe metrics only from the canonical financial projection. */
export function createJobMetrics(input: JobFinancialProjection): JobMetrics {
  const { projectedRevenue } = input;
  const operatingMargin = projectedRevenue - input.totalActualCosts;
  const economicState: JobEconomicState = operatingMargin > 0 ? 'PROFIT' : operatingMargin < 0 ? 'LOSS' : 'BREAK_EVEN';
  return {
    ...input,
    projectedRevenue,
    actualCosts: input.totalActualCosts,
    operatingMargin,
    operatingMarginPercent: ratioBasisPoints(operatingMargin, projectedRevenue),
    revenuePerOwnerHour: centsPerOwnerHour(projectedRevenue, input.ownerWorkMinutes),
    operatingMarginPerOwnerHour: centsPerOwnerHour(operatingMargin, input.ownerWorkMinutes),
    revenuePerOwnerDay: centsPerOwnerDay(projectedRevenue, input.ownerWorkMinutes),
    operatingMarginPerOwnerDay: centsPerOwnerDay(operatingMargin, input.ownerWorkMinutes),
    totalManDays: workDaysFromMinutes(input.totalWorkMinutes),
    economicState,
  };
}
