import assert from 'node:assert/strict';
import test from 'node:test';

import { CachedBootstrap, resolveBootstrap } from '../src/features/bootstrap/BootstrapState';
import { versionStatus } from '../src/features/versioning/AppConfig';

const snapshot: CachedBootstrap = {
  entitlement: { plan: 'PRO', status: 'ACTIVE', validFrom: '2026-01-01T00:00:00.000Z', validUntil: null },
  config: { minSupportedVersion: '0.1.0', latestVersion: '0.2.0', maintenanceMode: false, offlineGraceDays: 7, featureFlags: {} },
  validatedAt: '2026-09-13T00:00:00.000Z',
};

test('Bootstrap online mantiene entitlement PRO e segnala aggiornamento disponibile', () => {
  const state = resolveBootstrap(snapshot, '0.1.0', new Date('2026-09-13T01:00:00.000Z'), true);
  assert.equal(state.validation, 'ONLINE');
  assert.equal(state.effectivePlan, 'PRO');
  assert.equal(state.capabilities.hasPremiumAccess, true);
  assert.equal(state.version, 'UPDATE_AVAILABLE');
});

test('Bootstrap online espone il piano FREE senza capability premium', () => {
  const state = resolveBootstrap({ ...snapshot, entitlement: { ...snapshot.entitlement, plan: 'FREE' } }, '0.2.0', new Date('2026-09-13T01:00:00.000Z'), true);
  assert.equal(state.validation, 'ONLINE');
  assert.equal(state.effectivePlan, 'FREE');
  assert.equal(state.capabilities.hasPremiumAccess, false);
});

test('Bootstrap offline entro grace conserva l’ultimo stato valido', () => {
  const state = resolveBootstrap(snapshot, '0.1.0', new Date('2026-09-19T23:59:59.000Z'));
  assert.equal(state.validation, 'OFFLINE_GRACE');
  assert.equal(state.capabilities.canUseServerValidatedActions, true);
});

test('Bootstrap offline oltre grace sospende solo capability con validazione server', () => {
  const state = resolveBootstrap(snapshot, '0.1.0', new Date('2026-09-20T00:00:01.000Z'));
  assert.equal(state.validation, 'OFFLINE_EXPIRED');
  assert.equal(state.capabilities.canUseServerValidatedActions, false);
});

test('Versioning impone update e maintenance senza hardcode UI', () => {
  assert.equal(versionStatus({ ...snapshot.config, minSupportedVersion: '0.1.1' }, '0.1.0'), 'UPDATE_REQUIRED');
  assert.equal(versionStatus({ ...snapshot.config, maintenanceMode: true }, '0.1.0'), 'MAINTENANCE');
});

test('Entitlement scaduto degrada a FREE', () => {
  const state = resolveBootstrap({ ...snapshot, entitlement: { ...snapshot.entitlement, validUntil: '2026-09-12T00:00:00.000Z' } }, '0.2.0', new Date('2026-09-13T01:00:00.000Z'), true);
  assert.equal(state.effectivePlan, 'FREE');
  assert.equal(state.capabilities.hasPremiumAccess, false);
});
