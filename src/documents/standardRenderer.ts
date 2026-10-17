import { formatMoney, itemTotalCents, QuoteItem } from '../domain';
import { StandardDocumentModel } from './documentModel';

export const A4_POINTS={width:595.28,height:841.89} as const;
type PageBlock={html:string;units:number;kind:'work'|'closing'};
type TableRow={html:string;units:number};
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const lines=(value:string)=>escape(value).replace(/\r?\n/g,'<br>');
const quantity=(scaled:number)=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:4}).format(scaled/10000);
const vat=(item:QuoteItem)=>item.vatTreatment==='not_applied'?'N/A':`${(item.vatRateBasisPoints??0)/100}%`;

function detail(label:string,value:string,className='item-detail') {
  return value.trim()?`<div class="${className}"><b>${label}:</b> ${lines(value)}</div>`:'';
}
function rowHtml(item:QuoteItem,index:number,amount:number) {
  const details=`${item.shortDescription.trim()?`<div class="item-desc">${lines(item.shortDescription)}</div>`:''}${detail('Dettagli',item.technicalDetails)}${detail('Incluso',item.inclusions,'item-inclusion')}${detail('Escluso',item.exclusions,'item-exclusion')}`;
  const discount=item.lineDiscountBasisPoints?`<div class="item-discount">Sconto ${(item.lineDiscountBasisPoints/100).toLocaleString('it-IT')}%</div>`:'';
  if(item.priceMode==='body') return `<tr class="work-row"><td><div class="item-title">${index+1}. ${escape(item.description)}</div>${details}</td><td colspan="3" class="body-mode"><span>A corpo</span></td><td class="vat-cell">${vat(item)}</td><td class="money">${formatMoney(amount)}</td></tr>`;
  return `<tr class="work-row"><td><div class="item-title">${index+1}. ${escape(item.description)}</div>${details}</td><td>${quantity(item.quantityScaled)}</td><td>${escape(item.unit)}</td><td class="money">${formatMoney(item.unitPriceCents)}${discount}</td><td class="vat-cell">${vat(item)}</td><td class="money">${formatMoney(amount)}</td></tr>`;
}
function continuationRowHtml(text:string) {
  return `<tr class="work-row continuation-row"><td colspan="6"><b>Dettagli (continua):</b><div>${lines(text)}</div></td></tr>`;
}
function tableHtml(title:string,rows:string[],showVat=true) {
  return `<section class="work-group"><h3>${escape(title)}</h3><table class="work-table ${showVat?'':'single-vat'}"><colgroup><col class="voice"><col class="qty"><col class="unit"><col class="price"><col class="vat"><col class="amount"></colgroup><thead><tr><th>Lavorazione</th><th>Q.tà</th><th>U.M.</th><th>Prezzo</th><th>IVA</th><th>Importo</th></tr></thead><tbody>${rows.join('')}</tbody></table></section>`;
}

