import { supabase } from '../../data/remote/supabaseClient';
import { IssuanceSnapshotRecord, IssuanceSnapshotRepository } from './IssuanceSnapshotRepository';

type SnapshotRow = {
  quote_issuance_id?: unknown;
  snapshot_schema_version?: unknown;
  client_name?: unknown;
  title?: unknown;
  quoted_amount_cents?: unknown;
  currency?: unknown;
  created_at?: unknown;
};

function map(row: unknown): IssuanceSnapshotRecord {
  const value = row as SnapshotRow | undefined;
  if (!value
    || typeof value.quote_issuance_id !== 'string'
    || typeof value.snapshot_schema_version !== 'number' || !Number.isInteger(value.snapshot_schema_version)
    || typeof value.client_name !== 'string'
    || typeof value.title !== 'string'
    || typeof value.quoted_amount_cents !== 'number' || !Number.isInteger(value.quoted_amount_cents)
    || value.currency !== 'EUR'
    || typeof value.created_at !== 'string') {
    throw new Error('Risposta snapshot emissione non valida.');
  }
  return {
    issuanceId: value.quote_issuance_id,
    snapshotSchemaVersion: value.snapshot_schema_version,
    clientName: value.client_name,
    title: value.title,
    quotedAmountCents: value.quoted_amount_cents,
    currency: 'EUR',
    createdAt: value.created_at,
  };
}

export class SupabaseIssuanceSnapshotRepository implements IssuanceSnapshotRepository {
  async register(issuanceId: string, snapshot: unknown): Promise<IssuanceSnapshotRecord> {
    const { data, error } = await supabase.rpc('register_quote_issuance_snapshot', {
      p_issuance_id: issuanceId,
      p_snapshot: snapshot,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : null;
    return map(row);
  }
}
