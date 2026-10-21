import { Job, JobCacheRepository, JobCapability, JobRemoteRepository } from './JobRepository';

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

export type StartJobResult = Readonly<{ kind: 'COMPLETE'; job: Job }> | Readonly<{ kind: 'PENDING_CACHE_RECOVERY'; job: Job; cause: unknown }>;

/** Remote authority is always called first; a retry recovers the same idempotent Job into SQLite. */
export async function startJob(input: Readonly<{ remote: JobRemoteRepository; cache: JobCacheRepository; issuanceId: string }>): Promise<StartJobResult> {
  const job = await input.remote.start(input.issuanceId);
  try {
    await input.cache.save(job);
    return { kind: 'COMPLETE', job };
  } catch (cause) {
    return { kind: 'PENDING_CACHE_RECOVERY', job, cause };
  }
}
