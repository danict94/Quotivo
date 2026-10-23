import { Quote } from '../../domain';

export type QuoteDraftRemoteRecord = Readonly<{
  quoteId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  quote: Quote;
}>;

export type IssuedQuoteRestoreRecord = Readonly<{
  quoteId: string;
  issuanceId: string;
  snapshot: Readonly<Record<string, unknown>>;
  commercialOutcome: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  commercialOutcomeSource: 'MANUAL' | 'PUBLIC_LINK' | null;
  commercialOutcomeDecidedAt: string | null;
}>;

export type QuoteRestoreRecord =
  | Readonly<{ kind: 'DRAFT'; record: QuoteDraftRemoteRecord }>
  | Readonly<{ kind: 'ISSUED'; record: IssuedQuoteRestoreRecord }>;

export type QuoteDurabilityOutboxOperation = Readonly<{
  operationId: string;
  quoteId: string;
  expectedVersion: number | null;
  quote: Quote;
  deleted: boolean;
}>;

export type QuoteDurabilitySyncResult =
  | Readonly<{ kind: 'APPLIED'; record: QuoteDraftRemoteRecord }>
  | Readonly<{ kind: 'CONFLICT'; record: QuoteDraftRemoteRecord }>;

export interface QuoteDurabilityLocalRepository {
  applyIssued(record: IssuedQuoteRestoreRecord): Promise<void>;
  applyDraft(record: QuoteDraftRemoteRecord): Promise<void>;
  prepareLegacyUpload(): Promise<void>;
  listPending(): Promise<readonly QuoteDurabilityOutboxOperation[]>;
  markApplied(operationId: string, record: QuoteDraftRemoteRecord): Promise<void>;
  markConflict(operation: QuoteDurabilityOutboxOperation, remote: QuoteDraftRemoteRecord): Promise<void>;
}

export interface QuoteDurabilityRemoteRepository {
  listRestoreRecords(): Promise<readonly QuoteRestoreRecord[]>;
  syncDraft(operation: QuoteDurabilityOutboxOperation): Promise<QuoteDurabilitySyncResult>;
}
