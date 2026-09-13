import { loadIssuedSnapshot, saveDocumentExport } from '../database';
import { generateFinalPdf } from './pdfService';
import { generatePdfForIssuedQuote } from './documentWorkflow';

export function generateStoredFinalPdf(quoteId:string) {
  return generatePdfForIssuedQuote(quoteId,{loadSnapshot:loadIssuedSnapshot,generate:generateFinalPdf,save:saveDocumentExport});
}
