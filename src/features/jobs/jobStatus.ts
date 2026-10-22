import { JobStatus, JobStatusTransition } from './JobRepository';

export type JobListFilter = 'ALL' | 'ACTIVE' | 'COMPLETED';

export const jobListFilters: readonly Readonly<{ value: JobListFilter; label: string }>[] = [
  { value: 'ALL', label: 'Tutti' },
  { value: 'ACTIVE', label: 'Attivi' },
  { value: 'COMPLETED', label: 'Conclusi' },
];

/** Canonical transition policy shared by every UI consumer. */
export function availableJobStatusTransitions(status: JobStatus): readonly JobStatusTransition[] {
  if (status === 'ACTIVE') return ['PAUSED', 'COMPLETED'];
  if (status === 'PAUSED') return ['ACTIVE', 'COMPLETED'];
  return [];
}

export function matchesJobListFilter(status: JobStatus, filter: JobListFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'ACTIVE') return status === 'ACTIVE' || status === 'PAUSED';
  return status === 'COMPLETED' || status === 'CANCELLED';
}
