import { buildFinalDocumentModel, STANDARD_RENDERER_VERSION } from './documentModel';
import { IssuedPdfError } from './issuedPdfAccess';

export type FinalPdfGateway={loadSnapshot:(quoteId:string)=>Promise<unknown>;generate:(model:ReturnType<typeof buildFinalDocumentModel>,number:number,year:number|null)=>Promise<string>;save:(record:{quoteId:string;rendererVersion:string;fileUri:string|null;status:'ready'|'failed';errorMessage:string|null})=>Promise<void>};

export async function generatePdfForIssuedQuote(quoteId:string,gateway:FinalPdfGateway) {
  let snapshot: unknown;
  try { snapshot = await gateway.loadSnapshot(quoteId); }
  catch (error) {
    const failure = new IssuedPdfError('ISSUED_SNAPSHOT_NOT_FOUND', 'Lo snapshot del preventivo emesso non è disponibile.', { cause: error });
    await gateway.save({quoteId,rendererVersion:STANDARD_RENDERER_VERSION,fileUri:null,status:'failed',errorMessage:failure.code});
    throw failure;
  }
  try {
    const model=buildFinalDocumentModel(snapshot); const raw=snapshot as {number:number;numberYear:number|null}; const fileUri=await gateway.generate(model,raw.number,raw.numberYear);
    await gateway.save({quoteId,rendererVersion:STANDARD_RENDERER_VERSION,fileUri,status:'ready',errorMessage:null}); return fileUri;
  } catch(error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
    const failure = error instanceof IssuedPdfError ? error : new IssuedPdfError('PDF_RENDER_FAILED', `Non è stato possibile generare il PDF emesso.${detail}`, { cause: error });
    await gateway.save({quoteId,rendererVersion:STANDARD_RENDERER_VERSION,fileUri:null,status:'failed',errorMessage:failure.code});
    throw failure;
  }
}