// Unità stampabili prudenti, già al netto di header, intro e footer.
function estimatedRowHeight(item:QuoteItem) {
  const fieldLines=(value:string,label=false)=>value.trim()?Math.ceil(value.trim().length/42)+(label?1:0):0;
  const titleLines=Math.max(1,Math.ceil(item.description.trim().length/42));
  const detailLines=fieldLines(item.shortDescription)+fieldLines(item.technicalDetails,true)+fieldLines(item.inclusions,true)+fieldLines(item.exclusions,true);
  return 9+titleLines*3.8+detailLines*3.6+(item.inclusions.trim()?2:0)+(item.exclusions.trim()?2:0);
}
function splitText(value:string,limit:number) {
  const normalized=value.trim(); if(!normalized)return [];
  const chunks:string[]=[]; let current='';
  for(const word of normalized.split(/(\s+)/)) {
    if(current.length&&current.length+word.length>limit) { chunks.push(current.trim()); current=word; } else current+=word;
  }
  if(current.trim())chunks.push(current.trim());
  return chunks;
}
function tableRows(item:QuoteItem,index:number,amount:number):TableRow[] {
  const rowHeight=estimatedRowHeight(item);
  if(rowHeight<=94)return [{html:rowHtml(item,index,amount),units:rowHeight}];
  const title=item.description.trim();
  const titlePreview=title.length>220?`${title.slice(0,217).trimEnd()}…`:title;
  const compact={...item,description:titlePreview,shortDescription:'',technicalDetails:'',inclusions:'',exclusions:''};
  const details=[
    title.length>220&&`Descrizione: ${title}`,
    item.shortDescription.trim()&&`Descrizione breve: ${item.shortDescription.trim()}`,
    item.technicalDetails.trim()&&`Dettagli: ${item.technicalDetails.trim()}`,
    item.inclusions.trim()&&`Incluso: ${item.inclusions.trim()}`,
    item.exclusions.trim()&&`Escluso: ${item.exclusions.trim()}`,
  ].filter((value):value is string=>Boolean(value));
  return [{html:rowHtml(compact,index,amount),units:estimatedRowHeight(compact)},...splitText(details.join('\n'),520).map((text)=>({html:continuationRowHtml(text),units:10+Math.ceil(text.length/42)*3.8}))];
}

export function paginateWorkItems(items:QuoteItem[],amounts:Map<string,number>,firstCapacity=122,nextCapacity=205,showVat=true):PageBlock[][] {
  const pages:PageBlock[][]=[[]]; const tableOverhead=14; let capacity=firstCapacity; let used=tableOverhead; let rows:string[]=[];
  const flush=()=>{ if(!rows.length)return; pages[pages.length-1].push({html:tableHtml('Lavorazioni',rows,showVat),units:used,kind:'work'}); rows=[]; };
  items.forEach((item,index)=>tableRows(item,index,amounts.get(item.id)??0).forEach((row)=>{
    if(rows.length&&used+row.units>capacity){ flush(); pages.push([]); capacity=nextCapacity; used=tableOverhead; }
    rows.push(row.html); used+=row.units;
  }));
  flush(); return pages;
}

