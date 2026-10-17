import assert from 'node:assert/strict';
import test from 'node:test';

import { CanonicalCommercialOutcome, commercialOutcomeProvenanceLabel, CommercialOutcomeRemoteError, recordManualCommercialOutcome } from '../src/features/quote-status/recordManualCommercialOutcome';

const accepted: CanonicalCommercialOutcome = { outcome: 'ACCEPTED', source: 'MANUAL', decidedAt: '2026-10-17T09:00:00.000Z' };

test('manual ACCEPTED and REJECTED use only the canonical server response', async () => {
  const writes: string[] = [];
  const repository = {
    async recordManualOutcome(_issuanceId: string, outcome: 'ACCEPTED' | 'REJECTED') { writes.push(outcome); return { outcome, source: 'MANUAL' as const, decidedAt: '2026-10-17T09:00:00.000Z' }; },
    async getCommercialOutcome() { return accepted; },
  };
  assert.deepEqual(await recordManualCommercialOutcome(repository, 'issuance-1', 'ACCEPTED'), accepted);
  assert.equal((await recordManualCommercialOutcome(repository, 'issuance-1', 'REJECTED')).source, 'MANUAL');
  assert.deepEqual(writes, ['ACCEPTED', 'REJECTED']);
});

test('a canonical conflict and offline error leave local callers without an optimistic result', async () => {
  for (const code of ['ALREADY_DECIDED', 'OFFLINE'] as const) {
    const repository = { async recordManualOutcome() { throw new CommercialOutcomeRemoteError(code); }, async getCommercialOutcome() { return accepted; } };
    await assert.rejects(() => recordManualCommercialOutcome(repository, 'issuance-1', 'ACCEPTED'), (error: unknown) => error instanceof CommercialOutcomeRemoteError && error.code === code);
  }
});

test('provenance distinguishes manual and public-link final outcomes', () => {
  assert.match(commercialOutcomeProvenanceLabel(accepted) ?? '', /Registrato manualmente/);
  assert.match(commercialOutcomeProvenanceLabel({ ...accepted, source: 'PUBLIC_LINK' }) ?? '', /Tramite link Quotivo/);
  assert.equal(commercialOutcomeProvenanceLabel({ outcome: 'PENDING', source: null, decidedAt: null }), null);
});
