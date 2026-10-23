import { loadIssuedSnapshot, saveIssuedDocxExport } from '../database';
import { buildFinalDocumentModel } from './documentModel';
import { generateFinalDocx } from './docxService';
export async function generateStoredFinalDocx(quoteId:string) { const uri=await generateFinalDocx(buildFinalDocumentModel(await loadIssuedSnapshot(quoteId))); await saveIssuedDocxExport({quoteId,rendererVersion:'docx-v1',fileUri:uri,status:'ready',errorMessage:null}); return uri; }
