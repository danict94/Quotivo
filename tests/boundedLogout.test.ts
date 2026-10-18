import assert from 'node:assert/strict';
import test from 'node:test';
import { createSingleFlightLogout, LogoutTimeoutError, performBoundedLogout } from '../src/features/auth/boundedLogout';

test('logout riuscito chiude prima la sessione remota e poi il database locale', async () => {
  const calls: string[] = [];
  await performBoundedLogout({ remoteSignOut: async () => { calls.push('remote'); }, closeLocalDatabase: async () => { calls.push('database'); } });
  assert.deepEqual(calls, ['remote', 'database']);
});

test('timeout non chiude falsamente il database locale', async () => {
  let databaseClosed = false;
  await assert.rejects(() => performBoundedLogout({ remoteSignOut: async () => new Promise<void>(() => undefined), closeLocalDatabase: async () => { databaseClosed = true; }, timeoutMs: 1 }), LogoutTimeoutError);
  assert.equal(databaseClosed, false);
});

test('errore rete non chiude falsamente il database locale e un retry può riuscire', async () => {
  let databaseClosed = false;
  let attempts = 0;
  const remoteSignOut = async () => { attempts += 1; if (attempts === 1) throw new Error('network unavailable'); };
  await assert.rejects(() => performBoundedLogout({ remoteSignOut, closeLocalDatabase: async () => { databaseClosed = true; } }), /network unavailable/);
  assert.equal(databaseClosed, false);
  await performBoundedLogout({ remoteSignOut, closeLocalDatabase: async () => { databaseClosed = true; } });
  assert.equal(databaseClosed, true);
  assert.equal(attempts, 2);
});

test('richieste logout concorrenti condividono una sola operazione', async () => {
  let calls = 0;
  let complete: (() => void) | undefined;
  const logout = createSingleFlightLogout(async () => { calls += 1; await new Promise<void>((resolve) => { complete = resolve; }); });
  const first = logout(); const second = logout();
  assert.equal(calls, 1);
  assert.strictEqual(first, second);
  complete?.();
  await first;
});
