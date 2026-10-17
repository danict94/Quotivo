import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveLegacyDataClaimAvailability } from '../src/features/local-data/legacyClaimPolicy';

const accountA = '11111111-1111-4111-8111-111111111111';
const accountB = '22222222-2222-4222-8222-222222222222';

test('il claim legacy richiede archivio account vuoto e dati legacy reali', () => {
  assert.equal(resolveLegacyDataClaimAvailability({ ownerUserId: accountA, existingClaim: null, legacyHasData: true, accountHasData: false }), 'available');
  assert.equal(resolveLegacyDataClaimAvailability({ ownerUserId: accountA, existingClaim: null, legacyHasData: true, accountHasData: true }), 'unavailable');
  assert.equal(resolveLegacyDataClaimAvailability({ ownerUserId: accountA, existingClaim: null, legacyHasData: false, accountHasData: false }), 'unavailable');
});

test('un claim già registrato non può essere offerto a un secondo account', () => {
  assert.equal(resolveLegacyDataClaimAvailability({ ownerUserId: accountA, existingClaim: { ownerUserId: accountA, status: 'claiming' }, legacyHasData: true, accountHasData: false }), 'available');
  assert.equal(resolveLegacyDataClaimAvailability({ ownerUserId: accountA, existingClaim: { ownerUserId: accountA, status: 'claimed' }, legacyHasData: true, accountHasData: false }), 'claimed');
  assert.equal(resolveLegacyDataClaimAvailability({ ownerUserId: accountB, existingClaim: { ownerUserId: accountA, status: 'claimed' }, legacyHasData: true, accountHasData: false }), 'claimed');
});
