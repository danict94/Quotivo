import assert from 'node:assert/strict';
import test from 'node:test';

import { Quote } from '../src/domain';
import { IssuedQuoteRestoreRecord, QuoteDraftRemoteRecord, QuoteDurabilityLocalRepository, QuoteDurabilityOutboxOperation, QuoteDurabilityRemoteRepository, QuoteDurabilitySyncResult, QuoteRestoreRecord } from '../src/features/quote-durability/QuoteDurabilityContracts';
import { QuoteDurabilitySyncService } from '../src/features/quote-durability/QuoteDurabilitySyncService';

function draft(id = 'draft-1', revisionNumber = 0, root: string | null = null, parent: string | null = null): Quote {
  return { id, number:null, numberYear:null, clientId:'client-1', client:'Rossi', clientContactName:'', clientPhone:'', clientEmail:'', clientAddress:'', clientTaxId:'', clientVatNumber:'', siteAddress:'', title:'Bagno', introduction:'', defaultVatBasisPoints:2200, revisionRootQuoteId:root, parentQuoteId:parent, revisionNumber, globalDiscountBasisPoints:0, status:'draft', createdAt:'2026-10-24T10:00:00.000Z', updatedAt:'2026-10-24T10:00:00.000Z', issuedAt:null, issuedLocalDate:null, issuedOffsetMinutes:null, validUntil:null, items:[] };
}
function remoteDraft(value = draft(), version = 1, deletedAt: string | null = null): QuoteDraftRemoteRecord { return { quoteId:value.id, version, createdAt:value.createdAt, updatedAt:value.updatedAt, deletedAt, quote:value }; }
function issued(id: string, revisionNumber: number): IssuedQuoteRestoreRecord { return { quoteId:id, issuanceId:`issuance-${id}`, snapshot:{ id, status:'issued', revisionNumber }, commercialOutcome:'PENDING', commercialOutcomeSource:null, commercialOutcomeDecidedAt:null }; }
function operation(value = draft(), expectedVersion: number | null = null): QuoteDurabilityOutboxOperation { return { operationId:`op-${value.id}`, quoteId:value.id, expectedVersion, quote:value, deleted:false }; }

class FakeLocal implements QuoteDurabilityLocalRepository {
  pending: QuoteDurabilityOutboxOperation[] = [];
  issued: string[] = [];
  drafts: QuoteDraftRemoteRecord[] = [];
  conflicts: QuoteDraftRemoteRecord[] = [];
  failMarkOnce = false;
  constructor(private readonly legacy: QuoteDurabilityOutboxOperation[] = []) {}
  async applyIssued(record: IssuedQuoteRestoreRecord) { this.issued.push(record.quoteId); }
  async applyDraft(record: QuoteDraftRemoteRecord) { this.drafts.push(record); }
  async prepareLegacyUpload() { if (!this.pending.length) this.pending.push(...this.legacy); }
  async listPending() { return [...this.pending]; }
  async markApplied(operationId: string, record: QuoteDraftRemoteRecord) { if (this.failMarkOnce) { this.failMarkOnce=false; throw new Error('CRASH_AFTER_REMOTE'); } this.drafts.push(record); this.pending=this.pending.filter((entry)=>entry.operationId!==operationId); }
  async markConflict(_operation: QuoteDurabilityOutboxOperation, remote: QuoteDraftRemoteRecord) { this.conflicts.push(remote); this.pending=[]; }
}
class FakeRemote implements QuoteDurabilityRemoteRepository {
  ledger = new Map<string, QuoteDraftRemoteRecord>();
  constructor(readonly records: QuoteRestoreRecord[] = [], readonly conflict = false) {}
  async listRestoreRecords() { return this.records; }
  async syncDraft(value: QuoteDurabilityOutboxOperation): Promise<QuoteDurabilitySyncResult> {
    if (this.conflict) return { kind:'CONFLICT', record:remoteDraft(draft(value.quoteId), 2) };
    const previous=this.ledger.get(value.operationId); if (previous) return { kind:'APPLIED', record:previous };
    const record=remoteDraft(value.quote, value.expectedVersion === null ? 1 : value.expectedVersion + 1);
    this.ledger.set(value.operationId,record); return { kind:'APPLIED',record };
  }
}

test('new-device restore establishes issued lineage before terminal revision draft', async () => {
  const revision = draft('rev2-draft', 2, 'rev0', 'rev1');
  const local = new FakeLocal();
  const remote = new FakeRemote([{ kind:'DRAFT', record:remoteDraft(revision) }, { kind:'ISSUED', record:issued('rev1', 1) }, { kind:'ISSUED', record:issued('rev0', 0) }]);
  await new QuoteDurabilitySyncService(local, remote).sync();
  assert.deepEqual(local.issued, ['rev0','rev1']);
  assert.equal(local.drafts[0]?.quote.id, 'rev2-draft');
});

test('legacy draft upload is idempotent after a crash following remote success', async () => {
  const local = new FakeLocal([operation()]); local.failMarkOnce=true;
  const remote = new FakeRemote(); const service = new QuoteDurabilitySyncService(local, remote);
  await assert.rejects(service.sync(), /CRASH_AFTER_REMOTE/);
  assert.deepEqual(await service.sync(), { applied:1, conflicts:0 });
  assert.equal(remote.ledger.size,1);
});

test('a divergent remote draft becomes explicit conflict instead of an overwrite', async () => {
  const local = new FakeLocal([operation(draft('draft-2'), 1)]);
  const result = await new QuoteDurabilitySyncService(local, new FakeRemote([], true)).sync();
  assert.deepEqual(result, { applied:0, conflicts:1 });
  assert.equal(local.conflicts.length,1);
});

test('tombstones are preserved by restore and do not create an editor draft', async () => {
  const local = new FakeLocal();
  await new QuoteDurabilitySyncService(local, new FakeRemote([{ kind:'DRAFT', record:remoteDraft(draft('deleted'), 3, '2026-10-24T12:00:00.000Z') }])).sync();
  assert.equal(local.drafts[0]?.deletedAt, '2026-10-24T12:00:00.000Z');
});
