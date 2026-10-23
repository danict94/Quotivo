import { QuoteDurabilityLocalRepository, QuoteDurabilityRemoteRepository } from './QuoteDurabilityContracts';

export type QuoteDurabilitySyncSummary = Readonly<{ applied: number; conflicts: number }>;

/**
 * Ordered restore is intentional: immutable issued snapshots establish revision
 * ancestors before a terminal revision draft is inserted into SQLite.
 */
export class QuoteDurabilitySyncService {
  constructor(private readonly local: QuoteDurabilityLocalRepository, private readonly remote: QuoteDurabilityRemoteRepository) {}

  async sync(): Promise<QuoteDurabilitySyncSummary> {
    let applied = 0;
    let conflicts = 0;
    const records = await this.remote.listRestoreRecords();
    const issued = records.filter((entry): entry is Extract<typeof entry, { kind: 'ISSUED' }> => entry.kind === 'ISSUED')
      .sort((left, right) => Number(left.record.snapshot.revisionNumber) - Number(right.record.snapshot.revisionNumber));
    for (const value of issued) {
      if (value.kind === 'ISSUED') await this.local.applyIssued(value.record);
    }
    for (const value of records.filter((entry) => entry.kind === 'DRAFT')) {
      if (value.kind === 'DRAFT') await this.local.applyDraft(value.record);
    }
    await this.local.prepareLegacyUpload();
    for (const operation of await this.local.listPending()) {
      const result = await this.remote.syncDraft(operation);
      if (result.kind === 'CONFLICT') {
        await this.local.markConflict(operation, result.record);
        conflicts += 1;
      } else {
        await this.local.markApplied(operation.operationId, result.record);
        applied += 1;
      }
    }
    return { applied, conflicts };
  }
}
