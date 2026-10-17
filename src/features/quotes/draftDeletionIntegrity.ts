export class DraftDeletionIntegrityError extends Error {
  readonly code = 'INTEGRITY_DRAFT_HAS_ISSUED_ARTIFACTS';

  constructor(readonly diagnostic: {
    quoteId: string;
    status: string;
    number: number | null;
    numberYear: number | null;
    snapshotCount: number;
    documentExportCount: number;
    localIssuanceId: string | null;
    revisionRootQuoteId: string | null;
    parentQuoteId: string | null;
    revisionNumber: number;
    snapshotIssuedAt: string | null;
    snapshotNumber: number | null;
    snapshotNumberYear: number | null;
    documentExportStatus: string | null;
  }) {
    super(`INTEGRITY_DRAFT_HAS_ISSUED_ARTIFACTS: snapshot=${diagnostic.snapshotCount}, export=${diagnostic.documentExportCount}`);
    this.name = 'DraftDeletionIntegrityError';
  }
}

export type DraftDeletionReader = {
  getFirstAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T | null>;
};

export async function assertDraftDeletable(db: DraftDeletionReader, id: string) {
  const quote = await db.getFirstAsync<{
    status: string; number: number | null; number_year: number | null; revision_root_quote_id: string | null; parent_quote_id: string | null; revision_number: number;
  }>('SELECT status, number, number_year, revision_root_quote_id, parent_quote_id, revision_number FROM quotes WHERE id = ?', id);
  if (!quote || quote.status !== 'draft') return;

  const snapshot = await db.getFirstAsync<{ count: number; snapshot_json: string | null }>('SELECT COUNT(*) AS count, MAX(snapshot_json) AS snapshot_json FROM issued_quote_snapshots WHERE quote_id = ?', id);
  const documentExport = await db.getFirstAsync<{ count: number; status: string | null }>('SELECT COUNT(*) AS count, MAX(status) AS status FROM document_exports WHERE quote_id = ?', id);
  const share = await db.getFirstAsync<{ issuance_id: string | null }>('SELECT issuance_id FROM quote_share_links WHERE quote_id = ?', id);
  const snapshotCount = snapshot?.count ?? 0;
  const documentExportCount = documentExport?.count ?? 0;
  if (snapshotCount || documentExportCount) {
    let snapshotIssuedAt: string | null = null;
    let snapshotNumber: number | null = null;
    let snapshotNumberYear: number | null = null;
    try {
      const value = snapshot?.snapshot_json ? JSON.parse(snapshot.snapshot_json) as { issuedAt?: unknown; number?: unknown; numberYear?: unknown } : null;
      snapshotIssuedAt = typeof value?.issuedAt === 'string' ? value.issuedAt : null;
      snapshotNumber = typeof value?.number === 'number' ? value.number : null;
      snapshotNumberYear = typeof value?.numberYear === 'number' ? value.numberYear : null;
    } catch { /* the guard reports the artifact count even if historic JSON is unreadable */ }
    throw new DraftDeletionIntegrityError({
      quoteId: id, status: quote.status, number: quote.number, numberYear: quote.number_year, snapshotCount, documentExportCount,
      localIssuanceId: share?.issuance_id ?? null,
      revisionRootQuoteId: quote.revision_root_quote_id, parentQuoteId: quote.parent_quote_id,
      revisionNumber: quote.revision_number, snapshotIssuedAt, snapshotNumber, snapshotNumberYear,
      documentExportStatus: documentExport?.status ?? null,
    });
  }
}
