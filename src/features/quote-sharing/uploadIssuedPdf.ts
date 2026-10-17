import { File } from 'expo-file-system';
import { loadDocumentExport } from '../../database';
import { generateStoredFinalPdf } from '../../documents/finalPdfWorkflow';
import { QuoteSharingRepository } from './QuoteSharingRepository';

const base64 = (bytes: Uint8Array) => { let text=''; for(let offset=0;offset<bytes.length;offset+=0x8000) text+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000)); return btoa(text); };

export async function ensureIssuedPdfUploaded(repository:QuoteSharingRepository,quoteId:string,issuanceId:string) {
  if(await repository.documentStatus(issuanceId)) return;
  const existing=await loadDocumentExport(quoteId);
  const uri=existing?.status==='ready'&&existing.fileUri&&new File(existing.fileUri).exists ? existing.fileUri : await generateStoredFinalPdf(quoteId);
  const bytes=await new File(uri).bytes();
  await repository.uploadDocument({issuanceId,pdfBase64:base64(bytes),sizeBytes:bytes.length});
}
