import { Job, JobCapability, JobRemoteRepository } from './JobRepository';

type JobRow = Record<string, unknown>;
export interface JobRpcClient {
  rpc(functionName: string, arguments_: Record<string, unknown>): Promise<Readonly<{ data: unknown; error: Readonly<{ message: string }> | null }>>;
}

function jobFrom(row: JobRow): Job {
  if (typeof row.job_id !== 'string' || typeof row.owner_user_id !== 'string'
    || typeof row.source_root_issuance_id !== 'string' || typeof row.source_issuance_id !== 'string'
    || typeof row.source_revision_number !== 'number' || !Number.isInteger(row.source_revision_number)
    || typeof row.client_name !== 'string' || typeof row.title !== 'string'
    || typeof row.quoted_amount_cents !== 'number' || !Number.isInteger(row.quoted_amount_cents)
    || row.currency !== 'EUR' || row.status !== 'OPEN' || typeof row.created_at !== 'string') {
    throw new Error('JOB_REMOTE_RESPONSE_INVALID');
  }
  return { id: row.job_id, ownerUserId: row.owner_user_id, sourceRootIssuanceId: row.source_root_issuance_id, sourceIssuanceId: row.source_issuance_id, sourceRevisionNumber: row.source_revision_number, clientName: row.client_name, title: row.title, quotedAmountCents: row.quoted_amount_cents, currency: 'EUR', status: 'OPEN', createdAt: row.created_at };
}

function capabilityFrom(value: unknown): JobCapability {
  const row = Array.isArray(value) ? value[0] as JobRow | undefined : undefined;
  if (!row || typeof row.capability !== 'string') throw new Error('JOB_REMOTE_RESPONSE_INVALID');
  if (row.capability === 'START') return { kind: 'START' };
  if (row.capability === 'OPEN') return { kind: 'OPEN', job: jobFrom(row) };
  if (row.capability === 'NONE' && (row.reason === 'NOT_ACCEPTED' || row.reason === 'HISTORICAL')) return { kind: 'NONE', reason: row.reason };
  if (row.capability === 'ERROR' && (row.reason === 'ISSUANCE_NOT_FOUND' || row.reason === 'INVALID_LINEAGE' || row.reason === 'SNAPSHOT_MISSING')) return { kind: 'ERROR', code: row.reason };
  throw new Error('JOB_REMOTE_RESPONSE_INVALID');
}

export class SupabaseJobRepository implements JobRemoteRepository {
  constructor(private readonly client: JobRpcClient) {}

  async resolveCapability(issuanceId: string): Promise<JobCapability> {
    const { data, error } = await this.client.rpc('resolve_job_capability', { p_issuance_id: issuanceId });
    if (error) throw new Error(error.message);
    return capabilityFrom(data);
  }

  async start(issuanceId: string): Promise<Job> {
    const { data, error } = await this.client.rpc('start_job', { p_issuance_id: issuanceId });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] as JobRow | undefined : undefined;
    if (!row) throw new Error('JOB_REMOTE_RESPONSE_INVALID');
    return jobFrom(row);
  }
}
