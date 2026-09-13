import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import { A4_POINTS, renderStandardHtml } from './standardRenderer';
import { StandardDocumentModel } from './documentModel';
import { draftPdfName, finalPdfName } from './pdfNaming';

async function renderToCache(model:StandardDocumentModel) {
  const result=await Print.printToFileAsync({html:renderStandardHtml(model),width:A4_POINTS.width,height:A4_POINTS.height,base64:false});
  const file=new File(result.uri); if (!file.exists || file.size < 100) throw new Error('Il renderer non ha prodotto un PDF valido.');
  return file;
}
export async function generateDraftPdf(model:StandardDocumentModel) {
  const rendered=await renderToCache(model); const directory=new Directory(Paths.cache,'quotivo-drafts'); if(!directory.exists) directory.create({intermediates:true});
  const destination=new File(directory,draftPdfName(model.quoteId)); if(destination.exists) destination.delete(); await rendered.move(destination); return destination.uri;
}
export async function generateFinalPdf(model:StandardDocumentModel,number:number,year:number|null) {
  const rendered=await renderToCache(model); const directory=new Directory(Paths.document,'issued-pdfs'); if(!directory.exists) directory.create({intermediates:true});
  const destination=new File(directory,finalPdfName(model.quoteId,number,year));
  if(destination.exists) { if(rendered.exists)rendered.delete(); return destination.uri; }
  try { await rendered.move(destination); return destination.uri; } catch(error) { if(destination.exists) destination.delete(); if(rendered.exists)rendered.delete(); throw error; }
}
export function removeDraftPdf(uri:string|null) { if(!uri)return; const file=new File(uri); const directory=new Directory(Paths.cache,'quotivo-drafts'); if(file.exists&&file.parentDirectory.uri===directory.uri) file.delete(); }
