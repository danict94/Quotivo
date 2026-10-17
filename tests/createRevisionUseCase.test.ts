import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateEconomics, createEmptyQuoteItem, Quote } from '../src/domain';
import { CreateRevisionRepository, CreateRevisionUseCase } from '../src/features/revisions/CreateRevisionUseCase';

const historicalItem = { ...createEmptyQuoteItem('old-item', 0), description: 'Posa storica', quantity: 2.5, quantityScaled: 25_000, unit: 'm²', unitCode: 'sqm', unitPriceCents: 1_990, vatRateBasisPoints: 1_000 };
const snapshot = (id: string, items = [historicalItem]) => ({ schemaVersion: 3, status: 'issued', id, client: 'Cliente storico', clientContactName: 'Anna', clientAddress: 'Via Roma 1', title: 'Bagno storico', introduction: 'Note storiche', defaultVatBasisPoints: 1000, globalDiscountBasisPoints: 500, validUntil: '2026-11-13', businessProfile: { defaultConditions: 'Condizioni storiche', defaultPaymentTerms: 'Bonifico' }, items });

function repository(source: Pick<Quote, 'id' | 'status' | 'revisionRootQuoteId' | 'revisionNumber'>, sourceSnapshot: unknown, next: number) {
  const saved: Quote[] = [];
  const value: CreateRevisionRepository = {
    loadIssuedQuote: async () => source,
    loadIssuedSnapshot: async () => sourceSnapshot,
    nextRevisionNumber: async () => next,
    saveRevisionDraft: async (draft) => { saved.push(draft); },
  };
  return { value, saved };
}

const ids = (() => { let count = 0; return { quoteId: () => `new-quote-${++count}`, itemId: () => `new-item-${++count}` }; })();

test('Rev.0 crea una bozza Rev.1 dai valori storici dello snapshot', async () => {
  const source = { id: 'rev-0', status: 'issued' as const, revisionRootQuoteId: null, revisionNumber: 0 };
  const sourceSnapshot = snapshot('rev-0'); const originalSnapshot = structuredClone(sourceSnapshot);
  const { value, saved } = repository(source, sourceSnapshot, 1);
  const result = await new CreateRevisionUseCase(value, ids, () => '2026-10-14T10:00:00.000Z').execute('rev-0');
  assert.equal(saved.length, 1); assert.equal(result.draft.revisionRootQuoteId, 'rev-0'); assert.equal(result.draft.parentQuoteId, 'rev-0'); assert.equal(result.draft.revisionNumber, 1);
  assert.equal(result.draft.client, 'Cliente storico'); assert.equal(result.draft.items[0].unitPriceCents, 1990); assert.notEqual(result.draft.items[0].id, historicalItem.id);
  assert.deepEqual(result.historicalBusinessProfile, { defaultConditions: 'Condizioni storiche', defaultPaymentTerms: 'Bonifico' });
  assert.equal(calculateEconomics(result.draft.items, result.draft.globalDiscountBasisPoints).totalCents, calculateEconomics([historicalItem], 500).totalCents);
  assert.deepEqual(sourceSnapshot, originalSnapshot);
});

test('Rev.1 crea una bozza Rev.2 e rifiuta una sorgente non più corrente', async () => {
  const source = { id: 'rev-1', status: 'issued' as const, revisionRootQuoteId: 'rev-0', revisionNumber: 1 };
  const { value, saved } = repository(source, snapshot('rev-1'), 2);
  const result = await new CreateRevisionUseCase(value, ids).execute('rev-1');
  assert.equal(result.draft.revisionRootQuoteId, 'rev-0'); assert.equal(result.draft.parentQuoteId, 'rev-1'); assert.equal(result.draft.revisionNumber, 2); assert.equal(saved[0].number, null);
  const stale = repository({ ...source, id: 'rev-0', revisionRootQuoteId: null, revisionNumber: 0 }, snapshot('rev-0'), 2);
  await assert.rejects(() => new CreateRevisionUseCase(stale.value, ids).execute('rev-0'), /più recente/);
});

test('Una collisione di revisione non crea una seconda bozza valida', async () => {
  const source = { id: 'rev-0', status: 'issued' as const, revisionRootQuoteId: null, revisionNumber: 0 };
  const { value, saved } = repository(source, snapshot('rev-0'), 1);
  value.saveRevisionDraft = async () => { throw new Error('UNIQUE constraint failed: quotes.revision_root_quote_id, quotes.revision_number'); };
  await assert.rejects(() => new CreateRevisionUseCase(value, ids).execute('rev-0'), /altra operazione/);
  assert.equal(saved.length, 0);
});
