import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { IssuanceSnapshotRepository } from '../src/features/quote-issuance/IssuanceSnapshotRepository';
import { finalizeIssuanceSnapshotLifecycle, recoverIssuanceSnapshot } from '../src/features/quote-issuance/finalizeIssuanceSnapshotLifecycle';
import { IssuanceSnapshotRegistrationError, registerIssuanceSnapshot } from '../src/features/quote-issuance/registerIssuanceSnapshot';

const snapshot = (revisionNumber = 0, totalCents = 12_155_00) => ({
  schemaVersion: 3,
  documentModel: 'standard-v1',
  status: 'issued',
  id: `quote-rev-${revisionNumber}`,
  number: 25,
  numberYear: 2026,
  revisionNumber,
  client: 'Rossi',
  title: 'Rifacimento bagno',
  economics: { totalCents },
});

function repository() {
  const records = new Map<string, unknown>();
  const calls: string[] = [];
  const value: IssuanceSnapshotRepository = {
    async register(issuanceId, payload) {
      calls.push(issuanceId);
      const existing = records.get(issuanceId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(payload)) throw new Error('ISSUANCE_SNAPSHOT_CONFLICT');
      records.set(issuanceId, payload);
      const source = payload as ReturnType<typeof snapshot>;
      return { issuanceId, snapshotSchemaVersion: source.schemaVersion, clientName: source.client, title: source.title, quotedAmountCents: source.economics.totalCents, currency: 'EUR', createdAt: '2026-10-21T10:00:00.000Z' };
    },
  };
  return { value, calls };
}

test('registra gli snapshot emessi Rev0, Rev1 e RevN senza creare issuance', async () => {
  const { value, calls } = repository();
  for (const revision of [0, 1, 3]) {
    const registered = await registerIssuanceSnapshot(value, { issuanceId: `issuance-${revision}`, snapshot: snapshot(revision) });
    assert.equal(registered.quotedAmountCents, 12_155_00);
  }
  assert.deepEqual(calls, ['issuance-0', 'issuance-1', 'issuance-3']);
});

test('retry identico è idempotente mentre un payload divergente è conflitto', async () => {
  const { value } = repository();
  await registerIssuanceSnapshot(value, { issuanceId: 'issuance-1', snapshot: snapshot(1) });
  await registerIssuanceSnapshot(value, { issuanceId: 'issuance-1', snapshot: snapshot(1) });
  await assert.rejects(() => registerIssuanceSnapshot(value, { issuanceId: 'issuance-1', snapshot: snapshot(1, 99) }), /ISSUANCE_SNAPSHOT_CONFLICT/);
});

test('un fallimento remoto è recuperabile senza autorizzare una nuova issuance', async () => {
  let attempts = 0;
  const calls: string[] = [];
  const value: IssuanceSnapshotRepository = {
    async register(issuanceId) {
      calls.push(issuanceId);
      attempts += 1;
      if (attempts === 1) throw new Error('OFFLINE');
      return { issuanceId, snapshotSchemaVersion: 3, clientName: 'Rossi', title: 'Rifacimento bagno', quotedAmountCents: 100, currency: 'EUR', createdAt: '2026-10-21T10:00:00.000Z' };
    },
  };
  await assert.rejects(() => recoverIssuanceSnapshot(value, { issuanceId: 'existing-issuance', snapshot: snapshot() }), /OFFLINE/);
  await recoverIssuanceSnapshot(value, { issuanceId: 'existing-issuance', snapshot: snapshot() });
  assert.deepEqual(calls, ['existing-issuance', 'existing-issuance']);
});

test('la failure remota dopo emissione mantiene la recovery sullo stesso issuance id', async () => {
  const events: string[] = [];
  const failing: IssuanceSnapshotRepository = { register: async () => { events.push('register'); throw new Error('OFFLINE'); } };
  const result = await finalizeIssuanceSnapshotLifecycle({
    issuanceId: 'issued-once',
    finalize: async () => { events.push('finalize'); return 'emitted'; },
    loadIssuedSnapshot: async () => { events.push('load-snapshot'); return snapshot(); },
    markPending: async () => { events.push('pending'); },
    markSynced: async () => { events.push('synced'); },
    repository: failing,
  });
  assert.deepEqual(events, ['finalize', 'load-snapshot', 'pending', 'register']);
  assert.equal(result.emission, 'emitted');
  assert.equal(result.registration.kind, 'PENDING_RECOVERY');
});

test('rifiuta uno snapshot locale non emesso prima di chiamare il repository', async () => {
  const { value, calls } = repository();
  await assert.rejects(() => registerIssuanceSnapshot(value, { issuanceId: 'issuance', snapshot: { ...snapshot(), status: 'draft' } }), IssuanceSnapshotRegistrationError);
  assert.deepEqual(calls, []);
});

test('la migration protegge snapshot, ownership, retry idempotente e conflitto', async () => {
  const sql = await readFile(path.join(process.cwd(), 'supabase', 'migrations', '20261021000000_canonical_issuance_snapshots.sql'), 'utf8');
  assert.match(sql, /create table public\.quote_issuance_snapshots/i);
  assert.match(sql, /quote_issuance_id uuid primary key references public\.quote_issuances/i);
  assert.match(sql, /owner_user_id uuid not null references auth\.users/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /grant select on public\.quote_issuance_snapshots to authenticated/i);
  assert.match(sql, /before update or delete on public\.quote_issuance_snapshots/i);
  assert.match(sql, /perform public\.assert_account_active\(\)/i);
  assert.match(sql, /v_issuance\.client_quote_id <> v_snapshot_quote_id/i);
  assert.match(sql, /v_issuance\.revision_number <> v_revision_number/i);
  assert.match(sql, /v_existing\.snapshot_json <> p_snapshot/i);
  assert.match(sql, /ISSUANCE_SNAPSHOT_CONFLICT/i);
});
