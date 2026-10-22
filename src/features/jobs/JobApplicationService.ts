import { listCachedJobs } from '../../database';
import { formatQuoteNumber } from '../../emissionClock';
import { Quote } from '../../domain';
import { Job, JobCapability, JobRemoteRepository, JobStatusTransition } from './JobRepository';
import { LocalJobCacheRepository, LocalJobIssuanceContextRepository } from './LocalJobRepositories';
import { JobIssuanceSnapshotRecovery, recoverJobIssuanceSnapshot, resolveJobCapability, StartJobResult, StartJobUseCase, TransitionJobStatusResult, TransitionJobStatusUseCase } from './jobAuthorityUseCase';

export type JobListItem = Readonly<{ job: Job; sourceReference: string }>;

/** Application boundary used by mobile UI. It owns the remote/local recovery protocol. */
export class JobApplicationService {
  constructor(
    private readonly remote: JobRemoteRepository,
    private readonly cache = new LocalJobCacheRepository(),
    private readonly issuanceContext = new LocalJobIssuanceContextRepository(),
    private readonly snapshotRecovery?: JobIssuanceSnapshotRecovery,
  ) {}

  async resolveForQuote(quote: Quote): Promise<JobCapability> {
    const context = await this.issuanceContext.resolve(quote);
    if (!context) return { kind: 'ERROR', code: 'ISSUANCE_NOT_FOUND' };
    return resolveJobCapability({ remote: this.remote, cache: this.cache, issuanceId: context.issuanceId, sourceRootIssuanceId: context.sourceRootIssuanceId });
  }

  /** StartJobUseCase: always calls remote authority before updating the local projection. */
  async startForQuote(quote: Quote): Promise<StartJobResult> {
    const context = await this.issuanceContext.resolve(quote);
    if (!context) throw new Error('JOB_ISSUANCE_CONTEXT_UNAVAILABLE');
    return StartJobUseCase({ remote: this.remote, cache: this.cache, issuanceId: context.issuanceId });
  }

  /** Explicit recovery for an historical issuance missing its remote canonical snapshot. */
  async recoverSnapshotForQuote(quote: Quote): Promise<void> {
    const context = await this.issuanceContext.resolve(quote);
    await recoverJobIssuanceSnapshot({ quoteId: quote.id, issuanceId: context?.issuanceId ?? null, recovery: this.snapshotRecovery });
  }

  async transitionStatus(job: Job, targetStatus: JobStatusTransition): Promise<TransitionJobStatusResult> {
    return TransitionJobStatusUseCase({ remote: this.remote, cache: this.cache, jobId: job.id, targetStatus });
  }

  async list(): Promise<readonly JobListItem[]> {
    const jobs = await listCachedJobs();
    return Promise.all(jobs.map(async (job) => {
      const reference = await this.issuanceContext.quoteReferenceFor(job);
      return { job, sourceReference: reference ? `${formatQuoteNumber(reference.number, reference.year)} · Rev.${job.sourceRevisionNumber}` : `Preventivo di origine · Rev.${job.sourceRevisionNumber}` };
    }));
  }

  async describe(job: Job): Promise<JobListItem> {
    const reference = await this.issuanceContext.quoteReferenceFor(job);
    return { job, sourceReference: reference ? `${formatQuoteNumber(reference.number, reference.year)} · Rev.${job.sourceRevisionNumber}` : `Preventivo di origine · Rev.${job.sourceRevisionNumber}` };
  }
}
