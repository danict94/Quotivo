import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261020000000_canonical_monthly_quota.sql');
const migration = () => readFile(migrationPath, 'utf8');

test('una sola helper server definisce owner, mese, Rev0 e limite quota', async () => {
  const sql = await migration();
  const helper = sql.slice(sql.indexOf('function public.quote_monthly_quota'), sql.indexOf('function public.get_quote_monthly_quota'));
  assert.match(helper, /issuance\.user_id = v_user_id/i);
  assert.match(helper, /issuance\.issued_at >= date_trunc\('month', now\(\)\)/i);
  assert.match(helper, /issuance\.revision_number = 0/i);
  assert.match(helper, /case when v_is_pro then null::integer else 3 end/i);
  assert.match(helper, /greatest\(0, 3 - v_used\)/i);
});

test('lettura quota e autorizzazioni riusano la helper e revisioni PRO restituiscono limite null', async () => {
  const sql = await migration();
  const readQuota = sql.slice(sql.indexOf('function public.get_quote_monthly_quota'), sql.indexOf('function public.authorize_quote_issue'));
  const issue = sql.slice(sql.indexOf('function public.authorize_quote_issue'), sql.indexOf('function public.authorize_quote_revision_issue'));
  const revision = sql.slice(sql.indexOf('function public.authorize_quote_revision_issue'));
  assert.match(readQuota, /from public\.quote_monthly_quota\(\) quota/i);
  assert.match(issue, /select \* into v_quota from public\.quote_monthly_quota\(\)/i);
  assert.match(revision, /select \* into v_quota from public\.quote_monthly_quota\(\)/i);
  assert.match(issue, /perform public\.assert_account_active\(\)/i);
  assert.match(revision, /perform public\.assert_account_active\(\)/i);
  assert.match(revision, /v_quota\.monthly_limit/i);
  assert.doesNotMatch(revision, /v_quota\.used_this_month, 3,/i);
});

test('la helper resta interna e la lettura read-only è concessa solo agli autenticati', async () => {
  const sql = await migration();
  assert.match(sql, /revoke all on function public\.quote_monthly_quota\(\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.get_quote_monthly_quota\(\) to authenticated/i);
});
