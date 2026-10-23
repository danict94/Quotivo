import { Job } from '../jobs/JobRepository';
import { JobCostEntry, JobWorkEntry } from '../jobs/JobInputsRepository';

export type RestoredShare = Readonly<{
  id: string;
  issuanceId: string;
  lifecycle: 'ACTIVE' | 'SUPERSEDED' | 'REVOKED';
  openedAt: string | null;
  createdAt: string;
}>;

export type OperationalRestoreSnapshot = Readonly<{
  shares: readonly RestoredShare[];
  jobs: readonly Job[];
  costs: readonly JobCostEntry[];
  workEntries: readonly JobWorkEntry[];
  missingSnapshotIssuanceIds: readonly string[];
}>;

/** A complete owner-scoped remote read is applied atomically to SQLite. */
export interface OperationalRestoreRemoteRepository {
  getSnapshot(): Promise<OperationalRestoreSnapshot>;
}

export interface OperationalRestoreLocalRepository {
  replaceProjection(snapshot: OperationalRestoreSnapshot): Promise<void>;
}
