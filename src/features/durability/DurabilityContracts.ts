export const durabilityEntityTypes = ['BUSINESS_PROFILE', 'CLIENT', 'CATALOG_ITEM', 'MEASUREMENT_UNIT', 'VAT_RATE'] as const;
export type DurabilityEntityType = typeof durabilityEntityTypes[number];

export type DurabilityEntityRecord = Readonly<{
  entityType: DurabilityEntityType;
  entityId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  payload: Readonly<Record<string, unknown>>;
}>;

export type DurabilityOutboxOperation = Readonly<{
  operationId: string;
  entityType: DurabilityEntityType;
  entityId: string;
  expectedVersion: number | null;
  payload: Readonly<Record<string, unknown>>;
}>;

export type DurabilitySyncResult =
  | Readonly<{ kind: 'APPLIED'; record: DurabilityEntityRecord }>
  | Readonly<{ kind: 'CONFLICT'; record: DurabilityEntityRecord }>;

/** Local projection boundary. The service never reaches SQLite through UI code. */
export interface DurabilityLocalRepository {
  prepareLegacyUpload(): Promise<void>;
  listPending(): Promise<readonly DurabilityOutboxOperation[]>;
  applyRemote(record: DurabilityEntityRecord): Promise<void>;
  markApplied(operationId: string, record: DurabilityEntityRecord): Promise<void>;
  markConflict(operation: DurabilityOutboxOperation, remote: DurabilityEntityRecord): Promise<void>;
}

export interface DurabilityRemoteRepository {
  listSnapshot(): Promise<readonly DurabilityEntityRecord[]>;
  sync(operation: DurabilityOutboxOperation): Promise<DurabilitySyncResult>;
}
