import { Job, JobCacheRepository } from './JobRepository';

type Database = {
  getFirstAsync<T>(sql: string, ...params: string[]): Promise<T | null>;
  runAsync(sql: string, ...params: (string | number)[]): Promise<unknown>;
};

type Row = {
  id: string; owner_user_id: string; source_root_issuance_id: string; source_issuance_id: string;
  source_revision_number: number; client_name: string; title: string; quoted_amount_cents: number;
  currency: 'EUR'; status: 'OPEN'; created_at: string;
};

function map(row: Row): Job {
  return { id: row.id, ownerUserId: row.owner_user_id, sourceRootIssuanceId: row.source_root_issuance_id, sourceIssuanceId: row.source_issuance_id, sourceRevisionNumber: row.source_revision_number, clientName: row.client_name, title: row.title, quotedAmountCents: row.quoted_amount_cents, currency: 'EUR', status: 'OPEN', createdAt: row.created_at };
}

/** Local projection only: every write originates from a validated remote Job response. */
export class SQLiteJobCacheRepository implements JobCacheRepository {
  constructor(private readonly db: Database) {}

  async getBySourceRootIssuanceId(sourceRootIssuanceId: string): Promise<Job | null> {
    const row = await this.db.getFirstAsync<Row>('SELECT id, owner_user_id, source_root_issuance_id, source_issuance_id, source_revision_number, client_name, title, quoted_amount_cents, currency, status, created_at FROM jobs WHERE source_root_issuance_id = ?', sourceRootIssuanceId);
    return row ? map(row) : null;
  }

  async save(job: Job): Promise<void> {
    await this.db.runAsync('INSERT INTO jobs (id, owner_user_id, source_root_issuance_id, source_issuance_id, source_revision_number, client_name, title, quoted_amount_cents, currency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET owner_user_id=excluded.owner_user_id, source_root_issuance_id=excluded.source_root_issuance_id, source_issuance_id=excluded.source_issuance_id, source_revision_number=excluded.source_revision_number, client_name=excluded.client_name, title=excluded.title, quoted_amount_cents=excluded.quoted_amount_cents, currency=excluded.currency, status=excluded.status, created_at=excluded.created_at', job.id, job.ownerUserId, job.sourceRootIssuanceId, job.sourceIssuanceId, job.sourceRevisionNumber, job.clientName, job.title, job.quotedAmountCents, job.currency, job.status, job.createdAt);
  }
}
