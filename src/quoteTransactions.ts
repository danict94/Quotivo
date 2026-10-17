import { calculateEconomics, Quote, validateDraftForFinalization } from './domain';
import { EmissionClock } from './emissionClock';
import { STANDARD_RENDERER_VERSION } from './documents/documentModel';

export type BindValue = string | number | null;
export interface QuoteTransaction {
  runAsync(sql: string, ...params: BindValue[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, ...params: BindValue[]): Promise<T | null>;
}

export async function replaceDraftData(txn: QuoteTransaction, quote: Quote, now: string) {
  const result = await txn.runAsync(
    "UPDATE quotes SET client_id = ?, client = ?, client_contact_name = ?, client_phone = ?, client_email = ?, client_address = ?, client_tax_id = ?, client_vat_number = ?, site_address = ?, title = ?, introduction = ?, default_vat_basis_points = ?, global_discount_basis_points = ?, updated_at = ? WHERE id = ? AND status = 'draft' AND number IS NULL",
    quote.clientId, quote.client.trim(), quote.clientContactName.trim(), quote.clientPhone.trim(), quote.clientEmail.trim(), quote.clientAddress.trim(), quote.clientTaxId.trim(), quote.clientVatNumber.trim(), quote.siteAddress.trim(), quote.title.trim(), quote.introduction.trim(), quote.defaultVatBasisPoints, quote.globalDiscountBasisPoints, now, quote.id,
  );
  if (result.changes !== 1) throw new Error('La bozza non è più modificabile.');
  await txn.runAsync('DELETE FROM quote_items WHERE quote_id = ?', quote.id);
  for (const [position, item] of quote.items.entries()) {
    await txn.runAsync(
      `INSERT INTO quote_items (id, quote_id, description, quantity, unit, unit_price_cents, position,
       short_description, price_mode, quantity_scaled, unit_code, body_price_cents, vat_treatment,
       vat_rate_basis_points, vat_note, line_discount_basis_points, technical_details, inclusions, exclusions, is_optional, confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id, quote.id, item.description.trim(), item.quantity, item.unit.trim() || 'pz', item.unitPriceCents, position,
      item.shortDescription.trim(), item.priceMode, item.quantityScaled, item.unitCode, item.bodyPriceCents,
      item.vatTreatment, item.vatRateBasisPoints, item.vatNote.trim(), item.lineDiscountBasisPoints, item.technicalDetails.trim(),
      item.inclusions.trim(), item.exclusions.trim(), item.isOptional ? 1 : 0, item.confirmed ? 1 : 0,
    );
  }
}

export type FinalizationContext = { clock: EmissionClock; validUntil: string; businessProfile: unknown; canonicalNumber?:number; canonicalYear?:number; revision?:{rootQuoteId:string;parentQuoteId:string;revisionNumber:number} };

export async function finalizeQuoteData(txn: QuoteTransaction, quote: Quote, context: FinalizationContext) {
  const { clock, validUntil, businessProfile } = context;
  const now = clock.instant;
  validateDraftForFinalization(quote);
  const current = await txn.getFirstAsync<{ status: string; number: number | null }>('SELECT status, number FROM quotes WHERE id = ?', quote.id);
  if (!current || current.status !== 'draft' || current.number !== null) throw new Error('Il preventivo è già stato emesso o non esiste.');
  await replaceDraftData(txn, quote, now);

  const revision = context.revision;
  if (revision && (!Number.isInteger(revision.revisionNumber) || revision.revisionNumber < 1 || revision.rootQuoteId === quote.id || revision.parentQuoteId === quote.id || quote.revisionNumber !== revision.revisionNumber || quote.revisionRootQuoteId !== revision.rootQuoteId || quote.parentQuoteId !== revision.parentQuoteId || context.canonicalNumber === undefined || context.canonicalYear === undefined)) throw new Error('Contesto revisione non valido.');
  let assignedNumber: number;
  let assignedYear: number;
  let originalIssuedAt = now;
  let originalIssuedLocalDate = clock.localDate;
  let originalIssuedOffsetMinutes = clock.offsetMinutes;
  let replacedRevisionNumber: number | null = null;
  let replacedIssuedLocalDate: string | null = null;
  if (revision) {
    const root = await txn.getFirstAsync<{ number:number|null; number_year:number|null; status:string; issued_at:string|null; issued_local_date:string|null; issued_offset_minutes:number|null }>('SELECT number, number_year, status, issued_at, issued_local_date, issued_offset_minutes FROM quotes WHERE id = ?', revision.rootQuoteId);
    const parent = await txn.getFirstAsync<{ revision_number:number; revision_root_quote_id:string|null; status:string; issued_local_date:string|null }>('SELECT revision_number, revision_root_quote_id, status, issued_local_date FROM quotes WHERE id = ?', revision.parentQuoteId);
    if (!root || root.status !== 'issued' || root.number !== context.canonicalNumber || root.number_year !== context.canonicalYear || !parent || parent.status !== 'issued' || parent.revision_number !== revision.revisionNumber - 1 || (parent.revision_number > 0 && parent.revision_root_quote_id !== revision.rootQuoteId)) throw new Error('Catena revisione non valida.');
    if (!root.issued_at || !root.issued_local_date || root.issued_offset_minutes === null) throw new Error('Data di emissione originale non disponibile.');
    if (!parent.issued_local_date) throw new Error('Data del documento sostituito non disponibile.');
    if (await txn.getFirstAsync<{ id:string }>("SELECT id FROM quotes WHERE parent_quote_id = ? AND status = 'issued' LIMIT 1", revision.parentQuoteId)) throw new Error('Solo l ultima revisione puo essere emessa.');
    assignedNumber = context.canonicalNumber;
    assignedYear = context.canonicalYear;
    originalIssuedAt = root.issued_at;
    originalIssuedLocalDate = root.issued_local_date;
    originalIssuedOffsetMinutes = root.issued_offset_minutes;
    replacedRevisionNumber = parent.revision_number;
    replacedIssuedLocalDate = parent.issued_local_date;
  } else {
  const sequenceName = `quotes:${clock.year}`;
  await txn.runAsync('INSERT OR IGNORE INTO number_sequences (name, next_number) VALUES (?, 1)', sequenceName);
  const sequence = await txn.getFirstAsync<{ next_number: number }>('SELECT next_number FROM number_sequences WHERE name = ?', sequenceName);
  if (!sequence || !Number.isSafeInteger(sequence.next_number) || sequence.next_number < 1) throw new Error('Contatore preventivi non valido.');
  assignedNumber = context.canonicalNumber??sequence.next_number;
  assignedYear = context.canonicalYear??clock.year;
  const counter = context.canonicalNumber===undefined ? await txn.runAsync('UPDATE number_sequences SET next_number = next_number + 1 WHERE name = ? AND next_number = ?', sequenceName, assignedNumber) : {changes:1};
  if (counter.changes !== 1) throw new Error('Il contatore preventivi è stato modificato. Riprova.');

  }
  const issued = await txn.runAsync(
    "UPDATE quotes SET number = ?, number_year = ?, status = 'issued', issued_at = ?, issued_local_date = ?, issued_offset_minutes = ?, valid_until = ?, updated_at = ? WHERE id = ? AND status = 'draft' AND number IS NULL",
    assignedNumber, assignedYear, now, clock.localDate, clock.offsetMinutes, validUntil, now, quote.id,
  );
  if (issued.changes !== 1) throw new Error('Il preventivo è già stato emesso.');

  const economics = calculateEconomics(quote.items, quote.globalDiscountBasisPoints);
  const snapshot = JSON.stringify({
    schemaVersion: 3, documentModel: 'standard-v1', rendererVersion: STANDARD_RENDERER_VERSION, id: quote.id, number: assignedNumber, numberYear: assignedYear, revisionRootQuoteId:quote.revisionRootQuoteId, parentQuoteId:quote.parentQuoteId, revisionNumber:quote.revisionNumber, status: 'issued',
    clientId:quote.clientId, client: quote.client.trim(), clientContactName:quote.clientContactName.trim(), clientPhone:quote.clientPhone.trim(), clientEmail:quote.clientEmail.trim(), clientAddress:quote.clientAddress.trim(), clientTaxId:quote.clientTaxId.trim(), clientVatNumber:quote.clientVatNumber.trim(), siteAddress:quote.siteAddress.trim(), title: quote.title.trim(), introduction: quote.introduction.trim(), defaultVatBasisPoints:quote.defaultVatBasisPoints, globalDiscountBasisPoints: quote.globalDiscountBasisPoints, createdAt: quote.createdAt,
    updatedAt: now, issuedAt: now, issuedLocalDate: clock.localDate, issuedOffsetMinutes: clock.offsetMinutes, validUntil, businessProfile,
    originalIssuedAt, originalIssuedLocalDate, originalIssuedOffsetMinutes,
    revisionIssuedAt: revision ? now : null, revisionIssuedLocalDate: revision ? clock.localDate : null, revisionIssuedOffsetMinutes: revision ? clock.offsetMinutes : null,
    replacedRevisionNumber, replacedIssuedLocalDate,
    items: quote.items.filter((item)=>item.confirmed!==false&&item.description.trim()).map((item, position) => ({
      ...item, description: item.description.trim(), shortDescription:item.shortDescription.trim(),
      unit: item.unit.trim() || 'pz', technicalDetails:item.technicalDetails.trim(), inclusions:item.inclusions.trim(), exclusions:item.exclusions.trim(), position,
    })),
    economics,
  });
  await txn.runAsync('INSERT INTO issued_quote_snapshots (quote_id, schema_version, snapshot_json, created_at) VALUES (?, 3, ?, ?)', quote.id, snapshot, now);
  return assignedNumber;
}
