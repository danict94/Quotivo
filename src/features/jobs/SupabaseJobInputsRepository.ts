import { JobCostCategory, JobCostDraft, JobCostEntry, JobInputs, JobInputsRemoteRepository, JobWorkDraft, JobWorkEntry, JobWorkRole } from './JobInputsRepository';

type Row = Record<string, unknown>;
export interface JobInputsRpcClient { rpc(name: string, args: Record<string, unknown>): Promise<Readonly<{ data: unknown; error: Readonly<{ message: string }> | null }>>; }
const categories = new Set<JobCostCategory>(['MATERIALS', 'WORKER', 'SUBCONTRACTOR', 'FUEL', 'TOLLS_PARKING', 'RENTAL', 'DISPOSAL', 'EQUIPMENT', 'OTHER']);
const roles = new Set<JobWorkRole>(['OWNER', 'WORKER', 'COLLABORATOR']);
const rows = (value: unknown) => Array.isArray(value) ? value as Row[] : [];
function cost(row: Row): JobCostEntry {
  if (typeof row.id !== 'string' || typeof row.owner_user_id !== 'string' || typeof row.job_id !== 'string' || typeof row.request_key !== 'string' || !categories.has(row.category as JobCostCategory) || typeof row.description !== 'string' || typeof row.amount_cents !== 'number' || typeof row.occurred_at !== 'string' || (row.worker_label !== null && typeof row.worker_label !== 'string') || typeof row.created_at !== 'string' || typeof row.updated_at !== 'string') throw new Error('JOB_COST_REMOTE_RESPONSE_INVALID');
  return { id: row.id, ownerUserId: row.owner_user_id, jobId: row.job_id, requestKey: row.request_key, category: row.category as JobCostCategory, description: row.description, amountCents: row.amount_cents, occurredAt: row.occurred_at, workerLabel: row.worker_label as string | null, createdAt: row.created_at, updatedAt: row.updated_at };
}
function work(row: Row): JobWorkEntry {
  if (typeof row.id !== 'string' || typeof row.owner_user_id !== 'string' || typeof row.job_id !== 'string' || typeof row.request_key !== 'string' || typeof row.person_label !== 'string' || !roles.has(row.role as JobWorkRole) || typeof row.work_date !== 'string' || typeof row.duration_minutes !== 'number' || (row.cost_cents !== null && typeof row.cost_cents !== 'number') || (row.note !== null && typeof row.note !== 'string') || typeof row.created_at !== 'string' || typeof row.updated_at !== 'string') throw new Error('JOB_WORK_REMOTE_RESPONSE_INVALID');
  return { id: row.id, ownerUserId: row.owner_user_id, jobId: row.job_id, requestKey: row.request_key, personLabel: row.person_label, role: row.role as JobWorkRole, workDate: row.work_date, durationMinutes: row.duration_minutes, costCents: row.cost_cents as number | null, note: row.note as string | null, createdAt: row.created_at, updatedAt: row.updated_at };
}
function first(value: unknown): Row { const row = rows(value)[0]; if (!row) throw new Error('JOB_INPUT_REMOTE_RESPONSE_INVALID'); return row; }

export class SupabaseJobInputsRepository implements JobInputsRemoteRepository {
  constructor(private readonly client: JobInputsRpcClient) {}
  private async call(name: string, args: Record<string, unknown>) { const result = await this.client.rpc(name, args); if (result.error) throw new Error(result.error.message); return result.data; }
  async list(jobId: string): Promise<JobInputs> {
    const [costs, workEntries] = await Promise.all([this.call('list_job_cost_entries', { p_job_id: jobId }), this.call('list_job_work_entries', { p_job_id: jobId })]);
    return { costs: rows(costs).map(cost), workEntries: rows(workEntries).map(work) };
  }
  async createCost(jobId: string, draft: JobCostDraft) { return cost(first(await this.call('create_job_cost_entry', { p_job_id: jobId, p_request_key: draft.requestKey, p_category: draft.category, p_description: draft.description, p_amount_cents: draft.amountCents, p_occurred_at: draft.occurredAt, p_worker_label: draft.workerLabel }))); }
  async updateCost(entryId: string, draft: Omit<JobCostDraft, 'requestKey'>) { return cost(first(await this.call('update_job_cost_entry', { p_entry_id: entryId, p_category: draft.category, p_description: draft.description, p_amount_cents: draft.amountCents, p_occurred_at: draft.occurredAt, p_worker_label: draft.workerLabel }))); }
  async deleteCost(entryId: string) { await this.call('delete_job_cost_entry', { p_entry_id: entryId }); }
  async createWork(jobId: string, draft: JobWorkDraft) { return work(first(await this.call('create_job_work_entry', { p_job_id: jobId, p_request_key: draft.requestKey, p_person_label: draft.personLabel, p_role: draft.role, p_work_date: draft.workDate, p_duration_minutes: draft.durationMinutes, p_cost_cents: draft.costCents, p_note: draft.note }))); }
  async updateWork(entryId: string, draft: Omit<JobWorkDraft, 'requestKey'>) { return work(first(await this.call('update_job_work_entry', { p_entry_id: entryId, p_person_label: draft.personLabel, p_role: draft.role, p_work_date: draft.workDate, p_duration_minutes: draft.durationMinutes, p_cost_cents: draft.costCents, p_note: draft.note }))); }
  async deleteWork(entryId: string) { await this.call('delete_job_work_entry', { p_entry_id: entryId }); }
}
