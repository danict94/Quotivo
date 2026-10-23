import { loadDocumentExport, loadIssuedSnapshot, saveDocumentExport } from '../database';
import { File } from 'expo-file-system';
import { resolveIssuedPdf } from './issuedPdfAccess';
import { generateFinalPdf } from './pdfService';
import { generatePdfForIssuedQuote } from './documentWorkflow';
import { ensureRemoteIssuedDocument } from '../features/file-durability/fileDurabilityRuntime';

export function generateStoredFinalPdf(quoteId:string) {
  return generatePdfForIssuedQuote(quoteId,{loadSnapshot:loadIssuedSnapshot,generate:generateFinalPdf,save:saveDocumentExport});
}

export async function openIssuedPdf(quoteId: string) {
  const remoteUri=await ensureRemoteIssuedDocument(quoteId,'PDF');
  if(remoteUri)return {uri:remoteUri,source:'persisted-document' as const,recoveredFrom:null};
  return resolveIssuedPdf(quoteId, {
    loadDocument: loadDocumentExport,
    isLocalFileAvailable: (uri) => new File(uri).exists,
    renderFromImmutableSnapshot: generateStoredFinalPdf,
  });
}
