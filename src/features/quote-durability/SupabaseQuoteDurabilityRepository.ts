import { Quote, QuoteItem } from '../../domain';
import { supabase } from '../../data/remote/supabaseClient';
import { IssuedQuoteRestoreRecord, QuoteDraftRemoteRecord, QuoteDurabilityOutboxOperation, QuoteDurabilityRemoteRepository, QuoteDurabilitySyncResult, QuoteRestoreRecord } from './QuoteDurabilityContracts';

function object(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID');
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== 'string') throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID'); return value; }
function nullableText(value: unknown): string | null { if (value !== null && typeof value !== 'string') throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID'); return value; }
function integer(value: unknown, minimum = 0): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID'); return value; }
function number(value: unknown, minimum = 0): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID'); return value; }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID'); return value; }

function item(value: unknown): QuoteItem {
  const row = object(value);
  return { id:text(row.id), confirmed:boolean(row.confirmed), description:text(row.description), shortDescription:text(row.shortDescription), priceMode:row.priceMode === 'body' ? 'body' : row.priceMode === 'measured' ? 'measured' : (() => { throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID'); })(), quantity:number(row.quantity), quantityScaled:integer(row.quantityScaled), unit:text(row.unit), unitCode:nullableText(row.unitCode), unitPriceCents:integer(row.unitPriceCents), bodyPriceCents:integer(row.bodyPriceCents), vatTreatment:row.vatTreatment === 'rate' ? 'rate' : row.vatTreatment === 'not_applied' ? 'not_applied' : (() => { throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID'); })(), vatRateBasisPoints:row.vatRateBasisPoints === null ? null : integer(row.vatRateBasisPoints), vatNote:text(row.vatNote), lineDiscountBasisPoints:integer(row.lineDiscountBasisPoints), technicalDetails:text(row.technicalDetails), inclusions:text(row.inclusions), exclusions:text(row.exclusions), isOptional:boolean(row.isOptional), position:integer(row.position) };
}
function parseRemoteQuote(value: unknown): Quote {
  const row = object(value);
  if (!Array.isArray(row.items) || (row.status !== 'draft' && row.status !== 'issued')) throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID');
  return { id:text(row.id), number:row.number === null ? null : integer(row.number, 1), numberYear:row.numberYear === null ? null : integer(row.numberYear, 1), clientId:nullableText(row.clientId), client:text(row.client), clientContactName:text(row.clientContactName), clientPhone:text(row.clientPhone), clientEmail:text(row.clientEmail), clientAddress:text(row.clientAddress), clientTaxId:text(row.clientTaxId), clientVatNumber:text(row.clientVatNumber), siteAddress:text(row.siteAddress), title:text(row.title), introduction:text(row.introduction), defaultVatBasisPoints:integer(row.defaultVatBasisPoints), revisionRootQuoteId:nullableText(row.revisionRootQuoteId), parentQuoteId:nullableText(row.parentQuoteId), revisionNumber:integer(row.revisionNumber), globalDiscountBasisPoints:integer(row.globalDiscountBasisPoints), status:row.status, createdAt:text(row.createdAt), updatedAt:text(row.updatedAt), issuedAt:nullableText(row.issuedAt), issuedLocalDate:nullableText(row.issuedLocalDate), issuedOffsetMinutes:row.issuedOffsetMinutes === null ? null : integer(row.issuedOffsetMinutes), validUntil:nullableText(row.validUntil), items:row.items.map(item) };
}
function draftRecord(value: unknown): QuoteDraftRemoteRecord {
  const row = object(value); const payload = parseRemoteQuote(row.payload);
  if (payload.status !== 'draft') throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID');
  return { quoteId:text(row.quote_id), version:integer(row.version, 1), createdAt:text(row.created_at), updatedAt:text(row.updated_at), deletedAt:nullableText(row.deleted_at), quote:payload };
}
function restoreRecord(value: unknown): QuoteRestoreRecord {
  const row = object(value); const kind = text(row.kind);
  if (kind === 'DRAFT') return { kind, record:draftRecord(row) };
  if (kind !== 'ISSUED') throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID');
  const payload = object(row.payload);
  const commercialOutcome = payload.commercialOutcome;
  if (commercialOutcome !== 'PENDING' && commercialOutcome !== 'ACCEPTED' && commercialOutcome !== 'REJECTED') throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID');
  const commercialOutcomeSource = payload.commercialOutcomeSource;
  if (commercialOutcomeSource !== null && commercialOutcomeSource !== 'MANUAL' && commercialOutcomeSource !== 'PUBLIC_LINK') throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID');
  return { kind, record:{ quoteId:text(row.quote_id), issuanceId:text(payload.issuanceId), snapshot:object(payload.snapshot), commercialOutcome, commercialOutcomeSource, commercialOutcomeDecidedAt:nullableText(payload.commercialOutcomeDecidedAt) } };
}

export class SupabaseQuoteDurabilityRepository implements QuoteDurabilityRemoteRepository {
  async listRestoreRecords(): Promise<readonly QuoteRestoreRecord[]> {
    const { data, error } = await supabase.rpc('get_quote_restore_snapshot');
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID');
    return data.map(restoreRecord);
  }

  async syncDraft(operation: QuoteDurabilityOutboxOperation): Promise<QuoteDurabilitySyncResult> {
    const payload = { ...operation.quote, deleted: operation.deleted };
    const { data, error } = await supabase.rpc('sync_quote_draft_projection', { p_quote_id:operation.quoteId, p_operation_id:operation.operationId, p_expected_version:operation.expectedVersion, p_payload:payload });
    if (error) throw new Error(error.message);
    const response = object(Array.isArray(data) ? data[0] : null);
    const record = draftRecord(object(response.record));
    if (response.outcome === 'APPLIED') return { kind:'APPLIED', record };
    if (response.outcome === 'CONFLICT') return { kind:'CONFLICT', record };
    throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID');
  }
}
