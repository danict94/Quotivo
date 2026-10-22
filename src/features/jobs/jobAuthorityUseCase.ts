import { Job, JobCacheRepository, JobCapability, JobRemoteRepository, JobStatusTransition } from './JobRepository';

export interface JobIssuanceSnapshotRecovery {
  recover(input: Readonly<{ quoteId: string; issuanceId: string }>): Promise<void>;
}
export async function resolveJobCapability(input: Readonly<{
  remote: JobRemoteRepository;
  cache: JobCacheRepository;
  issuanceId: string;
  sourceRootIssuanceId: string | null;
}>): Promise<JobCapability> {
  try {
    const capability = await input.remote.resolveCapability(input.issuanceId);
    if (capability.kind === 'OPEN') await input.cache.save(capability.job);
    return capability;
  } catch {
    if (!input.sourceRootIssuanceId) return { kind: 'ERROR', code: 'OFFLINE' };
    const cached = await input.cache.getBySourceRootIssuanceId(input.sourceRootIssuanceId);
    return cached ? { kind: 'OPEN', job: cached } : { kind: 'ERROR', code: 'OFFLINE' };
  }
}

/** Pure guard around explicit recovery of an existing immutable issuance snapshot. */
export async function recoverJobIssuanceSnapshot(input: Readonly<{
  quoteId: string;
  issuanceId: string | null;
  recovery?: JobIssuanceSnapshotRecovery;
}>): Promise<void> {
  if (!input.issuanceId || !input.recovery) throw new Error('JOB_ISSUANCE_CONTEXT_UNAVAILABLE');
  await input.recovery.recover({ quoteId: input.quoteId, issuanceId: input.issuanceId });
}

export type StartJobResult = Readonly<{ kind: 'COMPLETE'; job: Job }> | Readonly<{ kind: 'PENDING_CACHE_RECOVERY'; job: Job; cause: unknown }>;

/** Remote authority is always called first; a retry recovers the same idempotent Job into SQLite. */
export async function StartJobUseCase(input: Readonly<{ remote: JobRemoteRepository; cache: JobCacheRepository; issuanceId: string }>): Promise<StartJobResult> {
  const job = await input.remote.start(input.issuanceId);
  try {
    await input.cache.save(job);
    return { kind: 'COMPLETE', job };
  } catch (cause) {
    return { kind: 'PENDING_CACHE_RECOVERY', job, cause };
  }
}

export type TransitionJobStatusResult = Readonly<{ kind: 'COMPLETE'; job: Job }> | Readonly<{ kind: 'PENDING_CACHE_RECOVERY'; job: Job; cause: unknown }>;

/** Remote transition first; exact retry is idempotent and repairs only the local projection. */
export async function TransitionJobStatusUseCase(input: Readonly<{ remote: JobRemoteRepository; cache: JobCacheRepository; jobId: string; targetStatus: JobStatusTransition }>): Promise<TransitionJobStatusResult> {
  const job = await input.remote.transitionStatus(input.jobId, input.targetStatus);
  try {
    await input.cache.save(job);
    return { kind: 'COMPLETE', job };
  } catch (cause) {
    return { kind: 'PENDING_CACHE_RECOVERY', job, cause };
  }
}
