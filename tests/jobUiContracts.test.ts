import assert from 'node:assert/strict';
import test from 'node:test';

import { JobCapability } from '../src/features/jobs/JobRepository';
import { jobCapabilityPresentation } from '../src/features/jobs/jobCapabilityPresentation';
import { defaultJobDetailTab, jobDetailTabs } from '../src/features/jobs/jobDetailTabs';

const job = { id: 'job-1', ownerUserId: 'owner', sourceRootIssuanceId: 'root', sourceIssuanceId: 'issued', sourceRevisionNumber: 1, clientName: 'Rossi', title: 'Bagno', quotedAmountCents: 10000, currency: 'EUR' as const, status: 'ACTIVE' as const, createdAt: '2026-10-22T10:00:00.000Z', startedAt: '2026-10-22T10:00:00.000Z', completedAt: null, cancelledAt: null, updatedAt: '2026-10-22T10:00:00.000Z' };

test('la presentazione UI conserva i comandi della capability Job senza inventare START', () => {
  const start: JobCapability = { kind: 'START' };
  const open: JobCapability = { kind: 'OPEN', job };
  assert.deepEqual(jobCapabilityPresentation(start), { kind: 'ACTION', label: 'Avvia lavoro' });
  assert.deepEqual(jobCapabilityPresentation(open), { kind: 'ACTION', label: 'Apri lavoro' });
  assert.deepEqual(jobCapabilityPresentation({ kind: 'NONE', reason: 'HISTORICAL' }), { kind: 'UNAVAILABLE' });
  assert.deepEqual(jobCapabilityPresentation({ kind: 'NONE', reason: 'NOT_ACCEPTED' }), { kind: 'UNAVAILABLE' });
  assert.equal(jobCapabilityPresentation({ kind: 'ERROR', code: 'OFFLINE' }).kind, 'ERROR');
  assert.deepEqual(jobCapabilityPresentation({ kind: 'ERROR', code: 'SNAPSHOT_MISSING' }), {
    kind: 'ERROR',
    message: 'I dati immutabili di questo preventivo non sono ancora sincronizzati.',
    recoveryLabel: 'Sincronizza dati preventivo',
  });
});

test('il dettaglio Lavoro espone solo il riepilogo come tab iniziale e predispone le sezioni future', () => {
  assert.equal(defaultJobDetailTab, 'summary');
  assert.deepEqual(jobDetailTabs.map((tab) => tab.value), ['summary', 'activities', 'costs', 'extras']);
});
