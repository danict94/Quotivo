import assert from 'node:assert/strict';
import test from 'node:test';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { calculateEconomics, createEmptyQuoteItem } from '../src/domain';
import { buildDraftDocumentModel, buildFinalDocumentModel } from '../src/documents/documentModel';
import { A4_POINTS, paginateWorkItems, renderStandardHtml } from '../src/documents/standardRenderer';
import { createDocxDocument } from '../src/documents/docxDocument';
import { finalizeQuoteData } from '../src/quoteTransactions';
import { atomicFinalize, finalizationContext, insertDraft, migratedDatabase, now, quote } from './reliabilityFixtures';

test('Modello documento bozza non assegna numero e omette blocchi vuoti nel renderer', () => {
  const value=quote(); value.items[0].priceMode='body'; value.items[0].bodyPriceCents=10000; value.items[0].shortDescription=''; value.items[0].technicalDetails='';
  const business={businessName:'Impresa',taxId:'',vatNumber:'',address:'',postalCode:'',city:'',province:'',email:'',phone:'',website:'',defaultConditions:'',defaultValidityDays:30,defaultPaymentTerms:'',logoUri:null,logoMimeType:null,logoOriginalName:null,logoDataBase64:null};
  const model=buildDraftDocumentModel(value,business,new Date('2026-09-12T10:00:00+02:00'));
  const html=renderStandardHtml(model);
  assert.equal(model.numberLabel,null); assert.equal(model.mode,'draft'); assert.match(html,/BOZZA/); assert.match(html,/SENZA NUMERO/);
  assert.doesNotMatch(html,/Dettagli tecnici/); assert.doesNotMatch(html,/class="measure"/); assert.doesNotMatch(html,/<h2 class="section-title">Opzioni/);
  assert.match(html,/<th>Lavorazione<\/th><th>Q\.t\u00e0<\/th><th>U\.M\.<\/th><th>Prezzo<\/th><th>IVA<\/th><th>Importo<\/th>/);
  assert.match(html,/colspan="3" class="body-mode"><span>A corpo<\/span>/);
  assert.match(html,/Pagina 1 di 1/); assert.doesNotMatch(html,/Pagina 0 di 0/);
  assert.match(html,/@page\{size:210mm 297mm/); assert.deepEqual(A4_POINTS,{width:595.28,height:841.89});
});
test('DOCX usa il document model e produce un archivio Word valido', async () => {
  const model=buildDraftDocumentModel(quote('docx'),{businessName:'Impresa prova',defaultConditions:'Condizioni',defaultPaymentTerms:'Pagamento',defaultValidityDays:30} as never,new Date(now));
  const base64=await Packer.toBase64String(createDocxDocument(model)); const bytes=Buffer.from(base64,'base64');
  assert.deepEqual([...bytes.subarray(0,2)],[0x50,0x4b]);
  assert.equal(bytes.includes(Buffer.from('[Content_Types].xml')),true);
  const xml=await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string');
  assert.match(xml,/w:pgSz[^>]*w:w="11906"[^>]*w:h="16838"/);
  assert.match(xml,/w:pgMar[^>]*w:top="720"[^>]*w:right="720"[^>]*w:bottom="720"[^>]*w:left="720"/);
  assert.match(xml,/w:tblLayout w:type="fixed"/);
  assert.match(xml,/w:tblW w:type="dxa" w:w="10466"/);
  assert.doesNotMatch(xml,/w:type="pct"/);
});

test('Documento definitivo deriva da snapshot schema 3 e usa lo stesso risultato economico', async () => {
  const adapter=await migratedDatabase(); const value=quote('pdf-final'); await insertDraft(adapter,value);
  await adapter.execAsync('BEGIN IMMEDIATE'); await finalizeQuoteData(adapter,value,{...finalizationContext,businessProfile:{businessName:'Impresa',defaultConditions:'',defaultPaymentTerms:''}}); await adapter.execAsync('COMMIT');
  const row=await adapter.getFirstAsync<{snapshot_json:string}>("SELECT snapshot_json FROM issued_quote_snapshots WHERE quote_id='pdf-final'");
  const model=buildFinalDocumentModel(JSON.parse(row!.snapshot_json)); const html=renderStandardHtml(model);
  assert.equal(model.numberLabel,'1/2026'); assert.equal(model.mode,'final'); assert.equal(model.baseEconomics.totalCents,calculateEconomics(value.items,0).totalCents);
  assert.equal(model.revisionNumber,0); assert.equal(model.originalIssueDate,null); assert.equal(model.revisionDate,null); assert.equal(model.replacedRevisionNumber,null); assert.equal(model.replacedIssueDate,null);
  assert.doesNotMatch(html,/BOZZA/); assert.match(html,/N\. 1\/2026/); assert.match(html,/Pagina 1 di \d+/); assert.doesNotMatch(html,/counter\((?:page|pages)\)|Pagina 0 di 0/);
  const historicalSnapshot=JSON.parse(row!.snapshot_json);
  const historicalHtml=renderStandardHtml(buildFinalDocumentModel(historicalSnapshot));
  assert.doesNotMatch(historicalHtml,/Firma dell'impresa/);
});

test('Renderer Standard mantiene inclusioni ed esclusioni nella sola lavorazione', () => {
  const value=quote();
  value.items=([
    {...createEmptyQuoteItem('demolizione',0),description:'Demolizione pavimento',shortDescription:'Rimozione controllata',inclusions:'Trasporto interno',exclusions:'Smaltimento speciale',quantityScaled:25000,unit:'pz',unitPriceCents:3200,vatRateBasisPoints:2200},
    {...createEmptyQuoteItem('impianto',1),description:'Rifacimento adduzione',priceMode:'body',bodyPriceCents:85000,vatRateBasisPoints:1000},
  ] as unknown) as typeof value.items;
  const business={businessName:'Impresa',taxId:'',vatNumber:'',address:'',postalCode:'',city:'',province:'',email:'',phone:'',website:'',defaultConditions:'',defaultValidityDays:30,defaultPaymentTerms:'',logoUri:null,logoMimeType:null,logoOriginalName:null,logoDataBase64:null};
  const html=renderStandardHtml(buildDraftDocumentModel(value,business,new Date('2026-09-12T10:00:00+02:00')));
  assert.match(html,/<h3>Lavorazioni<\/h3>/);
  assert.equal((html.match(/Smaltimento speciale/g)??[]).length,1);
  assert.match(html,/Incluso:<\/b> Trasporto interno/); assert.match(html,/Escluso:<\/b> Smaltimento speciale/);
  assert.match(html,/2,5<\/td><td>pz<\/td><td class="money">32,00\s*\u20ac/);
  assert.match(html,/colspan="3" class="body-mode"><span>A corpo<\/span>/);
});

test('Renderer Standard crea pagine esplicite con footer coerenti e intestazioni tabella ripetute', () => {
  const value=quote(); value.items=Array.from({length:18},(_,index)=>({...createEmptyQuoteItem(`riga-${index}`,index),description:`Voce estesa ${index+1}`,shortDescription:'Descrizione sufficientemente lunga per verificare la distribuzione prudenziale delle righe nella pagina A4.',quantityScaled:10000,unit:'pz',unitPriceCents:1000,vatRateBasisPoints:2200}));
  const business={businessName:'Impresa',taxId:'',vatNumber:'',address:'',postalCode:'',city:'',province:'',email:'',phone:'',website:'',defaultConditions:'Condizioni finali',defaultValidityDays:30,defaultPaymentTerms:'Bonifico',logoUri:null,logoMimeType:null,logoOriginalName:null,logoDataBase64:null};
  const html=renderStandardHtml(buildDraftDocumentModel(value,business,new Date('2026-09-12T10:00:00+02:00')));
  const pageCount=(html.match(/<section class="sheet">/g)??[]).length;
  assert.ok(pageCount>=2); assert.match(html,new RegExp(`Pagina 1 di ${pageCount}`)); assert.match(html,new RegExp(`Pagina ${pageCount} di ${pageCount}`));
  assert.equal((html.match(/<thead>/g)??[]).length,(html.match(/<table class="work-table(?: [^"]+)?">/g)??[]).length); assert.doesNotMatch(html,/Pagina 0 di 0/);
});

test('Renderer Standard spezza contenuti dinamici prima del footer e conserva tutte le pagine', () => {
  const value=quote('pdf-long');
  const longNote=Array.from({length:90},(_,index)=>`Nota tecnica ${index+1}: lavorazione eseguita con materiali e condizioni specifiche del cantiere.`).join(' ');
  value.items=Array.from({length:16},(_,index)=>({...createEmptyQuoteItem(`long-${index}`,index),description:`Lavorazione ${index+1} con descrizione molto articolata per il preventivo`,shortDescription:longNote.slice(0,740),technicalDetails:longNote.slice(740,1480),inclusions:longNote.slice(1480,1880),quantityScaled:10000,unit:'pz',unitPriceCents:1000,vatRateBasisPoints:2200}));
  const business={businessName:'Impresa',taxId:'',vatNumber:'',address:'',postalCode:'',city:'',province:'',email:'',phone:'',website:'',defaultConditions:longNote,defaultValidityDays:30,defaultPaymentTerms:longNote,logoUri:null,logoMimeType:null,logoOriginalName:null,logoDataBase64:null};
  const html=renderStandardHtml(buildDraftDocumentModel(value,business,new Date('2026-09-12T10:00:00+02:00')));
  const pageLabels=[...html.matchAll(/Pagina (\d+) di (\d+)/g)].map((match)=>({page:Number(match[1]),total:Number(match[2])}));
  assert.ok(pageLabels.length>=3);
  pageLabels.forEach((label,index)=>assert.deepEqual(label,{page:index+1,total:pageLabels.length}));
  assert.equal((html.match(/<thead>/g)??[]).length,(html.match(/<table class="work-table(?: [^"]+)?">/g)??[]).length);
  assert.match(html,/Condizioni/); assert.match(html,/Pagamenti/); assert.match(html,/Firma per accettazione/);
});

test('Renderer Standard non sposta prematuramente otto lavorazioni semplici alla pagina seguente', () => {
  const items=Array.from({length:8},(_,index)=>({...createEmptyQuoteItem(`fit-${index}`,index),description:`Lavorazione ${index+1}`,unitPriceCents:1000,vatRateBasisPoints:2200}));
  const amounts=new Map(items.map((item)=>[item.id,1000]));
  const pages=paginateWorkItems(items,amounts);
  assert.equal(pages.length,1);
  assert.equal((pages[0][0].html.match(/class="item-title"/g)??[]).length,8);
});

test('Renderer Standard nasconde IVA in tabella solo quando il trattamento è unico', () => {
  const value=quote(); const business={businessName:'Impresa',taxId:'',vatNumber:'',address:'',postalCode:'',city:'',province:'',email:'',phone:'',website:'',defaultConditions:'',defaultValidityDays:30,defaultPaymentTerms:'',logoUri:null,logoMimeType:null,logoOriginalName:null,logoDataBase64:null};
  const single=renderStandardHtml(buildDraftDocumentModel(value,business,new Date('2026-09-12T10:00:00+02:00')));
  assert.match(single,/work-table single-vat/);
  value.items.push({...createEmptyQuoteItem('other-vat',1),description:'Altra voce',vatRateBasisPoints:1000});
  const mixed=renderStandardHtml(buildDraftDocumentModel(value,business,new Date('2026-09-12T10:00:00+02:00')));
  assert.doesNotMatch(mixed,/work-table single-vat/);
});

test('Opzione esclusa dal totale mantiene il suo importo reale nel PDF', () => {
  const value=quote(); value.items.push({...createEmptyQuoteItem('optional',1),description:'Sanitario opzionale',priceMode:'body',bodyPriceCents:30000,isOptional:true});
  const business={businessName:'Impresa',taxId:'',vatNumber:'',address:'',postalCode:'',city:'',province:'',email:'',phone:'',website:'',defaultConditions:'',defaultValidityDays:30,defaultPaymentTerms:'',logoUri:null,logoMimeType:null,logoOriginalName:null,logoDataBase64:null};
  const html=renderStandardHtml(buildDraftDocumentModel(value,business,new Date('2026-09-12T10:00:00+02:00')));
  assert.equal(calculateEconomics(value.items).subtotalCents,1000); assert.match(html,/Opzioni non incluse nel totale/); assert.match(html,/Sanitario opzionale/); assert.match(html,/300,00\s*€ \+ IVA/);
});

test('PDF Standard etichetta cliente e cantiere e non replica il logo dopo la prima pagina', () => {
  const value=quote('pdf-client'); Object.assign(value,{clientContactName:'Anna',clientPhone:'3331234567',clientEmail:'anna@example.test',clientAddress:'Via Roma 1',clientTaxId:'RSSMRA',clientVatNumber:'IT123',siteAddress:'Via Roma 1'}); value.items=Array.from({length:18},(_,index)=>({...createEmptyQuoteItem(`pdf-${index}`,index),description:`Voce ${index}`,shortDescription:'Contenuto multipagina',unitPriceCents:1000,vatRateBasisPoints:2200}));
  const business={businessName:'Impresa',taxId:'',vatNumber:'',address:'',postalCode:'',city:'',province:'',email:'',phone:'',website:'',defaultConditions:'',defaultValidityDays:30,defaultPaymentTerms:'',logoUri:null,logoMimeType:'image/png',logoOriginalName:'logo.png',logoDataBase64:'AA=='};
  const html=renderStandardHtml(buildDraftDocumentModel(value,business,new Date('2026-09-12T10:00:00+02:00')));
  assert.match(html,/Referente: Anna/); assert.match(html,/Indirizzo: Via Roma 1/); assert.match(html,/CF: RSSMRA/); assert.match(html,/P\. IVA: IT123/); assert.match(html,/Telefono: 3331234567/); assert.match(html,/Email: anna@example\.test/); assert.match(html,/Come indirizzo cliente/);
  assert.equal((html.match(/data:image\/png;base64,AA==/g)??[]).length,1);
});
