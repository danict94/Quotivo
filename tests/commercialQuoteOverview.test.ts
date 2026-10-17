import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyQuoteItem, Quote } from '../src/domain';
import { commercialMetrics } from '../src/features/quote-status/commercialMetrics';

function quote(id: string, totalCents: number, revisionNumber = 0, rootQuoteId: string | null = null): Quote {
  return { id, number: 1, numberYear: 2026, clientId: null, client: 'Cliente', clientContactName: '', clientPhone: '', clientEmail: '', clientAddress: '', clientTaxId: '', clientVatNumber: '', siteAddress: '', title: 'Lavori', introduction: '', defaultVatBasisPoints: 0, revisionRootQuoteId: rootQuoteId, parentQuoteId: revisionNumber ? rootQuoteId : null, revisionNumber, globalDiscountBasisPoints: 0, status: 'issued', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', issuedAt: `2026-01-0${revisionNumber + 1}T00:00:00.000Z`, issuedLocalDate: `2026-01-0${revisionNumber + 1}`, issuedOffsetMinutes: 60, validUntil: null, items: [{ ...createEmptyQuoteItem(`${id}-item`, 0), description: 'Lavorazione', quantityScaled: 10_000, unitPriceCents: totalCents, vatTreatment: 'not_applied', vatRateBasisPoints: null }] };
}

test('le metriche commerciali usano solo l ultima revisione e partizionano gli esiti', () => {
  const rev0 = quote('root', 10_000);
  const rev1 = quote('rev-1', 12_000, 1, rev0.id);
  const accepted = quote('accepted', 4_000);
  const rejected = quote('rejected', 3_000);
  assert.deepEqual(commercialMetrics([rev0, rev1, accepted, rejected], { 'rev-1': 'PENDING', accepted: 'ACCEPTED', rejected: 'REJECTED' }), {
    issuedCount: 3, issuedAmountCents: 19_000, pendingCount: 1, pendingAmountCents: 12_000, acceptedCount: 1, acceptedAmountCents: 4_000, rejectedCount: 1, rejectedAmountCents: 3_000,
  });
});

test('le metriche vuote non introducono fallback silenziosi', () => {
  assert.deepEqual(commercialMetrics([], {}), { issuedCount: 0, issuedAmountCents: 0, pendingCount: 0, pendingAmountCents: 0, acceptedCount: 0, acceptedAmountCents: 0, rejectedCount: 0, rejectedAmountCents: 0 });
});

test('l esito della revisione superseduta non entra nella panoramica commerciale', () => {
  const rev0 = quote('root', 10_000);
  const rev1 = quote('rev-1', 12_000, 1, rev0.id);
  assert.deepEqual(commercialMetrics([rev0, rev1], { root: 'PENDING', 'rev-1': 'ACCEPTED' }), {
    issuedCount: 1, issuedAmountCents: 12_000, pendingCount: 0, pendingAmountCents: 0, acceptedCount: 1, acceptedAmountCents: 12_000, rejectedCount: 0, rejectedAmountCents: 0,
  });
});

test('una emissione senza outcome cache resta in attesa e le bozze non entrano nelle metriche', () => {
  const pending = quote('pending', 7_000);
  const draft = { ...quote('draft', 9_000), status: 'draft' as const, issuedAt: null, issuedLocalDate: null, issuedOffsetMinutes: null };
  assert.deepEqual(commercialMetrics([pending, draft], {}), {
    issuedCount: 1, issuedAmountCents: 7_000, pendingCount: 1, pendingAmountCents: 7_000, acceptedCount: 0, acceptedAmountCents: 0, rejectedCount: 0, rejectedAmountCents: 0,
  });
});
