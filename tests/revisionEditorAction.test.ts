import assert from 'node:assert/strict';
import test from 'node:test';
import { RevisionChainQuote, resolveRevisionChainCapability } from '../src/features/revisions/revisionChainCapability';

const quote = (overrides: Partial<RevisionChainQuote> = {}): RevisionChainQuote => ({
  id: 'rev-0', status: 'issued', revisionRootQuoteId: null, parentQuoteId: null, revisionNumber: 0, ...overrides,
});

test('la capability pura include semanticamente Rev.0 senza figli', () => {
  const root = quote();
  assert.deepEqual(resolveRevisionChainCapability({ source: root, root, chain: [root] }), { kind: 'CREATE' });
});

test('una bozza successiva diretta propone di riprenderla', () => {
  const source = quote();
  const draft = quote({ id: 'rev-1-draft', status: 'draft', revisionRootQuoteId: source.id, parentQuoteId: source.id, revisionNumber: 1 });
  assert.deepEqual(resolveRevisionChainCapability({ source, root: source, chain: [source, draft] }), { kind: 'RESUME', draftQuoteId: draft.id });
});

test('emesso storico e catena non valida sono distinti', () => {
  const rev0 = quote();
  const rev1 = quote({ id: 'rev-1', revisionRootQuoteId: rev0.id, parentQuoteId: rev0.id, revisionNumber: 1 });
  assert.deepEqual(resolveRevisionChainCapability({ source: rev0, root: rev0, chain: [rev0, rev1] }), { kind: 'NONE_HISTORICAL' });
  assert.deepEqual(resolveRevisionChainCapability({ source: quote({ revisionNumber: 1, revisionRootQuoteId: null }), root: rev0, chain: [rev0] }), { kind: 'ERROR_INVALID_LINEAGE' });
  assert.deepEqual(resolveRevisionChainCapability({ source: undefined, root: undefined, chain: [] }), { kind: 'ERROR_NOT_FOUND' });
});
