import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';
import { loadDocumentExport, loadIssuedSnapshot } from '../database';
import { buildFinalDocumentModel } from './documentModel';
import { issuedExportName } from './pdfNaming';

export async function prepareFinalPdfForShare(quoteId:string) {
  const record=await loadDocumentExport(quoteId); if(!record?.fileUri||record.status!=='ready') throw new Error('PDF definitivo non disponibile. Rigeneralo prima di esportarlo.');
  const source=new File(record.fileUri); if(!source.exists) throw new Error('Il file PDF definitivo non è più disponibile sul dispositivo.');
  const model=buildFinalDocumentModel(await loadIssuedSnapshot(quoteId)); const directory=new Directory(Paths.cache,'quotivo-share'); if(!directory.exists) directory.create({intermediates:true});
  const destination=new File(directory,issuedExportName('pdf',model.numberLabel,model.client)); if(destination.exists) destination.delete(); await source.copy(destination); return destination.uri;
}
export async function shareDocument(uri:string,mimeType:string,title:string) {
  if(!await Sharing.isAvailableAsync()) throw new Error('La condivisione non è disponibile su questo dispositivo.');
  await Sharing.shareAsync(uri,{mimeType,dialogTitle:title,UTI:mimeType});
}
export async function shareQuoteLink(url:string) {
  await Share.share({ message:url, url, title:'Invia con Quotivo' },{ dialogTitle:'Invia con Quotivo' });
}
