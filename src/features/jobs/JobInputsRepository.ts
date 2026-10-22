export const jobCostCategories = ['MATERIALS', 'WORKER', 'SUBCONTRACTOR', 'FUEL', 'TOLLS_PARKING', 'RENTAL', 'DISPOSAL', 'EQUIPMENT', 'OTHER'] as const;
export type JobCostCategory = (typeof jobCostCategories)[number];
export const jobWorkRoles = ['OWNER', 'WORKER', 'COLLABORATOR'] as const;
export type JobWorkRole = (typeof jobWorkRoles)[number];

export type JobCostEntry = Readonly<{
  id: string; ownerUserId: string; jobId: string; requestKey: string; category: JobCostCategory;
  description: string; amountCents: number; occurredAt: string; workerLabel: string | null;
  createdAt: string; updatedAt: string;
}>;
export type JobWorkEntry = Readonly<{
  id: string; ownerUserId: string; jobId: string; requestKey: string; personLabel: string;
  role: JobWorkRole; workDate: string; durationMinutes: number; costCents: number | null;
  note: string | null; createdAt: string; updatedAt: string;
}>;

export type JobCostDraft = Readonly<{ requestKey: string; category: JobCostCategory; description: string; amountCents: number; occurredAt: string; workerLabel: string | null }>;
export type JobWorkDraft = Readonly<{ requestKey: string; personLabel: string; role: JobWorkRole; workDate: string; durationMinutes: number; costCents: number | null; note: string | null }>;
export type JobInputs = Readonly<{ costs: readonly JobCostEntry[]; workEntries: readonly JobWorkEntry[] }>;

export interface JobInputsRemoteRepository {
  list(jobId: string): Promise<JobInputs>;
  createCost(jobId: string, draft: JobCostDraft): Promise<JobCostEntry>;
  updateCost(entryId: string, draft: Omit<JobCostDraft, 'requestKey'>): Promise<JobCostEntry>;
  deleteCost(entryId: string): Promise<void>;
  createWork(jobId: string, draft: JobWorkDraft): Promise<JobWorkEntry>;
  updateWork(entryId: string, draft: Omit<JobWorkDraft, 'requestKey'>): Promise<JobWorkEntry>;
  deleteWork(entryId: string): Promise<void>;
}

export interface JobInputsCacheRepository {
  list(jobId: string): Promise<JobInputs>;
  saveCost(entry: JobCostEntry): Promise<void>;
  removeCost(entryId: string): Promise<void>;
  saveWork(entry: JobWorkEntry): Promise<void>;
  removeWork(entryId: string): Promise<void>;
}
