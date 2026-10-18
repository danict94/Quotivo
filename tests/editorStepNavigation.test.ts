import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyQuoteItem } from '../src/domain';
import { canContinueToQuoteSummary, missingConfirmedWorkItemMessage } from '../src/features/quote-editor/editorStepNavigation';

test('il riepilogo resta bloccato se non esiste una lavorazione confermata', () => {
  const item = { ...createEmptyQuoteItem('work-1', 0), description: 'Voce compilata', confirmed: false };
  assert.equal(canContinueToQuoteSummary([item]), false);
  assert.equal(missingConfirmedWorkItemMessage, 'Conferma almeno una lavorazione prima di continuare al riepilogo.');
});

test('il riepilogo è disponibile con almeno una lavorazione confermata e descritta', () => {
  const item = { ...createEmptyQuoteItem('work-1', 0), description: 'Voce confermata', confirmed: true };
  assert.equal(canContinueToQuoteSummary([item]), true);
});
