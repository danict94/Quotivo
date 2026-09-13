import { AlignmentType, BorderStyle, Document, HeadingLevel, PageOrientation, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType } from 'docx';
import { formatMoney, itemTotalCents, QuoteItem } from '../domain';
import { StandardDocumentModel } from './documentModel';

const A4_WIDTH=11906;
const A4_HEIGHT=16838;
const PAGE_MARGIN=720;
const CONTENT_WIDTH=A4_WIDTH-PAGE_MARGIN*2;
const withVat=[4700,837,733,1413,733,2050] as const;
const withoutVat=[5233,942,837,1570,1884] as const;
const cellMargins={top:80,bottom:80,left:110,right:110};
const borders={top:{style:BorderStyle.SINGLE,size:4,color:'D5DAD7'},bottom:{style:BorderStyle.SINGLE,size:4,color:'D5DAD7'},left:{style:BorderStyle.SINGLE,size:4,color:'E1E4E2'},right:{style:BorderStyle.SINGLE,size:4,color:'E1E4E2'}};

const paragraph=(value:string,bold=false,options:{alignment?:typeof AlignmentType[keyof typeof AlignmentType];spaceBefore?:number;spaceAfter?:number;size?:number}={})=>new Paragraph({alignment:options.alignment,spacing:{before:options.spaceBefore??0,after:options.spaceAfter??90,line:260},children:[new TextRun({text:value,bold,size:options.size})]});
const heading=(value:string)=>new Paragraph({text:value,heading:HeadingLevel.HEADING_2,spacing:{before:240,after:100}});
const field=(label:string,value:string)=>paragraph(`${label}: ${value}`,false,{spaceAfter:55});
const tableCell=(value:string,width:number,bold=false,alignment:typeof AlignmentType[keyof typeof AlignmentType]=AlignmentType.LEFT)=>new TableCell({width:{size:width,type:WidthType.DXA},verticalAlign:VerticalAlign.TOP,margins:cellMargins,borders,children:[paragraph(value,bold,{alignment,spaceAfter:0})]});
const vat=(item:QuoteItem)=>item.vatTreatment==='rate'?`${(item.vatRateBasisPoints??0)/100}%`:'N/A';
const amount=(model:StandardDocumentModel,item:QuoteItem)=>model.baseEconomics.lines.find((line)=>line.id===item.id)?.netCents??itemTotalCents(item);

function itemCell(item:QuoteItem,index:number,width:number) {
  const detailLines=[item.shortDescription,item.technicalDetails&&`Dettagli: ${item.technicalDetails}`,item.inclusions&&`Inclusioni: ${item.inclusions}`,item.exclusions&&`Esclusioni: ${item.exclusions}`].filter(Boolean) as string[];
  return new TableCell({width:{size:width,type:WidthType.DXA},verticalAlign:VerticalAlign.TOP,margins:cellMargins,borders,children:[paragraph(`${index+1}. ${item.description}`,true,{spaceAfter:detailLines.length?55:0}),...detailLines.map((line)=>paragraph(line,false,{spaceAfter:45}))]});
}

function workRows(model:StandardDocumentModel,items:QuoteItem[],showVat:boolean,widths:readonly number[]) {
  const labels=showVat?['Lavorazione','Q.tà','U.M.','Prezzo','IVA','Importo']:['Lavorazione','Q.tà','U.M.','Prezzo','Importo'];
  const header=new TableRow({tableHeader:true,children:labels.map((label,index)=>tableCell(label,widths[index],true,index===0?AlignmentType.LEFT:AlignmentType.RIGHT))});
  const data=items.map((item,index)=>{
    const itemCells=item.priceMode==='body'
      ? [itemCell(item,index,widths[0]),tableCell('A corpo',widths[1],false,AlignmentType.RIGHT),tableCell('',widths[2]),tableCell('',widths[3]),...(showVat?[tableCell(vat(item),widths[4],false,AlignmentType.RIGHT)]:[]),tableCell(formatMoney(amount(model,item)),widths[widths.length-1],false,AlignmentType.RIGHT)]
      : [itemCell(item,index,widths[0]),tableCell(String(item.quantityScaled/10000).replace('.',','),widths[1],false,AlignmentType.RIGHT),tableCell(item.unit,widths[2]),tableCell(formatMoney(item.unitPriceCents),widths[3],false,AlignmentType.RIGHT),...(showVat?[tableCell(vat(item),widths[4],false,AlignmentType.RIGHT)]:[]),tableCell(formatMoney(amount(model,item)),widths[widths.length-1],false,AlignmentType.RIGHT)];
    return new TableRow({children:itemCells});
  });
  return [header,...data];
}

function fixedTable(rows:TableRow[],widths:readonly number[]) {
  return new Table({width:{size:CONTENT_WIDTH,type:WidthType.DXA},columnWidths:widths,layout:TableLayoutType.FIXED,margins:cellMargins,borders,rows});
}

