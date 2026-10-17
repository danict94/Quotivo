import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ReconciliationRemoteClient,
  ReconciliationRemoteError,
  ReconciliationRemoteQuery,
  ReconciliationRemoteResult,
  SupabaseReconcileIssuedQuoteRepository,
} from '../src/features/quote-issuance/SupabaseReconcileIssuedQuoteRepository';
import { CanonicalIssuance, LocalIssuedCandidate, ReconcileIssuedQuoteUseCase } from '../src/features/quote-issuance/ReconcileIssuedQuoteUseCase';

const owner = '96bd01fd-f327-440d-a4f2-fd1dc4735a88';
const quoteId = 'quote-1789415348691-wz6fm43';
const issuance = { id: 'issuance-1', user_id: owner, client_quote_id: quoteId, revision_number: 0, sequence_number: 45, sequence_year: 2026, issued_at: '2026-09-15T20:06:55.733Z' };

function query(result: ReconciliationRemoteResult<unknown>): ReconciliationRemoteQuery<unknown> {
  let value!: ReconciliationRemoteQuery<unknown>;
  value = Object.assign(Promise.resolve(result), { eq: () => value, in: () => value });
  return value;
}

function client(issuanceResult: ReconciliationRemoteResult<unknown>, documentResult: ReconciliationRemoteResult<unknown>, selects: string[] = []): ReconciliationRemoteClient {
  return {
    from(table) {
      return {
        select(columns) {
          selects.push(`${table}:${columns}`);
          return query(table === 'quote_issuances' ? issuanceResult : documentResult);
        },
      };
    },
  };
}

async function failureCode(repository: SupabaseReconcileIssuedQuoteRepository) {
  try { await repository.findByClientQuoteId(quoteId, 0); assert.fail('expected remote failure'); }
  catch (error) { assert.ok(error instanceof ReconciliationRemoteError); return error.code; }
}

test('reconciliation adapter reads issuance and document with two explicit queries', async () => {
  const selects: string[] = [];
  const repository = new SupabaseReconcileIssuedQuoteRepository(owner, client({ data: [issuance], error: null }, { data: [{ issuance_id: issuance.id }], error: null }, selects));
  assert.deepEqual(await repository.findByClientQuoteId(quoteId, 0), [{ ownerUserId: owner, clientQuoteId: quoteId, revisionNumber: 0, number: 45, year: 2026, issuedAt: issuance.issued_at, documentPresent: true }]);
  assert.deepEqual(selects, ['quote_issuances:id,user_id,client_quote_id,revision_number,sequence_number,sequence_year,issued_at', 'quote_documents:issuance_id']);
});

test('a matched canonical issuance completes the existing reconciliation use case', async () => {
  let local: LocalIssuedCandidate = { id: quoteId, ownerUserId: owner, status: 'draft', revisionNumber: 0, snapshotCount: 1, exportCount: 1, number: null, year: null };
  const remote = new SupabaseReconcileIssuedQuoteRepository(owner, client({ data: [issuance], error: null }, { data: [{ issuance_id: issuance.id }], error: null }));
  const useCase = new ReconcileIssuedQuoteUseCase({
    load: async () => local,
    transact: async (work) => work(),
    apply: async (_id, value: CanonicalIssuance) => { local = { ...local, status: 'issued', number: value.number, year: value.year }; },
    verify: async (_id, value) => local.status === 'issued' && local.number === value.number && local.year === value.year,
    foreignKeyCheck: async () => true,
  }, remote);
  assert.deepEqual(await useCase.execute(owner, quoteId), { repaired: true, idempotent: false });
  assert.deepEqual([local.status, local.number, local.year], ['issued', 45, 2026]);
});

test('reconciliation adapter distinguishes non-match and document states', async () => {
  assert.equal(await failureCode(new SupabaseReconcileIssuedQuoteRepository(owner, client({ data: [], error: null }, { data: [], error: null }))), 'NO_ISSUANCE');
  assert.equal(await failureCode(new SupabaseReconcileIssuedQuoteRepository(owner, client({ data: [issuance, { ...issuance, id: 'issuance-2' }], error: null }, { data: [], error: null }))), 'MULTIPLE_ISSUANCES');
  assert.equal(await failureCode(new SupabaseReconcileIssuedQuoteRepository(owner, client({ data: [issuance], error: null }, { data: [], error: null }))), 'DOCUMENT_MISSING');
});

test('reconciliation adapter distinguishes remote failures without returning an empty match', async () => {
  assert.equal(await failureCode(new SupabaseReconcileIssuedQuoteRepository(owner, client({ data: null, error: { code: '42501', message: 'permission denied', status: 403 } }, { data: [], error: null }))), 'REMOTE_RLS_DENIED');
  assert.equal(await failureCode(new SupabaseReconcileIssuedQuoteRepository(owner, client({ data: null, error: { code: 'PGRST100', message: 'bad select', status: 400 } }, { data: [], error: null }))), 'REMOTE_QUERY_INVALID');
  assert.equal(await failureCode(new SupabaseReconcileIssuedQuoteRepository(owner, client({ data: null, error: { message: 'Network request failed' } }, { data: [], error: null }))), 'REMOTE_OFFLINE');
});
