import { Packer } from 'docx';
import { Directory, EncodingType, File, Paths } from 'expo-file-system';
import { StandardDocumentModel } from './documentModel';
import { createDocxDocument } from './docxDocument';
import { issuedExportName } from './pdfNaming';

/** @public Re-export di compatibilità per i consumatori del servizio DOCX. */
export { createDocxDocument } from './docxDocument';
export async function generateFinalDocx(model:StandardDocumentModel) {
  const base64=await Packer.toBase64String(createDocxDocument(model)); const directory=new Directory(Paths.document,'issued-docx'); if(!directory.exists) directory.create({intermediates:true});
  const destination=new File(directory,issuedExportName('docx',model.numberLabel,model.client)); if(destination.exists) destination.delete(); destination.create({intermediates:true}); destination.write(base64,{encoding:EncodingType.Base64});
  if(!destination.exists||destination.size<100) throw new Error('Il generatore non ha prodotto un DOCX valido.'); return destination.uri;
}
