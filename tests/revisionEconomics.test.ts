import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateIssuedRevisionChains, createEmptyQuoteItem, currentQuoteProjection, Quote } from '../src/domain';

function quote(id: string, totalCents: number, revisionNumber = 0, rootQuoteId: string | null = null, status: Quote['status'] = 'issued'): Quote {
  return {
    id, number: 1, numberYear: 2026, clientId: null, client: 'Cliente', clientContactName: '', clientPhone: '', clientEmail: '', clientAddress: '', clientTaxId: '', clientVatNumber: '', siteAddress: '', title: 'Lavori', introduction: '', defaultVatBasisPoints: 0,
    revisionRootQuoteId: rootQuoteId, parentQuoteId: revisionNumber ? rootQuoteId : null, revisionNumber, globalDiscountBasisPoints: 0, status,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', issuedAt: status === 'issued' ? `2026-01-0${revisionNumber + 1}T00:00:00.000Z` : null, issuedLocalDate: status === 'issued' ? `2026-01-0${revisionNumber + 1}` : null, issuedOffsetMinutes: status === 'issued' ? 60 : null, validUntil: null,
    items: [{ ...createEmptyQuoteItem(`${id}-item`, 0), description: 'Lavorazione', quantityScaled: 10_000, unitPriceCents: totalCents, vatTreatment: 'not_applied', vatRateBasisPoints: null }],
  };
}

test('Gli aggregati contano solo l ultima revisione emessa e calcolano il delta canonico', () => {
  const rev0 = quote('root', 10_000);
  const rev1 = quote('rev-1', 11_500, 1, rev0.id);
  const rev2 = quote('rev-2', 11_000, 2, rev0.id);
  const draftRev3 = quote('draft-rev-3', 12_000, 3, rev0.id, 'draft');
  const independent = quote('independent', 4_000);

  assert.equal(aggregateIssuedRevisionChains([rev0]).totalCents, 10_000);
  const atRev1 = aggregateIssuedRevisionChains([rev0, rev1]);
  assert.equal(atRev1.totalCents, 11_500);
  assert.equal(atRev1.deltaByQuoteId.get(rev1.id), 1_500);
  const atRev2 = aggregateIssuedRevisionChains([rev0, rev1, rev2, draftRev3, independent]);
  assert.equal(atRev2.totalCents, 15_000);
  assert.deepEqual(atRev2.currentQuotes.map((value) => value.id).sort(), ['independent', 'rev-2']);
  assert.equal(atRev2.deltaByQuoteId.get(rev2.id), -500);
});

test('La proiezione corrente conserva tutte le bozze e solo l emesso latest per chain', () => {
  const rev0 = quote('root', 10_000);
  const rev1 = quote('rev-1', 11_500, 1, rev0.id);
  const draft = quote('draft', 8_000, 0, null, 'draft');
  const projected = currentQuoteProjection([rev0, rev1, draft]);
  assert.deepEqual(projected.currentQuotes.map((value) => value.id), ['rev-1', 'draft']);
  assert.deepEqual(projected.currentIssuedQuotes.map((value) => value.id), ['rev-1']);
  assert.deepEqual(projected.drafts.map((value) => value.id), ['draft']);
});
