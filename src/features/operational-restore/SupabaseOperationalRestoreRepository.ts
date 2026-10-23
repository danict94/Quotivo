import { supabase } from '../../data/remote/supabaseClient';
import { Job, JobStatus } from '../jobs/JobRepository';
import { JobCostEntry, JobWorkEntry } from '../jobs/JobInputsRepository';
import { OperationalRestoreRemoteRepository, OperationalRestoreSnapshot, RestoredShare } from './OperationalRestoreContracts';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => { if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('OPERATIONAL_RESTORE_REMOTE_RESPONSE_INVALID'); return value as ObjectValue; };
const text = (value: unknown): string => { if (typeof value !== 'string' || value.length === 0) throw new Error('OPERATIONAL_RESTORE_REMOTE_RESPONSE_INVALID'); return value; };
const nullableText = (value: unknown): string | null => { if (value !== null && typeof value !== 'string') throw new Error('OPERATIONAL_RESTORE_REMOTE_RESPONSE_INVALID'); return value; };
const integer = (value: unknown, minimum = 0): number => { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error('OPERATIONAL_RESTORE_REMOTE_RESPONSE_INVALID'); return value; };
const jobStatus = (value: unknown): JobStatus => { if (value === 'ACTIVE' || value === 'PAUSED' || value === 'COMPLETED' || value === 'CANCELLED') return value; throw new Error('OPERATIONAL_RESTORE_REMOTE_RESPONSE_INVALID'); };

function job(value: unknown): Job {
  const row = object(value);
  if (row.currency !== 'EUR') throw new Error('OPERATIONAL_RESTORE_REMOTE_RESPONSE_INVALID');
  return { id:text(row.id), ownerUserId:text(row.ownerUserId), sourceRootIssuanceId:text(row.sourceRootIssuanceId), sourceIssuanceId:text(row.sourceIssuanceId), sourceRevisionNumber:integer(row.sourceRevisionNumber), clientName:text(row.clientName), title:text(row.title), quotedAmountCents:integer(row.quotedAmountCents), currency:'EUR', status:jobStatus(row.status), createdAt:text(row.createdAt), startedAt:text(row.startedAt), completedAt:nullableText(row.completedAt), cancelledAt:nullableText(row.cancelledAt), updatedAt:text(row.updatedAt) };
}
function cost(value: unknown): JobCostEntry {
  const row = object(value);
  if (!['MATERIALS','WORKER','SUBCONTRACTOR','FUEL','TOLLS_PARKING','RENTAL','DISPOSAL','EQUIPMENT','OTHER'].includes(String(row.category))) throw new Error('OPERATIONAL_RESTORE_REMOTE_RESPONSE_INVALID');
  return { id:text(row.id), ownerUserId:text(row.ownerUserId), jobId:text(row.jobId), requestKey:text(row.requestKey), category:row.category as JobCostEntry['category'], description:text(row.description), amountCents:integer(row.amountCents), occurredAt:text(row.occurredAt), workerLabel:nullableText(row.workerLabel), createdAt:text(row.createdAt), updatedAt:text(row.updatedAt) };
}
function work(value: unknown): JobWorkEntry {
  const row = object(value);
  if (row.role !== 'OWNER' && row.role !== 'WORKER' && row.role !== 'COLLABORATOR') throw new Error('OPERATIONAL_RESTORE_REMOTE_RESPONSE_INVALID');
  const costCents = row.costCents === null ? null : integer(row.costCents);
  return { id:text(row.id), ownerUserId:text(row.ownerUserId), jobId:text(row.jobId), requestKey:text(row.requestKey), personLabel:text(row.personLabel), role:row.role, workDate:text(row.workDate), durationMinutes:integer(row.durationMinutes, 1), costCents, note:nullableText(row.note), createdAt:text(row.createdAt), updatedAt:text(row.updatedAt) };
}
function share(value: unknown): RestoredShare {
  const row = object(value);
  if (row.lifecycle !== 'ACTIVE' && row.lifecycle !== 'SUPERSEDED' && row.lifecycle !== 'REVOKED') throw new Error('OPERATIONAL_RESTORE_REMOTE_RESPONSE_INVALID');
  return { id:text(row.id), issuanceId:text(row.issuanceId), lifecycle:row.lifecycle, openedAt:nullableText(row.openedAt), createdAt:text(row.createdAt) };
}

export class SupabaseOperationalRestoreRepository implements OperationalRestoreRemoteRepository {
  async getSnapshot(): Promise<OperationalRestoreSnapshot> {
    const { data, error } = await supabase.rpc('get_operational_restore_snapshot');
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error('OPERATIONAL_RESTORE_REMOTE_RESPONSE_INVALID');
    const result: { shares: RestoredShare[]; jobs: Job[]; costs: JobCostEntry[]; workEntries: JobWorkEntry[]; missingSnapshotIssuanceIds: string[] } = { shares:[], jobs:[], costs:[], workEntries:[], missingSnapshotIssuanceIds:[] };
    for (const raw of data) {
      const record = object(raw); const kind = text(record.kind); const payload = object(record.payload);
      if (kind === 'SHARE') result.shares.push(share(payload));
      else if (kind === 'JOB') result.jobs.push(job(payload));
      else if (kind === 'JOB_COST') result.costs.push(cost(payload));
      else if (kind === 'JOB_WORK') result.workEntries.push(work(payload));
      else if (kind === 'ISSUANCE_MISSING_SNAPSHOT') result.missingSnapshotIssuanceIds.push(text(payload.issuanceId));
      else throw new Error('OPERATIONAL_RESTORE_REMOTE_RESPONSE_INVALID');
    }
    const jobIds = new Set(result.jobs.map((value) => value.id));
    if (result.costs.some((value) => !jobIds.has(value.jobId)) || result.workEntries.some((value) => !jobIds.has(value.jobId))) throw new Error('OPERATIONAL_RESTORE_REMOTE_RESPONSE_INVALID');
    return result;
  }
}
