import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyQuoteItem, Quote } from '../src/domain';
import { filterArchiveQuotes } from '../src/features/quote-status/archiveQuoteFilter';

function quote(id: string, status: Quote['status'], number: number | null, title: string, client: string): Quote {
  return { id, number, numberYear: number === null ? null : 2026, clientId: null, client, clientContactName: '', clientPhone: '', clientEmail: '', clientAddress: '', clientTaxId: '', clientVatNumber: '', siteAddress: '', title, introduction: '', defaultVatBasisPoints: 0, revisionRootQuoteId: null, parentQuoteId: null, revisionNumber: 0, globalDiscountBasisPoints: 0, status, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', issuedAt: status === 'issued' ? '2026-01-01T00:00:00.000Z' : null, issuedLocalDate: status === 'issued' ? '2026-01-01' : null, issuedOffsetMinutes: status === 'issued' ? 60 : null, validUntil: null, items: [createEmptyQuoteItem(`${id}-item`, 0)] };
}

const quotes = [
  quote('draft', 'draft', null, 'Rifacimento tetto', 'Édil Rossi'),
  quote('pending', 'issued', 45, 'Facciata', 'Tavola Valdese'),
  quote('accepted', 'issued', 46, 'Bagno', 'Mario Bianchi'),
  quote('rejected', 'issued', 47, 'Tinteggiatura', 'Lucia Verdi'),
];
const outcomes = { pending: 'PENDING', accepted: 'ACCEPTED', rejected: 'REJECTED' } as const;

test('filtra l archivio con gli stati commerciali QF-005', () => {
  assert.deepEqual(filterArchiveQuotes({ quotes, outcomes, commercialFilter: 'DRAFT', query: '' }).map((quote) => quote.id), ['draft']);
  assert.deepEqual(filterArchiveQuotes({ quotes, outcomes, commercialFilter: 'PENDING', query: '' }).map((quote) => quote.id), ['pending']);
  assert.deepEqual(filterArchiveQuotes({ quotes, outcomes, commercialFilter: 'ACCEPTED', query: '' }).map((quote) => quote.id), ['accepted']);
  assert.deepEqual(filterArchiveQuotes({ quotes, outcomes, commercialFilter: 'REJECTED', query: '' }).map((quote) => quote.id), ['rejected']);
});

test('Emessi include ogni preventivo issued e esclude le bozze', () => {
  assert.deepEqual(filterArchiveQuotes({ quotes, outcomes, commercialFilter: 'ISSUED', query: '' }).map((quote) => quote.id), ['pending', 'accepted', 'rejected']);
  assert.deepEqual(filterArchiveQuotes({ quotes, outcomes, commercialFilter: 'ISSUED', query: 'bagno' }).map((quote) => quote.id), ['accepted']);
});

test('cerca per numero, intervento e cliente senza distinguere accenti', () => {
  assert.deepEqual(filterArchiveQuotes({ quotes, outcomes, commercialFilter: 'ALL', query: '45/2026' }).map((quote) => quote.id), ['pending']);
  assert.deepEqual(filterArchiveQuotes({ quotes, outcomes, commercialFilter: 'ALL', query: 'tinteggiatura' }).map((quote) => quote.id), ['rejected']);
  assert.deepEqual(filterArchiveQuotes({ quotes, outcomes, commercialFilter: 'DRAFT', query: 'edil rossi' }).map((quote) => quote.id), ['draft']);
});

test('interseca filtro e ricerca senza modificare l ordine di archivio', () => {
  assert.deepEqual(filterArchiveQuotes({ quotes, outcomes, commercialFilter: 'PENDING', query: 'facciata' }).map((quote) => quote.id), ['pending']);
  assert.deepEqual(filterArchiveQuotes({ quotes, outcomes, commercialFilter: 'ACCEPTED', query: 'facciata' }), []);
});

test('esclude le revisioni emesse supersedute prima di applicare ricerca e filtro commerciale', () => {
  const rev0 = quote('root', 'issued', 45, 'Facciata storica', 'Tavola Valdese');
  const rev1 = { ...quote('rev-1', 'issued', 46, 'Facciata aggiornata', 'Tavola Valdese'), revisionRootQuoteId: rev0.id, parentQuoteId: rev0.id, revisionNumber: 1, issuedAt: '2026-01-02T00:00:00.000Z' };
  const rev2 = { ...quote('rev-2', 'issued', 47, 'Facciata corrente', 'Tavola Valdese'), revisionRootQuoteId: rev0.id, parentQuoteId: rev1.id, revisionNumber: 2, issuedAt: '2026-01-03T00:00:00.000Z' };
  const draft = quote('draft-current', 'draft', null, 'Bozza separata', 'Mario Bianchi');
  const outcomes = { root: 'PENDING', 'rev-1': 'ACCEPTED', 'rev-2': 'REJECTED' } as const;
  const projectedQuotes = [rev0, rev1, rev2, draft];

  assert.deepEqual(filterArchiveQuotes({ quotes: projectedQuotes, outcomes, commercialFilter: 'PENDING', query: '' }), []);
  assert.deepEqual(filterArchiveQuotes({ quotes: projectedQuotes, outcomes, commercialFilter: 'ACCEPTED', query: 'facciata' }), []);
  assert.deepEqual(filterArchiveQuotes({ quotes: projectedQuotes, outcomes, commercialFilter: 'REJECTED', query: 'facciata' }).map((quote) => quote.id), ['rev-2']);
  assert.deepEqual(filterArchiveQuotes({ quotes: projectedQuotes, outcomes, commercialFilter: 'ISSUED', query: 'corrente' }).map((quote) => quote.id), ['rev-2']);
  assert.deepEqual(filterArchiveQuotes({ quotes: projectedQuotes, outcomes, commercialFilter: 'DRAFT', query: '' }).map((quote) => quote.id), ['draft-current']);
});
