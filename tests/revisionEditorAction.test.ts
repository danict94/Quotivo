import assert from 'node:assert/strict';
import test from 'node:test';
import { RevisionEditorQuote, resolveRevisionEditorAction } from '../src/features/revisions/revisionEditorAction';

const quote = (overrides: Partial<RevisionEditorQuote> = {}): RevisionEditorQuote => ({
  id: 'rev-0', status: 'issued', revisionRootQuoteId: null, parentQuoteId: null, revisionNumber: 0, ...overrides,
});

test('l emesso corrente propone la creazione revisione indipendentemente dal piano', () => {
  assert.deepEqual(resolveRevisionEditorAction(quote(), 0, null), { kind: 'CREATE' });
});

test('una bozza revisione diretta propone di riprenderla', () => {
  const source = quote();
  const draft = quote({ id: 'rev-1-draft', status: 'draft', revisionRootQuoteId: source.id, parentQuoteId: source.id, revisionNumber: 1 });
  assert.deepEqual(resolveRevisionEditorAction(source, 1, draft), { kind: 'RESUME', draftQuoteId: draft.id });
});

test('emesso storico, bozza normale e catena non valida non propongono azioni', () => {
  const rev0 = quote();
  const rev1 = quote({ id: 'rev-1', revisionRootQuoteId: rev0.id, parentQuoteId: rev0.id, revisionNumber: 1 });
  assert.deepEqual(resolveRevisionEditorAction(rev0, 1, null), { kind: 'NONE' });
  assert.deepEqual(resolveRevisionEditorAction(quote({ status: 'draft' }), 0, null), { kind: 'NONE' });
  assert.deepEqual(resolveRevisionEditorAction(quote({ revisionNumber: 1, revisionRootQuoteId: null }), 1, null), { kind: 'NONE' });
  assert.equal(rev1.status, 'issued');
});
