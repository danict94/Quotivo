import assert from 'node:assert/strict';
import test from 'node:test';

import { AccountLifecycle, AccountLifecycleError, AccountLifecycleRepository } from '../src/features/account-lifecycle/AccountLifecycle';
import { DeactivateAccountUseCase } from '../src/features/account-lifecycle/DeactivateAccountUseCase';
import { ReactivateAccountUseCase } from '../src/features/account-lifecycle/ReactivateAccountUseCase';

class FakeLifecycleRepository implements AccountLifecycleRepository {
  lifecycle: AccountLifecycle = { status: 'ACTIVE', deactivatedAt: null, reactivatedAt: null };
  readonly sqliteData = { quotes: 2, snapshots: 1, exports: 1, shares: 1 };
  failure: AccountLifecycleError | null = null;
  async get() { return { ...this.lifecycle }; }
  async setStatus(status: AccountLifecycle['status']) {
    if (this.failure) throw this.failure;
    if (this.lifecycle.status === status) return { ...this.lifecycle };
    this.lifecycle = status === 'DEACTIVATED' ? { status, deactivatedAt: '2026-10-16T10:00:00.000Z', reactivatedAt: null } : { status, deactivatedAt: null, reactivatedAt: '2026-10-16T11:00:00.000Z' };
    return { ...this.lifecycle };
  }
}

test('deactivate succeeds and preserves local SQLite/share data', async () => {
  const repository = new FakeLifecycleRepository(); const before = { ...repository.sqliteData };
  assert.equal((await new DeactivateAccountUseCase(repository).execute()).status, 'DEACTIVATED');
  assert.deepEqual(repository.sqliteData, before);
});

test('deactivate and reactivate are idempotent', async () => {
  const repository = new FakeLifecycleRepository(); const deactivate = new DeactivateAccountUseCase(repository); const reactivate = new ReactivateAccountUseCase(repository);
  await deactivate.execute(); assert.equal((await deactivate.execute()).status, 'DEACTIVATED');
  assert.equal((await reactivate.execute()).status, 'ACTIVE'); assert.equal((await reactivate.execute()).status, 'ACTIVE');
});

test('offline or server failure cannot change lifecycle or local data', async () => {
  const repository = new FakeLifecycleRepository(); const before = { ...repository.lifecycle }; const localBefore = { ...repository.sqliteData };
  repository.failure = new AccountLifecycleError('REMOTE_OFFLINE');
  await assert.rejects(new DeactivateAccountUseCase(repository).execute(), /REMOTE_OFFLINE/);
  repository.failure = new AccountLifecycleError('REMOTE_ERROR');
  await assert.rejects(new ReactivateAccountUseCase(repository).execute(), /REMOTE_ERROR/);
  assert.deepEqual(repository.lifecycle, before); assert.deepEqual(repository.sqliteData, localBefore);
});

test('reactivation restores the same server writer/share eligibility state without rebuilding data', async () => {
  const repository = new FakeLifecycleRepository(); const deactivate = new DeactivateAccountUseCase(repository); const reactivate = new ReactivateAccountUseCase(repository);
  await deactivate.execute(); assert.equal(repository.lifecycle.status, 'DEACTIVATED');
  await reactivate.execute(); assert.equal(repository.lifecycle.status, 'ACTIVE');
  assert.deepEqual(repository.sqliteData, { quotes: 2, snapshots: 1, exports: 1, shares: 1 });
});
