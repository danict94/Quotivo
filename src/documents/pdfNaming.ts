import { STANDARD_RENDERER_VERSION } from './documentModel';
export function safeFilePart(value:string) { const clean=value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60); return clean||'documento'; }
export function draftPdfName(quoteId:string) { return `bozza-${safeFilePart(quoteId)}.pdf`; }
export function finalPdfName(quoteId:string,number:number,year:number|null) { return `preventivo-${year??'storico'}-${number}-${safeFilePart(quoteId)}-${STANDARD_RENDERER_VERSION}.pdf`; }
export function issuedExportName(extension:'pdf'|'docx',numberLabel:string|null,client:string) { return `Preventivo-${safeFilePart(numberLabel??'senza-numero')}-${safeFilePart(client)}.${extension}`; }
