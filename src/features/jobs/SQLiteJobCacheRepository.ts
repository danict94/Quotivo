import { Job, JobCacheRepository, JobProjectionRepository, JobStatus } from './JobRepository';
import { SQLiteQueryDatabase } from '../../data/local/SQLiteQueryDatabase';

type Database = SQLiteQueryDatabase & {
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>;
};

type Row = {
  id: string; owner_user_id: string; source_root_issuance_id: string; source_issuance_id: string;
  source_revision_number: number; client_name: string; title: string; quoted_amount_cents: number;
  currency: 'EUR'; status: JobStatus; created_at: string; started_at: string;
  completed_at: string | null; cancelled_at: string | null; updated_at: string;
};

function map(row: Row): Job {
  return { id: row.id, ownerUserId: row.owner_user_id, sourceRootIssuanceId: row.source_root_issuance_id, sourceIssuanceId: row.source_issuance_id, sourceRevisionNumber: row.source_revision_number, clientName: row.client_name, title: row.title, quotedAmountCents: row.quoted_amount_cents, currency: 'EUR', status: row.status, createdAt: row.created_at, startedAt: row.started_at, completedAt: row.completed_at, cancelledAt: row.cancelled_at, updatedAt: row.updated_at };
}

/** Local projection only: every write originates from a validated remote Job response. */
export class SQLiteJobCacheRepository implements JobCacheRepository, JobProjectionRepository {
  constructor(private readonly db: Database) {}

  async getBySourceRootIssuanceId(sourceRootIssuanceId: string): Promise<Job | null> {
    const row = await this.db.getFirstAsync<Row>('SELECT id, owner_user_id, source_root_issuance_id, source_issuance_id, source_revision_number, client_name, title, quoted_amount_cents, currency, status, created_at, started_at, completed_at, cancelled_at, updated_at FROM jobs WHERE source_root_issuance_id = ?', sourceRootIssuanceId);
    return row ? map(row) : null;
  }

  async save(job: Job): Promise<void> {
    await this.db.runAsync('INSERT INTO jobs (id, owner_user_id, source_root_issuance_id, source_issuance_id, source_revision_number, client_name, title, quoted_amount_cents, currency, status, created_at, started_at, completed_at, cancelled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET owner_user_id=excluded.owner_user_id, source_root_issuance_id=excluded.source_root_issuance_id, source_issuance_id=excluded.source_issuance_id, source_revision_number=excluded.source_revision_number, client_name=excluded.client_name, title=excluded.title, quoted_amount_cents=excluded.quoted_amount_cents, currency=excluded.currency, status=excluded.status, created_at=excluded.created_at, started_at=excluded.started_at, completed_at=excluded.completed_at, cancelled_at=excluded.cancelled_at, updated_at=excluded.updated_at', job.id, job.ownerUserId, job.sourceRootIssuanceId, job.sourceIssuanceId, job.sourceRevisionNumber, job.clientName, job.title, job.quotedAmountCents, job.currency, job.status, job.createdAt, job.startedAt, job.completedAt, job.cancelledAt, job.updatedAt);
  }

  async list(): Promise<readonly Job[]> {
    const rows = await this.db.getAllAsync<Row>('SELECT id, owner_user_id, source_root_issuance_id, source_issuance_id, source_revision_number, client_name, title, quoted_amount_cents, currency, status, created_at, started_at, completed_at, cancelled_at, updated_at FROM jobs ORDER BY created_at DESC');
    return rows.map(map);
  }
}
