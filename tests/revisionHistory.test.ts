import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyQuoteItem, currentQuoteProjection, Quote, revisionHistoryForQuote } from '../src/domain';
import { recentCurrentQuotes } from '../src/features/dashboard/recentCurrentQuotes';

function issued(id: string, revisionNumber: number, root: string | null, parent: string | null): Quote {
  return { id, number: 8, numberYear: 2026, clientId: null, client: 'Cliente', clientContactName: '', clientPhone: '', clientEmail: '', clientAddress: '', clientTaxId: '', clientVatNumber: '', siteAddress: '', title: 'Intervento', introduction: '', defaultVatBasisPoints: 2200, revisionRootQuoteId: root, parentQuoteId: parent, revisionNumber, globalDiscountBasisPoints: 0, status: 'issued', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', issuedAt: `2026-01-0${revisionNumber + 1}T00:00:00.000Z`, issuedLocalDate: `2026-01-0${revisionNumber + 1}`, issuedOffsetMinutes: 60, validUntil: null, items: [createEmptyQuoteItem(`${id}-item`, 0)] };
}

test('Home e archivio ricevono solo la revisione corrente/latest della chain', () => {
  const rev0 = issued('rev0', 0, null, null);
  const rev1 = issued('rev1', 1, rev0.id, rev0.id);
  const rev2 = issued('rev2', 2, rev0.id, rev1.id);
  assert.deepEqual(currentQuoteProjection([rev2, rev1, rev0]).currentIssuedQuotes.map((quote) => quote.id), ['rev2']);
  assert.deepEqual(recentCurrentQuotes([rev2, rev1, rev0]).map((quote) => quote.id), ['rev2']);
});

test('lo storico espone solo le revisioni precedenti e non duplica la corrente', () => {
  const rev0 = issued('rev0', 0, null, null);
  const rev1 = issued('rev1', 1, rev0.id, rev0.id);
  const rev2 = issued('rev2', 2, rev0.id, rev1.id);
  assert.deepEqual(revisionHistoryForQuote([rev0, rev2, rev1], rev2).map((quote) => quote.id), ['rev1', 'rev0']);
});
