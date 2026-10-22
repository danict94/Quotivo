import { supabase } from '../../data/remote/supabaseClient';
import { DurabilityEntityRecord, DurabilityEntityType, DurabilityOutboxOperation, DurabilityRemoteRepository, DurabilitySyncResult, durabilityEntityTypes } from './DurabilityContracts';

type Row = Record<string, unknown>;

function entityType(value: unknown): DurabilityEntityType {
  if (typeof value === 'string' && (durabilityEntityTypes as readonly string[]).includes(value)) return value as DurabilityEntityType;
  throw new Error('DURABILITY_REMOTE_RESPONSE_INVALID');
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('DURABILITY_REMOTE_RESPONSE_INVALID');
  return value;
}

function object(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('DURABILITY_REMOTE_RESPONSE_INVALID');
  return value as Readonly<Record<string, unknown>>;
}

function recordFrom(value: unknown): DurabilityEntityRecord {
  const row = object(value) as Row;
  if (typeof row.entity_id !== 'string' || typeof row.created_at !== 'string' || typeof row.updated_at !== 'string'
    || (row.deleted_at !== null && typeof row.deleted_at !== 'string')) throw new Error('DURABILITY_REMOTE_RESPONSE_INVALID');
  return {
    entityType: entityType(row.entity_type), entityId: row.entity_id, version: integer(row.version),
    createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at as string | null,
    payload: object(row.payload),
  };
}

export class SupabaseDurabilityRepository implements DurabilityRemoteRepository {
  async listSnapshot(): Promise<readonly DurabilityEntityRecord[]> {
    const { data, error } = await supabase.rpc('get_durability_snapshot');
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error('DURABILITY_REMOTE_RESPONSE_INVALID');
    return data.map(recordFrom);
  }

  async sync(operation: DurabilityOutboxOperation): Promise<DurabilitySyncResult> {
    const { data, error } = await supabase.rpc('sync_durability_entity', {
      p_entity_type: operation.entityType,
      p_entity_id: operation.entityId,
      p_operation_id: operation.operationId,
      p_expected_version: operation.expectedVersion,
      p_payload: operation.payload,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : null;
    const response = object(row);
    if (response.outcome !== 'APPLIED' && response.outcome !== 'CONFLICT') throw new Error('DURABILITY_REMOTE_RESPONSE_INVALID');
    const record = recordFrom(response.record);
    return response.outcome === 'APPLIED' ? { kind: 'APPLIED', record } : { kind: 'CONFLICT', record };
  }
}
