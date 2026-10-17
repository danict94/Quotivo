export type LegacyTransferMode = 'replace' | 'merge';

type SqlValue = string | number | null | Uint8Array;
type SqlRow = Record<string, SqlValue>;

export interface LegacyTransferDatabase {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<unknown>;
}

const tables = [
  { name: 'business_profiles', key: 'id' },
  { name: 'measurement_units', key: 'code' },
  { name: 'vat_rates', key: 'code' },
  { name: 'clients', key: 'id' },
  { name: 'catalog_items', key: 'id' },
  { name: 'number_sequences', key: 'name' },
  { name: 'quotes', key: 'id' },
  { name: 'quote_items', key: 'id' },
  { name: 'issued_quote_snapshots', key: 'quote_id' },
  { name: 'document_exports', key: 'quote_id' },
  { name: 'quote_share_links', key: 'quote_id' },
] as const;

export type LegacyDataSnapshot = Record<(typeof tables)[number]['name'], SqlRow[]>;

export class LegacyDataIntegrityError extends Error {
  constructor(readonly code: 'LEGACY_SOURCE_DRAFT_HAS_ISSUED_ARTIFACTS' | 'LEGACY_TARGET_DRAFT_CONFLICT_WITH_ISSUED_ARTIFACTS', readonly quoteId: string) {
    super(`${code}: ${quoteId}`);
    this.name = 'LegacyDataIntegrityError';
  }
}

function quotedIdentifiers(columns: readonly string[]) {
  return columns.map((column) => `"${column.replace(/"/g, '""')}"`).join(', ');
}

function valuesEqual(left: SqlValue | undefined, right: SqlValue | undefined) {
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

export async function readLegacyDataSnapshot(source: LegacyTransferDatabase): Promise<LegacyDataSnapshot> {
  const snapshot = {} as LegacyDataSnapshot;
  for (const table of tables) {
    snapshot[table.name] = await source.getAllAsync<SqlRow>(`SELECT * FROM ${table.name}`);
  }
  return snapshot;
}

export async function transferLegacyData(
  target: LegacyTransferDatabase,
  snapshot: LegacyDataSnapshot,
  mode: LegacyTransferMode,
) {
  const artifactQuoteIds = new Set([
    ...snapshot.issued_quote_snapshots.map((row) => String(row.quote_id)),
    ...snapshot.document_exports.map((row) => String(row.quote_id)),
  ]);
  const sourceQuotes = new Map(snapshot.quotes.map((row) => [String(row.id), row]));
  for (const quoteId of artifactQuoteIds) {
    if (sourceQuotes.get(quoteId)?.status !== 'issued') throw new LegacyDataIntegrityError('LEGACY_SOURCE_DRAFT_HAS_ISSUED_ARTIFACTS', quoteId);
    const targetQuote = await target.getFirstAsync<{ status: string }>('SELECT status FROM quotes WHERE id = ?', quoteId);
    if (mode === 'merge' && targetQuote?.status === 'draft') throw new LegacyDataIntegrityError('LEGACY_TARGET_DRAFT_CONFLICT_WITH_ISSUED_ARTIFACTS', quoteId);
  }
  const conflict = mode === 'replace' ? 'OR REPLACE' : 'OR IGNORE';
  await target.execAsync('BEGIN IMMEDIATE');
  try {
    for (const table of tables) {
      for (const row of snapshot[table.name]) {
        const columns = Object.keys(row);
        const values = columns.map((column) => row[column]);
        const placeholders = columns.map(() => '?').join(', ');
        await target.runAsync(
          `INSERT ${conflict} INTO ${table.name} (${quotedIdentifiers(columns)}) VALUES (${placeholders})`,
          ...values,
        );
      }
    }
    await target.execAsync('COMMIT');
  } catch (error) {
    await target.execAsync('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

export async function verifyLegacyDataTransfer(
  target: LegacyTransferDatabase,
  snapshot: LegacyDataSnapshot,
  exact: boolean,
) {
  for (const table of tables) {
    for (const row of snapshot[table.name]) {
      const key = row[table.key];
      const found = await target.getFirstAsync<SqlRow>(
        `SELECT * FROM ${table.name} WHERE ${table.key} = ?`,
        key,
      );
      if (!found || !Object.entries(row).every(([column, value]) => valuesEqual(value, found[column]))) return false;
    }
    if (exact) {
      const targetCount = await target.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table.name}`);
      if ((targetCount?.count ?? 0) !== snapshot[table.name].length) return false;
    }
  }
  return verifyLegacyTargetIntegrity(target);
}

export async function verifyLegacyTargetIntegrity(target: LegacyTransferDatabase) {
  return !(await target.getFirstAsync<Record<string, SqlValue>>('PRAGMA foreign_key_check'));
}
