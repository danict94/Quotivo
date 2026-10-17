import assert from 'node:assert/strict';
import test from 'node:test';

import { generatePdfForIssuedQuote } from '../src/documents/documentWorkflow';
import { IssuedPdfError, resolveIssuedPdf } from '../src/documents/issuedPdfAccess';

test('PDF emesso usa prima il documento locale persistito', async () => {
  const result = await resolveIssuedPdf('quote-1', {
    loadDocument: async () => ({ status: 'ready', fileUri: 'file://issued.pdf' }),
    isLocalFileAvailable: () => true,
    renderFromImmutableSnapshot: async () => { throw new Error('non deve rigenerare'); },
  });
  assert.deepEqual(result, { uri: 'file://issued.pdf', source: 'persisted-document', recoveredFrom: null });
});

test('assenza del documento locale rigenera esclusivamente dallo snapshot immutabile', async () => {
  const result = await resolveIssuedPdf('quote-1', {
    loadDocument: async () => null,
    isLocalFileAvailable: () => false,
    renderFromImmutableSnapshot: async () => 'file://rebuilt.pdf',
  });
  assert.deepEqual(result, { uri: 'file://rebuilt.pdf', source: 'immutable-snapshot', recoveredFrom: 'ISSUED_DOCUMENT_NOT_FOUND' });
});

test('file emesso non più disponibile viene ricostruito dallo snapshot, senza rete', async () => {
  const result = await resolveIssuedPdf('quote-1', {
    loadDocument: async () => ({ status: 'ready', fileUri: 'file://missing.pdf' }),
    isLocalFileAvailable: () => false,
    renderFromImmutableSnapshot: async () => 'file://rebuilt.pdf',
  });
  assert.equal(result.recoveredFrom, 'LOCAL_FILE_UNAVAILABLE');
  assert.equal(result.uri, 'file://rebuilt.pdf');
});

test('rigenerazione distingue snapshot emesso assente e renderer fallito', async () => {
  const saved: Array<{ status: string; errorMessage: string | null }> = [];
  await assert.rejects(
    () => generatePdfForIssuedQuote('quote-1', { loadSnapshot: async () => { throw new Error('missing'); }, generate: async () => 'file://never.pdf', save: async (record) => { saved.push(record); } }),
    (error: unknown) => error instanceof IssuedPdfError && error.code === 'ISSUED_SNAPSHOT_NOT_FOUND',
  );
  await assert.rejects(
    () => generatePdfForIssuedQuote('quote-1', { loadSnapshot: async () => ({ number: 1, numberYear: 2026 }), generate: async () => { throw new Error('render'); }, save: async (record) => { saved.push(record); } }),
    (error: unknown) => error instanceof IssuedPdfError && error.code === 'PDF_RENDER_FAILED',
  );
  assert.deepEqual(saved.map((record) => record.errorMessage), ['ISSUED_SNAPSHOT_NOT_FOUND', 'PDF_RENDER_FAILED']);
});