function businessRows(model:StandardDocumentModel) {
  return [model.business.address,model.business.vatNumber&&`P. IVA: ${model.business.vatNumber}`,model.business.taxId&&`CF: ${model.business.taxId}`,model.business.email&&`Email: ${model.business.email}`,model.business.phone&&`Telefono: ${model.business.phone}`].filter(Boolean) as string[];
}

export function createDocxDocument(model:StandardDocumentModel) {
  const printable=model.items.filter((item)=>item.confirmed!==false&&item.description.trim());
  const base=printable.filter((item)=>!item.isOptional);
  const options=printable.filter((item)=>item.isOptional);
  const showVat=new Set(base.map((item)=>`${item.vatTreatment}:${item.vatRateBasisPoints??''}:${item.vatNote}`)).size>1;
  const widths=showVat?withVat:withoutVat;
  const clientFields=[model.clientContactName&&['Referente',model.clientContactName],model.clientAddress&&['Indirizzo',model.clientAddress],model.clientTaxId&&['CF',model.clientTaxId],model.clientVatNumber&&['P. IVA',model.clientVatNumber],model.clientPhone&&['Telefono',model.clientPhone],model.clientEmail&&['Email',model.clientEmail]].filter(Boolean) as [string,string][];
  const summaryLines=[`Subtotale: ${formatMoney(model.baseEconomics.subtotalCents)}`,model.baseEconomics.lineDiscountCents?`Sconti righe: − ${formatMoney(model.baseEconomics.lineDiscountCents)}`:'',model.baseEconomics.globalDiscountCents?`Sconto globale: − ${formatMoney(model.baseEconomics.globalDiscountCents)}`:'',...model.baseEconomics.vatGroups.flatMap((group)=>[group.treatment==='rate'?`Imponibile IVA ${(group.rateBasisPoints??0)/100}%: ${formatMoney(group.netCents)}`:`Importi senza IVA: ${formatMoney(group.netCents)}`,group.vatCents?`IVA ${(group.rateBasisPoints??0)/100}%: ${formatMoney(group.vatCents)}`:'']),`TOTALE: ${formatMoney(model.baseEconomics.totalCents)}`].filter(Boolean) as string[];
  const headerRows=[new TableRow({children:[new TableCell({width:{size:7300,type:WidthType.DXA},margins:cellMargins,borders:{},children:[paragraph(model.business.businessName||'Attività',true,{size:30,spaceAfter:65}),...businessRows(model).map((line)=>paragraph(line,false,{spaceAfter:45}))]}),new TableCell({width:{size:3166,type:WidthType.DXA},margins:cellMargins,borders:{},children:[paragraph(`PREVENTIVO ${model.numberLabel?`N. ${model.numberLabel}`:'SENZA NUMERO'}`,true,{alignment:AlignmentType.RIGHT,spaceAfter:65}),paragraph(`Data: ${model.issueDate}`,false,{alignment:AlignmentType.RIGHT,spaceAfter:45}),paragraph(`Valido fino al: ${model.validUntil}`,false,{alignment:AlignmentType.RIGHT,spaceAfter:0})]})]})];
  return new Document({creator:'Quotivo',title:`Preventivo ${model.numberLabel??''}`,sections:[{properties:{page:{size:{width:A4_WIDTH,height:A4_HEIGHT,orientation:PageOrientation.PORTRAIT},margin:{top:PAGE_MARGIN,right:PAGE_MARGIN,bottom:PAGE_MARGIN,left:PAGE_MARGIN,header:360,footer:360,gutter:0}}},children:[
    fixedTable(headerRows,[7300,3166]),heading('CLIENTE'),paragraph(model.client||'Cliente da completare',true,{spaceAfter:65}),...clientFields.map(([label,value])=>field(label,value)),
    ...(model.siteAddress?[heading('CANTIERE'),paragraph(model.siteAddress===model.clientAddress?'Come indirizzo cliente':`Indirizzo: ${model.siteAddress}`,false,{spaceAfter:90})]:[]),
    heading('OGGETTO'),paragraph(model.title||'Oggetto da completare',true,{spaceAfter:model.introduction?65:110}),...(model.introduction?[paragraph(model.introduction,false,{spaceAfter:110})]:[]),
    heading('LAVORAZIONI'),fixedTable(workRows(model,base,showVat,widths),widths),heading('RIEPILOGO ECONOMICO'),...summaryLines.map((line,index)=>paragraph(line,index===summaryLines.length-1,{alignment:AlignmentType.RIGHT,spaceAfter:50})),
    ...(options.length?[heading('OPZIONI NON INCLUSE NEL TOTALE'),...options.map((item,index)=>paragraph(`${index+1}. ${item.description} — ${formatMoney(itemTotalCents(item))} + IVA`,false,{spaceAfter:55}))]:[]),
    ...(model.conditions?[heading('CONDIZIONI'),paragraph(model.conditions,false,{spaceAfter:90})]:[]),...(model.paymentTerms?[heading('PAGAMENTI'),paragraph(model.paymentTerms,false,{spaceAfter:90})]:[]),paragraph('Luogo e data ____________________     Firma per accettazione ____________________',false,{spaceBefore:280,spaceAfter:0}),
  ]}]});
}
