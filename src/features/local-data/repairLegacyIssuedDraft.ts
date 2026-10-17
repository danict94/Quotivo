type SqlValue = string | number | null;

export type LegacyRepairDatabase = {
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<{ changes: number }>;
};

type Candidate = {
  id: string; status: string; number: number | null; number_year: number | null; issued_at: string | null;
  issued_local_date: string | null; issued_offset_minutes: number | null; valid_until: string | null;
  revision_root_quote_id: string | null; parent_quote_id: string | null; revision_number: number;
  snapshot_json: string; snapshot_count: number; export_count: number; issuance_id: string | null;
};

type IssuedSnapshot = {
  id?: unknown; status?: unknown; number?: unknown; numberYear?: unknown; issuedAt?: unknown;
  issuedLocalDate?: unknown; issuedOffsetMinutes?: unknown; validUntil?: unknown;
  revisionRootQuoteId?: unknown; parentQuoteId?: unknown; revisionNumber?: unknown;
};

type SnapshotValidation = { snapshot: IssuedSnapshot | null; failure: string | null; number: number | null; numberYear: number | null };
function snapshotFor(candidate: Candidate): SnapshotValidation {
  let snapshot: IssuedSnapshot;
  try { snapshot = JSON.parse(candidate.snapshot_json) as IssuedSnapshot; } catch { return { snapshot:null, failure:'SNAPSHOT_JSON_INVALID', number:null, numberYear:null }; }
  const number=Number.isInteger(snapshot.number)?snapshot.number as number:null;
  const numberYear=Number.isInteger(snapshot.numberYear)?snapshot.numberYear as number:null;
  if(snapshot.id!==candidate.id)return {snapshot:null,failure:'SNAPSHOT_QUOTE_ID_MISMATCH',number,numberYear};
  if(snapshot.status!=='issued')return {snapshot:null,failure:'SNAPSHOT_STATUS_NOT_ISSUED',number,numberYear};
  if(number===null||number<1)return {snapshot:null,failure:'SNAPSHOT_NUMBER_INVALID',number,numberYear};
  if(numberYear===null)return {snapshot:null,failure:'SNAPSHOT_YEAR_INVALID',number,numberYear};
  if(typeof snapshot.issuedAt!=='string'||!snapshot.issuedAt)return {snapshot:null,failure:'SNAPSHOT_ISSUED_AT_INVALID',number,numberYear};
  if(snapshot.revisionNumber!==candidate.revision_number)return {snapshot:null,failure:'SNAPSHOT_REVISION_NUMBER_MISMATCH',number,numberYear};
  if(snapshot.revisionRootQuoteId!==candidate.revision_root_quote_id)return {snapshot:null,failure:'SNAPSHOT_REVISION_ROOT_MISMATCH',number,numberYear};
  if(snapshot.parentQuoteId!==candidate.parent_quote_id)return {snapshot:null,failure:'SNAPSHOT_REVISION_PARENT_MISMATCH',number,numberYear};
  return {snapshot,failure:null,number,numberYear};
}

/** Repairs only the one legacy state proven impossible: a draft with exactly one issued snapshot and PDF record. */
export async function repairSingleLegacyIssuedDraft(db: LegacyRepairDatabase) {
  const candidates = await db.getAllAsync<Candidate>(`
    SELECT q.id, q.status, q.number, q.number_year, q.issued_at, q.issued_local_date, q.issued_offset_minutes, q.valid_until,
      q.revision_root_quote_id, q.parent_quote_id, q.revision_number, s.snapshot_json,
      (SELECT COUNT(*) FROM issued_quote_snapshots x WHERE x.quote_id=q.id) AS snapshot_count,
      (SELECT COUNT(*) FROM document_exports x WHERE x.quote_id=q.id) AS export_count,
      l.issuance_id
    FROM quotes q
    JOIN issued_quote_snapshots s ON s.quote_id=q.id
    JOIN document_exports d ON d.quote_id=q.id
    LEFT JOIN quote_share_links l ON l.quote_id=q.id
    WHERE q.status='draft'
  `);
  if (candidates.length !== 1) return { repaired: false, reason: candidates.length ? 'AMBIGUOUS' : 'NONE', candidateCount:candidates.length, candidate:null, rowsAffected:0 } as const;
  const candidate = candidates[0];
  const validation = candidate.snapshot_count === 1 && candidate.export_count === 1 ? snapshotFor(candidate) : {snapshot:null,failure:'ARTIFACT_COUNT_MISMATCH',number:null,numberYear:null};
  const snapshot = validation.snapshot;
  const diagnostic = { candidateCount:1, eligibilityFailure:validation.failure, candidate:{ quoteId:candidate.id, status:candidate.status, snapshotCount:candidate.snapshot_count, exportCount:candidate.export_count, snapshotNumber:validation.number, snapshotNumberYear:validation.numberYear, quoteNumber:candidate.number, quoteNumberYear:candidate.number_year, issuanceCachePresent:Boolean(candidate.issuance_id) } };
  if (!snapshot) return { repaired: false, reason: 'UNVERIFIED_ARTIFACTS', rowsAffected:0, ...diagnostic } as const;

  if (candidate.revision_number === 0) {
    const collision = await db.getFirstAsync<{ id: string }>('SELECT id FROM quotes WHERE id<>? AND status=\'issued\' AND revision_number=0 AND number=? AND number_year=? LIMIT 1', candidate.id, snapshot.number as number, snapshot.numberYear as number);
    if (collision) return { repaired: false, reason: 'NUMBER_COLLISION', rowsAffected:0, ...diagnostic } as const;
  }
  const updated = await db.runAsync(
    "UPDATE quotes SET status='issued', number=?, number_year=?, issued_at=?, issued_local_date=?, issued_offset_minutes=?, valid_until=? WHERE id=? AND status='draft' AND number IS NULL AND number_year IS NULL AND issued_at IS NULL",
    snapshot.number as number, snapshot.numberYear as number, snapshot.issuedAt as string,
    typeof snapshot.issuedLocalDate === 'string' ? snapshot.issuedLocalDate : null,
    typeof snapshot.issuedOffsetMinutes === 'number' ? snapshot.issuedOffsetMinutes : null,
    typeof snapshot.validUntil === 'string' ? snapshot.validUntil : null, candidate.id,
  );
  if (updated.changes !== 1) return { repaired: false, reason: 'CONCURRENT_CHANGE', rowsAffected:updated.changes, ...diagnostic } as const;
  const fkFailure = await db.getFirstAsync<Record<string, SqlValue>>('PRAGMA foreign_key_check');
  if (fkFailure) throw new Error('Legacy repair foreign key verification failed.');
  return { repaired: true, reason:null, rowsAffected:updated.changes, ...diagnostic } as const;
}
