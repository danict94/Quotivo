import assert from 'node:assert/strict';
import test from 'node:test';

import { commercialQuoteStatus } from '../src/features/quote-status/commercialQuoteStatus';

test('deriva in modo canonico i quattro stati commerciali puri', () => {
  assert.equal(commercialQuoteStatus({ quoteStatus: 'draft', commercialOutcome: null }), 'DRAFT');
  assert.equal(commercialQuoteStatus({ quoteStatus: 'issued', commercialOutcome: null }), 'PENDING');
  assert.equal(commercialQuoteStatus({ quoteStatus: 'issued', commercialOutcome: 'PENDING' }), 'PENDING');
  assert.equal(commercialQuoteStatus({ quoteStatus: 'issued', commercialOutcome: 'ACCEPTED' }), 'ACCEPTED');
  assert.equal(commercialQuoteStatus({ quoteStatus: 'issued', commercialOutcome: 'REJECTED' }), 'REJECTED');
});

test('rifiuta stati impossibili o non supportati in modo esplicito', () => {
  assert.throws(() => commercialQuoteStatus({ quoteStatus: 'draft', commercialOutcome: 'ACCEPTED' }));
  assert.throws(() => commercialQuoteStatus({ quoteStatus: 'unknown' as never, commercialOutcome: null }));
  assert.throws(() => commercialQuoteStatus({ quoteStatus: 'issued', commercialOutcome: 'UNKNOWN' as never }));
});
