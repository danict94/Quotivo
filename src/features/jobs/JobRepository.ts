export type Job = Readonly<{
  id: string;
  ownerUserId: string;
  sourceRootIssuanceId: string;
  sourceIssuanceId: string;
  sourceRevisionNumber: number;
  clientName: string;
  title: string;
  quotedAmountCents: number;
  currency: 'EUR';
  status: 'OPEN';
  createdAt: string;
}>;

export type JobCapability =
  | Readonly<{ kind: 'START' }>
  | Readonly<{ kind: 'OPEN'; job: Job }>
  | Readonly<{ kind: 'NONE'; reason: 'NOT_ACCEPTED' | 'HISTORICAL' }>
  | Readonly<{ kind: 'ERROR'; code: 'ISSUANCE_NOT_FOUND' | 'INVALID_LINEAGE' | 'SNAPSHOT_MISSING' | 'REMOTE_ERROR' | 'OFFLINE' }>;

export interface JobRemoteRepository {
  resolveCapability(issuanceId: string): Promise<JobCapability>;
  start(issuanceId: string): Promise<Job>;
}

export interface JobCacheRepository {
  getBySourceRootIssuanceId(sourceRootIssuanceId: string): Promise<Job | null>;
  save(job: Job): Promise<void>;
}
