import assert from 'node:assert/strict';
import test from 'node:test';

import { availableJobStatusTransitions, matchesJobListFilter } from '../src/features/jobs/jobStatus';
import { jobStatusPresentation } from '../src/features/jobs/jobStatusPresentation';

test('la state machine Job espone solo le azioni contestuali previste', () => {
  assert.deepEqual(availableJobStatusTransitions('ACTIVE'), ['PAUSED', 'COMPLETED']);
  assert.deepEqual(availableJobStatusTransitions('PAUSED'), ['ACTIVE', 'COMPLETED']);
  assert.deepEqual(availableJobStatusTransitions('COMPLETED'), []);
  assert.deepEqual(availableJobStatusTransitions('CANCELLED'), []);
});

test('il filtro Lavori conserva ACTIVE e PAUSED tra gli attivi e gli stati terminali tra i conclusi', () => {
  assert.equal(matchesJobListFilter('ACTIVE', 'ACTIVE'), true);
  assert.equal(matchesJobListFilter('PAUSED', 'ACTIVE'), true);
  assert.equal(matchesJobListFilter('COMPLETED', 'COMPLETED'), true);
  assert.equal(matchesJobListFilter('CANCELLED', 'COMPLETED'), true);
  assert.equal(matchesJobListFilter('PAUSED', 'COMPLETED'), false);
});

test('il badge usa una sola presentazione semantica per ogni stato Job', () => {
  assert.deepEqual(jobStatusPresentation('ACTIVE'), { label: 'Attivo', tone: 'success' });
  assert.deepEqual(jobStatusPresentation('PAUSED'), { label: 'In pausa', tone: 'warning' });
  assert.deepEqual(jobStatusPresentation('COMPLETED'), { label: 'Concluso', tone: 'neutral' });
  assert.deepEqual(jobStatusPresentation('CANCELLED'), { label: 'Annullato', tone: 'danger' });
});
