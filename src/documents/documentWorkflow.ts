import { buildFinalDocumentModel, STANDARD_RENDERER_VERSION } from './documentModel';

export type FinalPdfGateway={loadSnapshot:(quoteId:string)=>Promise<unknown>;generate:(model:ReturnType<typeof buildFinalDocumentModel>,number:number,year:number|null)=>Promise<string>;save:(record:{quoteId:string;rendererVersion:string;fileUri:string|null;status:'ready'|'failed';errorMessage:string|null})=>Promise<void>};

export async function generatePdfForIssuedQuote(quoteId:string,gateway:FinalPdfGateway) {
  try { const snapshot=await gateway.loadSnapshot(quoteId); const model=buildFinalDocumentModel(snapshot); const raw=snapshot as {number:number;numberYear:number|null}; const fileUri=await gateway.generate(model,raw.number,raw.numberYear); await gateway.save({quoteId,rendererVersion:STANDARD_RENDERER_VERSION,fileUri,status:'ready',errorMessage:null}); return fileUri; }
  catch(error){ const message=error instanceof Error?error.message:'Errore PDF sconosciuto.'; await gateway.save({quoteId,rendererVersion:STANDARD_RENDERER_VERSION,fileUri:null,status:'failed',errorMessage:message}); throw error; }
}
