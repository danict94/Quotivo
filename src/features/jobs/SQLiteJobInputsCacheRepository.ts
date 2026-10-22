import { JobCostEntry, JobInputs, JobInputsCacheRepository, JobWorkEntry } from './JobInputsRepository';

type Database = { getAllAsync<T>(sql: string, ...params: string[]): Promise<T[]>; runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>; };
type CostRow = { id: string; owner_user_id: string; job_id: string; request_key: string; category: JobCostEntry['category']; description: string; amount_cents: number; occurred_at: string; worker_label: string | null; created_at: string; updated_at: string; };
type WorkRow = { id: string; owner_user_id: string; job_id: string; request_key: string; person_label: string; role: JobWorkEntry['role']; work_date: string; duration_minutes: number; cost_cents: number | null; note: string | null; created_at: string; updated_at: string; };
const cost = (row: CostRow): JobCostEntry => ({ id: row.id, ownerUserId: row.owner_user_id, jobId: row.job_id, requestKey: row.request_key, category: row.category, description: row.description, amountCents: row.amount_cents, occurredAt: row.occurred_at, workerLabel: row.worker_label, createdAt: row.created_at, updatedAt: row.updated_at });
const work = (row: WorkRow): JobWorkEntry => ({ id: row.id, ownerUserId: row.owner_user_id, jobId: row.job_id, requestKey: row.request_key, personLabel: row.person_label, role: row.role, workDate: row.work_date, durationMinutes: row.duration_minutes, costCents: row.cost_cents, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at });

/** SQLite is an offline read projection; only validated remote responses may enter it. */
export class SQLiteJobInputsCacheRepository implements JobInputsCacheRepository {
  constructor(private readonly db: Database) {}
  async list(jobId: string): Promise<JobInputs> {
    const [costs, workEntries] = await Promise.all([
      this.db.getAllAsync<CostRow>('SELECT * FROM job_cost_entries WHERE job_id = ? ORDER BY occurred_at DESC, created_at DESC', jobId),
      this.db.getAllAsync<WorkRow>('SELECT * FROM job_work_entries WHERE job_id = ? ORDER BY work_date DESC, created_at DESC', jobId),
    ]);
    return { costs: costs.map(cost), workEntries: workEntries.map(work) };
  }
  async saveCost(entry: JobCostEntry): Promise<void> { await this.db.runAsync('INSERT INTO job_cost_entries (id, owner_user_id, job_id, request_key, category, description, amount_cents, occurred_at, worker_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET category=excluded.category, description=excluded.description, amount_cents=excluded.amount_cents, occurred_at=excluded.occurred_at, worker_label=excluded.worker_label, updated_at=excluded.updated_at', entry.id, entry.ownerUserId, entry.jobId, entry.requestKey, entry.category, entry.description, entry.amountCents, entry.occurredAt, entry.workerLabel, entry.createdAt, entry.updatedAt); }
  async removeCost(entryId: string): Promise<void> { await this.db.runAsync('DELETE FROM job_cost_entries WHERE id = ?', entryId); }
  async saveWork(entry: JobWorkEntry): Promise<void> { await this.db.runAsync('INSERT INTO job_work_entries (id, owner_user_id, job_id, request_key, person_label, role, work_date, duration_minutes, cost_cents, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET person_label=excluded.person_label, role=excluded.role, work_date=excluded.work_date, duration_minutes=excluded.duration_minutes, cost_cents=excluded.cost_cents, note=excluded.note, updated_at=excluded.updated_at', entry.id, entry.ownerUserId, entry.jobId, entry.requestKey, entry.personLabel, entry.role, entry.workDate, entry.durationMinutes, entry.costCents, entry.note, entry.createdAt, entry.updatedAt); }
  async removeWork(entryId: string): Promise<void> { await this.db.runAsync('DELETE FROM job_work_entries WHERE id = ?', entryId); }
}
