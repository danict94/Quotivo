import assert from 'node:assert/strict';
import test from 'node:test';

import { DurabilityEntityRecord, DurabilityLocalRepository, DurabilityOutboxOperation, DurabilityRemoteRepository, DurabilitySyncResult } from '../src/features/durability/DurabilityContracts';
import { DurabilitySyncService } from '../src/features/durability/DurabilitySyncService';

const client = (version = 1, deletedAt: string | null = null): DurabilityEntityRecord => ({
  entityType: 'CLIENT', entityId: 'client-1', version, createdAt: '2026-10-23T10:00:00.000Z', updatedAt: '2026-10-23T10:00:00.000Z', deletedAt,
  payload: { name: 'Rossi SRL', contactName: '', phone: '', email: '', address: '', taxId: '', vatNumber: '' },
});
const operation = (expectedVersion: number | null = null): DurabilityOutboxOperation => ({ operationId: 'op-1', entityType: 'CLIENT', entityId: 'client-1', expectedVersion, payload: { ...client().payload, deleted: false } });

class FakeLocal implements DurabilityLocalRepository {
  pending: DurabilityOutboxOperation[] = [];
  applied: DurabilityEntityRecord[] = [];
  conflicts: DurabilityEntityRecord[] = [];
  prepared = 0;
  failMarkOnce = false;
  constructor(private readonly legacy: DurabilityOutboxOperation[] = []) {}
  async prepareLegacyUpload() { this.prepared += 1; if (this.prepared === 1) this.pending.push(...this.legacy); }
  async listPending() { return [...this.pending]; }
  async applyRemote(record: DurabilityEntityRecord) { this.applied.push(record); }
  async markApplied(operationId: string, record: DurabilityEntityRecord) {
    if (this.failMarkOnce) { this.failMarkOnce = false; throw new Error('SIMULATED_CRASH_AFTER_REMOTE'); }
    this.applied.push(record); this.pending = this.pending.filter((item) => item.operationId !== operationId);
  }
  async markConflict(operation_: DurabilityOutboxOperation, remote: DurabilityEntityRecord) { this.conflicts.push(remote); this.pending = this.pending.filter((item) => item.operationId !== operation_.operationId); }
}

class FakeRemote implements DurabilityRemoteRepository {
  calls = 0;
  readonly ledger = new Map<string, DurabilityEntityRecord>();
  constructor(readonly snapshot: DurabilityEntityRecord[] = [], readonly conflict = false, readonly offline = false) {}
  async listSnapshot() { if (this.offline) throw new Error('OFFLINE'); return this.snapshot; }
  async sync(value: DurabilityOutboxOperation): Promise<DurabilitySyncResult> {
    this.calls += 1;
    if (this.conflict) return { kind: 'CONFLICT', record: client(4) };
    const previous = this.ledger.get(value.operationId);
    if (previous) return { kind: 'APPLIED', record: previous };
    const next = client(value.expectedVersion === null ? 1 : value.expectedVersion + 1);
    this.ledger.set(value.operationId, next);
    return { kind: 'APPLIED', record: next };
  }
}

test('legacy upload is idempotent and a second sync creates no duplicate operation', async () => {
  const local = new FakeLocal([operation()]); const remote = new FakeRemote(); const service = new DurabilitySyncService(local, remote);
  assert.deepEqual(await service.sync(), { applied: 1, conflicts: 0 });
  assert.deepEqual(await service.sync(), { applied: 0, conflicts: 0 });
  assert.equal(remote.calls, 1); assert.equal(local.applied.at(-1)?.version, 1);
});

test('retry after a crash after remote success returns the same canonical record', async () => {
  const local = new FakeLocal([operation()]); local.failMarkOnce = true; const remote = new FakeRemote(); const service = new DurabilitySyncService(local, remote);
  await assert.rejects(service.sync(), /SIMULATED_CRASH_AFTER_REMOTE/);
  assert.deepEqual(await service.sync(), { applied: 1, conflicts: 0 });
  assert.equal(remote.ledger.size, 1); assert.equal(local.applied.at(-1)?.entityId, 'client-1');
});

test('remote snapshot hydrates an empty new device and tombstones are preserved', async () => {
  const local = new FakeLocal(); const remote = new FakeRemote([client(3), client(4, '2026-10-23T12:00:00.000Z')]);
  const result = await new DurabilitySyncService(local, remote).sync();
  assert.deepEqual(result, { applied: 0, conflicts: 0 });
  assert.equal(local.applied.length, 2); assert.equal(local.applied[1]?.deletedAt, '2026-10-23T12:00:00.000Z');
});

test('divergent remote version is explicit conflict, not a silent overwrite', async () => {
  const local = new FakeLocal([operation(1)]); const remote = new FakeRemote([], true);
  assert.deepEqual(await new DurabilitySyncService(local, remote).sync(), { applied: 0, conflicts: 1 });
  assert.equal(local.conflicts[0]?.version, 4); assert.equal(local.applied.length, 0);
});

test('offline leaves the local outbox intact', async () => {
  const local = new FakeLocal(); local.pending.push(operation()); const remote = new FakeRemote([], false, true);
  await assert.rejects(new DurabilitySyncService(local, remote).sync(), /OFFLINE/);
  assert.equal(local.pending.length, 1); assert.equal(local.applied.length, 0);
});