function header(model:StandardDocumentModel,compact=false) {
  const logo=!compact&&model.business.logoDataBase64&&model.business.logoMimeType?`<img class="logo" src="data:${escape(model.business.logoMimeType)};base64,${model.business.logoDataBase64}">`:'';
  const revision=model.mode==='final'&&model.revisionNumber>0;
  const documentTitle=revision?`Preventivo ${model.numberLabel} — Revisione ${model.revisionNumber}`:model.numberLabel?`N. ${model.numberLabel}`:'SENZA NUMERO';
  const dates=revision?`<p>Documento revisionato: Rev. ${escape(model.replacedRevisionNumber)} del ${escape(model.replacedIssueDate)}<br>Data emissione originale ${escape(model.originalIssueDate)}<br>Data revisione ${escape(model.revisionDate)}<br>Valido fino al ${escape(model.validUntil)}</p>`:`<p>Data ${escape(model.issueDate)}<br>Valido fino al ${escape(model.validUntil)}</p>`;
  return `<header class="header ${compact?'compact':''}"><div class="brand">${logo}<div><h1>${escape(model.business.businessName)||'Attività da completare'}</h1>${compact?`<p>${escape(model.title)} · ${escape(model.client)}</p>`:`<p>${escape(model.business.address)} ${escape(model.business.postalCode)} ${escape(model.business.city)}</p><p>${escape(model.business.vatNumber?`P.IVA ${model.business.vatNumber}`:'')} ${escape(model.business.taxId?`C.F. ${model.business.taxId}`:'')}</p><p>${escape(model.business.email)} ${escape(model.business.phone)}</p>`}</div></div><div class="doc-meta">${model.mode==='draft'?'<span class="status">Anteprima bozza</span>':''}<small>PREVENTIVO</small><strong>${escape(documentTitle)}</strong>${compact?'':dates}</div></header>`;
}
function firstPageIntro(model:StandardDocumentModel) {
  const clientDetails=[model.clientAddress&&`Indirizzo: ${escape(model.clientAddress)}`,model.clientTaxId&&`CF: ${escape(model.clientTaxId)}`,model.clientVatNumber&&`P. IVA: ${escape(model.clientVatNumber)}`,model.clientPhone&&`Telefono: ${escape(model.clientPhone)}`,model.clientEmail&&`Email: ${escape(model.clientEmail)}`].filter(Boolean).map((value)=>`<p>${value}</p>`).join('');
  const sameSite=Boolean(model.siteAddress&&model.clientAddress&&model.siteAddress.trim()===model.clientAddress.trim());
  return `<section class="info-grid"><div><small>CLIENTE</small><strong>${escape(model.client)||'Cliente da completare'}</strong>${model.clientContactName?`<p>Referente: ${escape(model.clientContactName)}</p>`:''}${clientDetails}</div>${model.siteAddress?`<div><small>CANTIERE</small><strong>${sameSite?'Come indirizzo cliente':`Indirizzo: ${escape(model.siteAddress)}`}</strong></div>`:''}</section><section class="subject"><small>OGGETTO</small><h2>${escape(model.title)||'Oggetto da completare'}</h2>${model.introduction?`<p>${lines(model.introduction)}</p>`:''}</section><div class="section-heading"><h2>Lavorazioni</h2><span>Importi IVA esclusa</span></div>`;
}
function summaryHtml(model:StandardDocumentModel) {
  const groups=model.baseEconomics.vatGroups.map((g)=>`<div class="sum-row"><span>${g.treatment==='not_applied'?'Importi senza IVA':`Imponibile IVA ${(g.rateBasisPoints??0)/100}%`}</span><span>${formatMoney(g.netCents)}</span></div>${g.vatCents?`<div class="sum-row"><span>IVA ${(g.rateBasisPoints??0)/100}%</span><span>${formatMoney(g.vatCents)}</span></div>`:''}`).join('');
  return `<section class="summary"><h3>Riepilogo economico</h3><div class="sum-row"><span>Subtotale</span><span>${formatMoney(model.baseEconomics.subtotalCents)}</span></div>${model.baseEconomics.lineDiscountCents?`<div class="sum-row"><span>Sconti righe</span><span>− ${formatMoney(model.baseEconomics.lineDiscountCents)}</span></div>`:''}${model.baseEconomics.globalDiscountCents?`<div class="sum-row"><span>Sconto globale</span><span>− ${formatMoney(model.baseEconomics.globalDiscountCents)}</span></div>`:''}${groups}<div class="sum-row total"><span>Totale</span><span>${formatMoney(model.baseEconomics.totalCents)}</span></div></section>`;
}
function optionHtml(item:QuoteItem,index:number) {
  return `<section class="options"><h3>${index===0?'Opzioni non incluse nel totale':'Opzioni non incluse nel totale (continua)'}</h3><article class="option"><div><b>${index+1}. ${escape(item.description)}</b>${item.shortDescription?`<p>${lines(item.shortDescription)}</p>`:''}</div><strong>${formatMoney(itemTotalCents(item))} + IVA</strong></article></section>`;
}
function termsHtml(title:string,text:string,continued:boolean) { return `<section class="terms"><h3>${escape(title)}${continued?' (continua)':''}</h3><div>${lines(text)}</div></section>`; }
function closingBlocks(model:StandardDocumentModel,options:QuoteItem[]):PageBlock[] {
  const blocks:PageBlock[]=[{html:summaryHtml(model),units:52,kind:'closing'}];
  options.forEach((item,index)=>blocks.push({html:optionHtml(item,index),units:17+Math.ceil((item.description.length+item.shortDescription.length)/42)*3.8,kind:'closing'}));
  for(const [title,text] of [['Condizioni',model.conditions],['Pagamenti',model.paymentTerms]] as const) splitText(text,650).forEach((chunk,index)=>blocks.push({html:termsHtml(title,chunk,index>0),units:12+Math.ceil(chunk.length/42)*3.8,kind:'closing'}));
  blocks.push({html:'<section class="acceptance"><div>Luogo e data<span></span></div><div>Firma per accettazione<span></span></div></section>',units:30,kind:'closing'});
  return blocks;
}
function appendBlock(pages:PageBlock[][],block:PageBlock) {
  let page=pages[pages.length-1]; const capacity=pages.length===1?122:205; const used=page.reduce((sum,current)=>sum+current.units,0);
  if(page.length&&used+block.units>capacity) { page=[]; pages.push(page); }
  page.push(block);
}

