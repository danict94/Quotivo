import assert from 'node:assert/strict';
import test from 'node:test';

import { accountDatabaseName, createAccountDatabaseScope } from '../src/data/local/accountDatabaseScope';

const accountA = '11111111-1111-4111-8111-111111111111';
const accountB = '22222222-2222-4222-8222-222222222222';

type TenantData = {
  profiles: string[];
  clients: string[];
  quotes: string[];
  issuanceCache: string[];
};

test('database locale distinto per account A/B e stabile al ritorno di sessione', () => {
  const opened = new Map<string, TenantData>();
  const scope = createAccountDatabaseScope((name) => {
    const existing = opened.get(name);
    if (existing) return existing;
    const next: TenantData = { profiles: [], clients: [], quotes: [], issuanceCache: [] };
    opened.set(name, next);
    return next;
  });

  const a = scope.activate(accountA);
  a.profiles.push('Profilo A'); a.clients.push('Cliente A'); a.quotes.push('Preventivo A'); a.issuanceCache.push('issuance-A');
  const b = scope.activate(accountB);
  assert.equal(b.profiles.length, 0);
  assert.equal(b.clients.length, 0);
  assert.equal(b.quotes.length, 0);
  assert.equal(b.issuanceCache.length, 0);
  b.profiles.push('Profilo B'); b.clients.push('Cliente B'); b.quotes.push('Preventivo B'); b.issuanceCache.push('issuance-B');

  assert.equal(scope.activate(accountA), a);
  assert.deepEqual(a, { profiles: ['Profilo A'], clients: ['Cliente A'], quotes: ['Preventivo A'], issuanceCache: ['issuance-A'] });
  assert.equal(scope.activate(accountB), b);
  assert.notEqual(accountDatabaseName(accountA), accountDatabaseName(accountB));
});

test('un database locale non può essere usato prima dell’attivazione della sessione', () => {
  const scope = createAccountDatabaseScope(() => ({ value: 'database' }));
  assert.throws(() => scope.current(), /non inizializzato/);
  assert.throws(() => accountDatabaseName('not-a-user-id'), /Identità account locale non valida/);
});
