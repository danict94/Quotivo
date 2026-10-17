import { CanonicalIssuance, ReconcileIssuedQuoteRemoteRepository } from './ReconcileIssuedQuoteUseCase';

export type ReconciliationRemoteFailure = 'REMOTE_OFFLINE' | 'REMOTE_RLS_DENIED' | 'REMOTE_QUERY_INVALID' | 'NO_ISSUANCE' | 'MULTIPLE_ISSUANCES' | 'DOCUMENT_MISSING';

export class ReconciliationRemoteError extends Error {
  constructor(readonly code: ReconciliationRemoteFailure, cause?: unknown) {
    super(`RECONCILIATION_${code}`);
    this.name = 'ReconciliationRemoteError';
    if (cause !== undefined) this.cause = cause;
  }
}

type ReconciliationRemoteErrorPayload = { code?: string | null; message?: string | null; status?: number | null; name?: string | null };
export type ReconciliationRemoteResult<Row> = { data: Row[] | null; error: ReconciliationRemoteErrorPayload | null };
export type ReconciliationRemoteQuery<Row> = PromiseLike<ReconciliationRemoteResult<Row>> & { eq(column: string, value: string | number): ReconciliationRemoteQuery<Row>; in(column: string, values: readonly string[]): ReconciliationRemoteQuery<Row>; };
export type ReconciliationRemoteClient = { from(table: string): { select(columns: string): ReconciliationRemoteQuery<unknown> } };
type IssuanceRow = { id: string; user_id: string; client_quote_id: string; revision_number: number; sequence_number: number; sequence_year: number; issued_at: string };
type DocumentRow = { issuance_id: string };

function remoteFailure(error: ReconciliationRemoteErrorPayload): ReconciliationRemoteFailure {
  const code = error.code ?? '';
  const message = error.message ?? '';
  const status = error.status ?? 0;
  if (code === '42501' || status === 401 || status === 403) return 'REMOTE_RLS_DENIED';
  if (code.startsWith('PGRST') || code.startsWith('42') || status === 400) return 'REMOTE_QUERY_INVALID';
  if (/network|fetch|offline|timeout|connect/i.test(`${error.name ?? ''} ${message}`)) return 'REMOTE_OFFLINE';
  return 'REMOTE_OFFLINE';
}

function isIssuanceRow(value: unknown): value is IssuanceRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.user_id === 'string' && typeof row.client_quote_id === 'string' && typeof row.revision_number === 'number' && typeof row.sequence_number === 'number' && typeof row.sequence_year === 'number' && typeof row.issued_at === 'string';
}

function isDocumentRow(value: unknown): value is DocumentRow {
  return Boolean(value && typeof value === 'object' && typeof (value as Record<string, unknown>).issuance_id === 'string');
}

/** Remote read adapter: issuance first, then its document; no PostgREST relation embed. */
export class SupabaseReconcileIssuedQuoteRepository implements ReconcileIssuedQuoteRemoteRepository {
  constructor(private readonly ownerUserId: string, private readonly suppliedClient?: ReconciliationRemoteClient) {}

  private get client(): ReconciliationRemoteClient {
    if (this.suppliedClient) return this.suppliedClient;
    // Kept lazy so the adapter contract remains Node-testable without loading Expo native modules.
    return require('../../data/remote/supabaseClient').supabase as ReconciliationRemoteClient;
  }

  async findByClientQuoteId(quoteId: string, revisionNumber: number): Promise<CanonicalIssuance[]> {
    const issuanceResult = await this.client.from('quote_issuances').select('id,user_id,client_quote_id,revision_number,sequence_number,sequence_year,issued_at').eq('user_id', this.ownerUserId).eq('client_quote_id', quoteId).eq('revision_number', revisionNumber);
    if (issuanceResult.error) throw new ReconciliationRemoteError(remoteFailure(issuanceResult.error), issuanceResult.error);
    const issuanceRows = issuanceResult.data ?? [];
    if (!issuanceRows.every(isIssuanceRow)) throw new ReconciliationRemoteError('REMOTE_QUERY_INVALID');
    if (issuanceRows.length === 0) throw new ReconciliationRemoteError('NO_ISSUANCE');
    if (issuanceRows.length !== 1) throw new ReconciliationRemoteError('MULTIPLE_ISSUANCES');

    const issuance = issuanceRows[0];
    const documentResult = await this.client.from('quote_documents').select('issuance_id').in('issuance_id', [issuance.id]);
    if (documentResult.error) throw new ReconciliationRemoteError(remoteFailure(documentResult.error), documentResult.error);
    const documents = documentResult.data ?? [];
    if (!documents.every(isDocumentRow)) throw new ReconciliationRemoteError('REMOTE_QUERY_INVALID');
    if (!documents.some((document) => document.issuance_id === issuance.id)) throw new ReconciliationRemoteError('DOCUMENT_MISSING');

    return [{ ownerUserId: issuance.user_id, clientQuoteId: issuance.client_quote_id, revisionNumber: issuance.revision_number, number: issuance.sequence_number, year: issuance.sequence_year, issuedAt: issuance.issued_at, documentPresent: true }];
  }
}
