import { loadIssuedSnapshot } from '../database';
import { buildFinalDocumentModel } from './documentModel';
import { generateFinalDocx } from './docxService';
export async function generateStoredFinalDocx(quoteId:string) { return generateFinalDocx(buildFinalDocumentModel(await loadIssuedSnapshot(quoteId))); }
