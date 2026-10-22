import { loadCachedJobBySourceRootIssuanceId, loadIssuedSnapshot, loadQuoteReferenceByIssuanceId, loadQuoteShareLinkCache, saveCachedJob, saveQuoteShareLinkCache } from '../../database';
import { Quote } from '../../domain';
import { recoverIssuanceSnapshot } from '../quote-issuance/finalizeIssuanceSnapshotLifecycle';
import { IssuanceSnapshotRepository } from '../quote-issuance/IssuanceSnapshotRepository';
import { Job, JobCacheRepository } from './JobRepository';
import type { JobIssuanceSnapshotRecovery } from './jobAuthorityUseCase';

export type JobIssuanceContext = Readonly<{ issuanceId: string; sourceRootIssuanceId: string }>;

/** SQLite adapter: remote responses are the only allowed source for cached Jobs. */
export class LocalJobCacheRepository implements JobCacheRepository {
  async getBySourceRootIssuanceId(sourceRootIssuanceId: string): Promise<Job | null> {
    return loadCachedJobBySourceRootIssuanceId(sourceRootIssuanceId);
  }

  async save(job: Job): Promise<void> { await saveCachedJob(job); }
}

/** Maps a local issued quote to the canonical remote issuance IDs cached at emission. */
export class LocalJobIssuanceContextRepository {
  async resolve(quote: Pick<Quote, 'id' | 'status' | 'revisionNumber' | 'revisionRootQuoteId'>): Promise<JobIssuanceContext | null> {
    if (quote.status !== 'issued') return null;
    const rootQuoteId = quote.revisionNumber === 0 ? quote.id : quote.revisionRootQuoteId;
    if (!rootQuoteId) return null;
    const [source, root] = await Promise.all([loadQuoteShareLinkCache(quote.id), loadQuoteShareLinkCache(rootQuoteId)]);
    if (!source?.issuanceId || !root?.issuanceId) return null;
    return { issuanceId: source.issuanceId, sourceRootIssuanceId: root.issuanceId };
  }

  async quoteReferenceFor(job: Job): Promise<{ number: number; year: number } | null> {
    return loadQuoteReferenceByIssuanceId(job.sourceIssuanceId);
  }
}

/** Uses only the existing immutable local snapshot for explicit historical recovery. */
export class LocalJobIssuanceSnapshotRecovery implements JobIssuanceSnapshotRecovery {
  constructor(private readonly repository: IssuanceSnapshotRepository) {}

  async recover(input: Readonly<{ quoteId: string; issuanceId: string }>): Promise<void> {
    const cache = await loadQuoteShareLinkCache(input.quoteId);
    if (!cache?.issuanceId || cache.issuanceId !== input.issuanceId) throw new Error('JOB_ISSUANCE_CONTEXT_UNAVAILABLE');
    const snapshot = await loadIssuedSnapshot(input.quoteId);
    await recoverIssuanceSnapshot(this.repository, { issuanceId: input.issuanceId, snapshot });
    await saveQuoteShareLinkCache({ ...cache, issuanceSnapshotSyncState: 'SYNCED', shareSyncedAt: new Date().toISOString() });
  }
}
