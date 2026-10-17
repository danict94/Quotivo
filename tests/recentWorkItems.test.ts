import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyQuoteItem, Quote } from '../src/domain';
import { deriveRecentWorkItems } from '../src/features/recent-work-items/recentWorkItems';

function quote(id:string, revisionNumber=0, root:string|null=null, issuedAt='2026-10-01T10:00:00.000Z', description='Posa pavimento', price=1200): Quote {
  return { id,number:1,numberYear:2026,clientId:null,client:'Cliente',clientContactName:'',clientPhone:'',clientEmail:'',clientAddress:'',clientTaxId:'',clientVatNumber:'',siteAddress:'',title:'Lavori',introduction:'',defaultVatBasisPoints:2200,revisionRootQuoteId:root,parentQuoteId:revisionNumber?root:null,revisionNumber,globalDiscountBasisPoints:0,status:'issued',createdAt:issuedAt,updatedAt:issuedAt,issuedAt,issuedLocalDate:'2026-10-01',issuedOffsetMinutes:120,validUntil:null,items:[{...createEmptyQuoteItem(`${id}-item`,0),description,unit:'m²',unitCode:'sqm',unitPriceCents:price,vatRateBasisPoints:2200}] };
}

test('Recenti usa solo l ultima emissione di una chain, deduplica e ordina per utilizzo', () => {
  const rev0=quote('root',0,null,'2026-10-01T10:00:00.000Z','Posa pavimento',1000);
  const rev1=quote('rev1',1,'root','2026-10-03T10:00:00.000Z','Posa pavimento',1200);
  const same=quote('same',0,null,'2026-10-04T10:00:00.000Z','  posa   pavimento  ',1200);
  const other=quote('other',0,null,'2026-10-02T10:00:00.000Z','Tinteggiatura',900);
  const recent=deriveRecentWorkItems([rev0,rev1,same,other]);
  assert.deepEqual(recent.map((value)=>value.item.description.trim().replace(/\s+/g, ' ')), ['posa pavimento','Tinteggiatura']);
  assert.equal(recent[0].sourceQuoteId,'same');
  assert.equal(recent[0].item.unitPriceCents,1200);
  assert.equal(recent.some((value)=>value.item.unitPriceCents===1000),false);
});

test('Recenti conserva le quote senza revisioni insieme alle revisioni correnti', () => {
  const rev0 = quote('root', 0, null, '2026-10-01T10:00:00.000Z', 'Demolizione', 1000);
  const rev1 = quote('rev1', 1, 'root', '2026-10-02T10:00:00.000Z', 'Demolizione aggiornata', 1200);
  const independent = quote('independent', 0, null, '2026-10-03T10:00:00.000Z', 'Rasatura', 900);
  assert.deepEqual(deriveRecentWorkItems([rev0, rev1, independent]).map((value) => value.sourceQuoteId), ['independent', 'rev1']);
});
