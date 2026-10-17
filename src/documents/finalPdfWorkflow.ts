import { loadDocumentExport, loadIssuedSnapshot, saveDocumentExport } from '../database';
import { File } from 'expo-file-system';
import { resolveIssuedPdf } from './issuedPdfAccess';
import { generateFinalPdf } from './pdfService';
import { generatePdfForIssuedQuote } from './documentWorkflow';

export function generateStoredFinalPdf(quoteId:string) {
  return generatePdfForIssuedQuote(quoteId,{loadSnapshot:loadIssuedSnapshot,generate:generateFinalPdf,save:saveDocumentExport});
}

export function openIssuedPdf(quoteId: string) {
  return resolveIssuedPdf(quoteId, {
    loadDocument: loadDocumentExport,
    isLocalFileAvailable: (uri) => new File(uri).exists,
    renderFromImmutableSnapshot: generateStoredFinalPdf,
  });
}
