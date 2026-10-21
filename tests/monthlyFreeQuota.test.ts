import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { freeQuotaInlineLabel, freeQuotaPresentation, monthlyFreeQuotaFromServerResponse } from '../src/features/quote-issuance/monthlyFreeQuota';

test('quota Free presenta soltanto i valori server-authoritative 0/3, 1/3 e 3/3', () => {
  assert.deepEqual(freeQuotaPresentation({ usedThisMonth: 0, monthlyLimit: 3, remaining: 3 }), { used: '0 di 3 utilizzati', remaining: '3 disponibili' });
  assert.deepEqual(freeQuotaPresentation({ usedThisMonth: 1, monthlyLimit: 3, remaining: 2 }), { used: '1 di 3 utilizzati', remaining: '2 disponibili' });
  assert.deepEqual(freeQuotaPresentation({ usedThisMonth: 3, monthlyLimit: 3, remaining: 0 }), { used: '3 di 3 utilizzati', remaining: '0 disponibili' });
});

test('revisioni e cambio mese sono proiezioni del solo valore restituito dal server', async () => {
  assert.deepEqual(monthlyFreeQuotaFromServerResponse({ used_this_month: 1, monthly_limit: 3, remaining: 2 }), { usedThisMonth: 1, monthlyLimit: 3, remaining: 2 });
});

test('la quota PRO server-authoritative non espone un limite Free', () => {
  assert.equal(freeQuotaPresentation({ usedThisMonth: 4, monthlyLimit: null, remaining: null }), null);
  assert.equal(freeQuotaInlineLabel({ usedThisMonth: 4, monthlyLimit: null, remaining: null }), null);
});

test('Home usa una sola etichetta derivata dalla quota server-authoritative', () => {
  assert.equal(freeQuotaInlineLabel({ usedThisMonth: 1, monthlyLimit: 3, remaining: 2 }), 'Piano Free · 1 di 3 utilizzati · 2 disponibili');
});

test('il repository non calcola soglia o confine mensile sul client', async () => {
  const source = await readFile(path.join(process.cwd(), 'src', 'features', 'quote-issuance', 'MonthlyFreeQuotaRepository.ts'), 'utf8');
  assert.match(source, /rpc\('get_quote_monthly_quota'\)/);
  assert.doesNotMatch(source, /Date\.UTC|freeMonthlyLimit|quote_issuances/);
});

test('gli utenti PRO non renderizzano il contatore Free', async () => {
  const source = await readFile(path.join(process.cwd(), 'src', 'features', 'account-lifecycle', 'AccountSettingsScreen.tsx'), 'utf8');
  assert.match(source, /const showFreeQuota = quota \? quota\.monthlyLimit !== null : !isPro/);
  assert.match(source, /\{showFreeQuota&&<UsageSummary/);
});