export function renderStandardHtml(model:StandardDocumentModel) {
  const printable=model.items.filter((item)=>item.confirmed!==false&&item.description.trim()); const baseItems=printable.filter((item)=>!item.isOptional); const options=printable.filter((item)=>item.isOptional);
  const amounts=new Map(model.baseEconomics.lines.map((line)=>[line.id,line.netCents])); const vatKinds=new Set(baseItems.map((item)=>`${item.vatTreatment}:${item.vatRateBasisPoints??''}:${item.vatNote}`)); const pages=paginateWorkItems(baseItems,amounts,122,205,vatKinds.size>1);
  closingBlocks(model,options).forEach((block)=>appendBlock(pages,block));
  const total=pages.length;
  const footerTitle=model.mode==='draft'?'Preventivo in bozza':model.revisionNumber>0?`Preventivo ${model.numberLabel} — Revisione ${model.revisionNumber}`:`Preventivo ${model.numberLabel}`;
  const sheets=pages.map((blocks,index)=>`<section class="sheet">${model.mode==='draft'?'<div class="watermark">BOZZA</div>':''}${header(model,index>0)}<main>${index===0?firstPageIntro(model):''}${blocks.map((block)=>block.html).join('')}</main><footer><span>${escape(model.business.businessName)} · ${escape(footerTitle)}</span><span>Pagina ${index+1} di ${total}</span></footer></section>`).join('');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>
  @page{size:210mm 297mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#202523;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:9.4pt;line-height:1.45}.sheet{position:relative;width:210mm;height:297mm;padding:14mm 14mm 20mm;page-break-after:always;overflow:hidden}.sheet:last-child{page-break-after:auto}.header{display:flex;justify-content:space-between;gap:14mm;padding-bottom:6mm;border-bottom:1.3px solid #24332d}.header.compact{padding-bottom:4mm}.brand{display:flex;gap:4mm}.logo{width:16mm;height:16mm;object-fit:contain}.brand h1{margin:0 0 1mm;font-size:16pt;color:#263a32}.brand p,.doc-meta p{margin:.5mm 0;color:#69726e;font-size:8.3pt}.doc-meta{text-align:right;white-space:nowrap}.doc-meta small{display:block;letter-spacing:.14em;color:#7d8581}.doc-meta strong{display:block;font-size:15pt;margin-top:1mm}.status{display:inline-block;padding:1mm 2mm;margin-bottom:2mm;border-radius:10mm;background:#edf0ee;color:#40564c;font-size:7pt;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12mm;padding:6mm 0 4mm}.info-grid small,.subject small{display:block;color:#87908c;font-size:7.5pt;letter-spacing:.13em}.info-grid strong{display:block;font-size:10.5pt;margin-top:1mm}.info-grid p{margin:1mm 0;color:#69726e}.subject{margin-bottom:5mm}.subject h2{font-size:16pt;margin:1mm 0}.subject p{margin:1.5mm 0;color:#5f6964;max-width:160mm}.section-heading{display:flex;justify-content:space-between;align-items:baseline;margin:4mm 0 2mm}.section-heading h2{margin:0;font-size:13pt}.section-heading span{font-size:7.5pt;color:#77807c}.work-group{margin:0 0 4mm;break-inside:avoid}.work-group h3{margin:0 0 1.5mm;font-size:9pt;text-transform:uppercase;letter-spacing:.12em;color:#344a40}.work-table{width:100%;border-collapse:collapse;table-layout:fixed}.work-table .voice{width:45%}.work-table .qty{width:8%}.work-table .unit{width:8%}.work-table .price{width:14%}.work-table .vat{width:8%}.work-table .amount{width:17%}.work-table thead{display:table-header-group}.work-table th{padding:2mm 1.5mm;background:#2e3c36;color:#fff;border-right:1px solid #53605a;font-size:7.1pt;letter-spacing:.06em;text-align:right;text-transform:uppercase}.work-table th:first-child{text-align:left}.work-table th:last-child{border-right:0}.work-row{break-inside:avoid}.work-table td{padding:2.3mm 1.5mm;border-right:1px solid #e1e4e2;border-bottom:1px solid #d5dad7;text-align:right;vertical-align:top;font-size:8.2pt;overflow-wrap:anywhere}.work-table td:first-child{text-align:left}.work-table td:last-child{border-right:0}.continuation-row td{text-align:left;background:#fafbfa;color:#66706b;font-size:7.6pt}.continuation-row div{margin-top:1mm}.item-title{font-size:9pt;font-weight:750;overflow-wrap:anywhere}.item-desc,.item-detail{margin-top:1mm;color:#66706b;font-size:7.6pt}.item-inclusion,.item-exclusion{margin-top:1.3mm;padding:1mm 1.5mm;border-radius:1mm;font-size:7.3pt}.item-inclusion{background:#eef3f0;color:#315444}.item-exclusion{background:#f5f1eb;color:#66523c}.item-discount{font-size:7pt;color:#727a76}.money{white-space:nowrap}.body-mode{text-align:center!important}.body-mode span{display:inline-block;padding:1mm 1.5mm;border-radius:8mm;background:#ecefed;color:#46524c;font-size:7pt;font-weight:800;text-transform:uppercase}.summary{width:82mm;margin:7mm 0 0 auto;border-top:1.5px solid #26332e;break-inside:avoid}.summary h3,.options h3,.terms h3{margin:3mm 0;font-size:10pt}.sum-row{display:flex;justify-content:space-between;gap:8mm;padding:1.3mm 0;border-bottom:1px solid #dce0de;font-size:8.5pt}.sum-row.total{padding-top:2.5mm;border:0;font-size:12pt;font-weight:800}.options,.terms{margin-top:6mm;break-inside:avoid}.option{display:flex;justify-content:space-between;gap:8mm;padding:3mm;border:1px solid #d6dcd8;border-radius:2mm;margin-top:2mm}.option p{margin:1mm 0 0;color:#68716d;font-size:7.8pt}.option>strong{white-space:nowrap}.acceptance{display:grid;grid-template-columns:1fr 1fr;gap:14mm;margin-top:9mm;break-inside:avoid;color:#6c7571;font-size:8pt}.acceptance span{display:block;height:12mm;border-bottom:1px solid #89918d}.watermark{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%) rotate(-24deg);font-size:54pt;font-weight:900;letter-spacing:.08em;color:rgba(31,47,40,.055);pointer-events:none}footer{position:absolute;left:14mm;right:14mm;bottom:8mm;display:flex;justify-content:space-between;padding-top:2.5mm;border-top:1px solid #e0e4e1;color:#828b87;font-size:7pt}
  .work-table.single-vat .vat,.work-table.single-vat th:nth-child(5),.work-table.single-vat .vat-cell{display:none}.work-table.single-vat .voice{width:50%}.work-table.single-vat .amount{width:20%}
  </style></head><body>${sheets}</body></html>`;
}
