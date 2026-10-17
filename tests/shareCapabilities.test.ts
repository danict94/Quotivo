import assert from 'node:assert/strict';
import test from 'node:test';

import { getQuoteShareCapabilities, quoteShareLifecycleLabel, QuoteShareState } from '../src/features/quote-sharing/shareCapabilities';

function state(overrides: Partial<QuoteShareState> = {}): QuoteShareState {
  return {
    shareId: 'share-1',
    lifecycle: 'ACTIVE',
    commercialOutcome: 'PENDING',
    openedAt: null,
    ...overrides,
  };
}

test('ACTIVE + PENDING permette recupero, copia e revoca, ma non una nuova share', () => {
  assert.deepEqual(getQuoteShareCapabilities(state()), {
    canCreateShare: false,
    canShare: true,
    canCopy: true,
    canRevoke: true,
    canAccept: true,
    canReject: true,
  });
});

for (const outcome of ['ACCEPTED', 'REJECTED'] as const) {
  test(`ACTIVE + ${outcome} mantiene link e revoca, senza una nuova decisione`, () => {
    assert.deepEqual(getQuoteShareCapabilities(state({ commercialOutcome: outcome })), {
      canCreateShare: false,
      canShare: true,
      canCopy: true,
      canRevoke: true,
      canAccept: false,
      canReject: false,
    });
  });
}

for (const lifecycle of ['REVOKED', 'SUPERSEDED'] as const) {
  for (const outcome of ['PENDING', 'ACCEPTED', 'REJECTED'] as const) {
    test(`${lifecycle} + ${outcome} rende inutilizzabile la vecchia share e consente un nuovo invio`, () => {
      assert.deepEqual(getQuoteShareCapabilities(state({ lifecycle, commercialOutcome: outcome })), {
        canCreateShare: true,
        canShare: false,
        canCopy: false,
        canRevoke: false,
        canAccept: false,
        canReject: false,
      });
    });
  }
}

test('nessuna share consente il primo invio e il label share resta separato dall esito commerciale', () => {
  assert.equal(getQuoteShareCapabilities(state({ shareId: null, lifecycle: null, commercialOutcome: null })).canCreateShare, true);
  assert.equal(quoteShareLifecycleLabel(state({ openedAt: '2026-09-15T10:00:00.000Z' })), 'Visualizzato');
  assert.equal(quoteShareLifecycleLabel(state({ commercialOutcome: 'ACCEPTED' })), 'Inviato');
  assert.equal(quoteShareLifecycleLabel(state({ lifecycle: 'REVOKED' })), 'Revocato');
});
