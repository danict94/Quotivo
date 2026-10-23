import * as SQLite from 'expo-sqlite';
import { OperationalRestoreLocalRepository, OperationalRestoreSnapshot } from './OperationalRestoreContracts';

/** SQLite cache replacement happens only after the complete remote snapshot parses. */
export class SQLiteOperationalRestoreRepository implements OperationalRestoreLocalRepository {
  constructor(private readonly database: () => Promise<SQLite.SQLiteDatabase>) {}

  async replaceProjection(snapshot: OperationalRestoreSnapshot): Promise<void> {
    const db = await this.database();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('DELETE FROM job_cost_entries');
      await tx.runAsync('DELETE FROM job_work_entries');
      await tx.runAsync('DELETE FROM jobs');
      await tx.runAsync('DELETE FROM quote_share_restore_cache');
      await tx.runAsync('DELETE FROM operational_restore_issues');
      await tx.runAsync('UPDATE quote_share_links SET share_id=NULL, share_lifecycle_cache=NULL, opened_at_cache=NULL, share_synced_at=NULL');
      for (const job of snapshot.jobs) await tx.runAsync('INSERT INTO jobs(id,owner_user_id,source_root_issuance_id,source_issuance_id,source_revision_number,client_name,title,quoted_amount_cents,currency,status,created_at,started_at,completed_at,cancelled_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', job.id, job.ownerUserId, job.sourceRootIssuanceId, job.sourceIssuanceId, job.sourceRevisionNumber, job.clientName, job.title, job.quotedAmountCents, job.currency, job.status, job.createdAt, job.startedAt, job.completedAt, job.cancelledAt, job.updatedAt);
      for (const entry of snapshot.costs) await tx.runAsync('INSERT INTO job_cost_entries(id,owner_user_id,job_id,request_key,category,description,amount_cents,occurred_at,worker_label,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', entry.id, entry.ownerUserId, entry.jobId, entry.requestKey, entry.category, entry.description, entry.amountCents, entry.occurredAt, entry.workerLabel, entry.createdAt, entry.updatedAt);
      for (const entry of snapshot.workEntries) await tx.runAsync('INSERT INTO job_work_entries(id,owner_user_id,job_id,request_key,person_label,role,work_date,duration_minutes,cost_cents,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', entry.id, entry.ownerUserId, entry.jobId, entry.requestKey, entry.personLabel, entry.role, entry.workDate, entry.durationMinutes, entry.costCents, entry.note, entry.createdAt, entry.updatedAt);
      const currentIssuanceIds = new Set<string>();
      for (const share of snapshot.shares) {
        await tx.runAsync('INSERT INTO quote_share_restore_cache(share_id,issuance_id,lifecycle,opened_at,created_at) VALUES(?,?,?,?,?)', share.id, share.issuanceId, share.lifecycle, share.openedAt, share.createdAt);
        if (currentIssuanceIds.has(share.issuanceId)) continue;
        currentIssuanceIds.add(share.issuanceId);
        await tx.runAsync('UPDATE quote_share_links SET share_id=?,share_lifecycle_cache=?,opened_at_cache=?,share_synced_at=? WHERE issuance_id=?', share.id, share.lifecycle, share.openedAt, share.createdAt, share.issuanceId);
      }
      for (const issuanceId of snapshot.missingSnapshotIssuanceIds) await tx.runAsync('INSERT INTO operational_restore_issues(kind,issuance_id,detected_at) VALUES(?,?,?)', 'ISSUANCE_MISSING_SNAPSHOT', issuanceId, new Date().toISOString());
    });
  }
}
