import { BusinessProfile } from '../businessProfile';
import { addCalendarDays, captureEmissionClock } from '../emissionClock';
import { calculateEconomics, EconomicResult, Quote, QuoteItem } from '../domain';

export const STANDARD_RENDERER_VERSION = 'standard-a4-v1';
export type DocumentMode = 'draft' | 'final';
export type DocumentBusiness = BusinessProfile & { logoDataBase64?: string | null };
export type StandardDocumentModel = {
  rendererVersion: typeof STANDARD_RENDERER_VERSION; mode: DocumentMode; quoteId: string;
  numberLabel: string | null; issueDate: string; validUntil: string; business: DocumentBusiness;
  client: string; clientContactName:string; clientPhone:string; clientEmail:string; clientAddress:string; clientTaxId:string; clientVatNumber:string; siteAddress:string; title: string; introduction: string; items: QuoteItem[]; baseEconomics: EconomicResult;
  conditions: string; paymentTerms: string;
};

function numberLabel(number:number|null, year:number|null) { return number === null ? null : year === null ? String(number) : `${number}/${year}`; }

export function buildDraftDocumentModel(quote: Quote, business: DocumentBusiness, now = new Date()): StandardDocumentModel {
  const clock = captureEmissionClock(now);
  return { rendererVersion:STANDARD_RENDERER_VERSION, mode:'draft', quoteId:quote.id, numberLabel:null,
    issueDate:clock.localDate, validUntil:addCalendarDays(clock.localDate,business.defaultValidityDays), business,
    client:quote.client.trim(), clientContactName:quote.clientContactName.trim(), clientPhone:quote.clientPhone.trim(), clientEmail:quote.clientEmail.trim(), clientAddress:quote.clientAddress.trim(), clientTaxId:quote.clientTaxId.trim(), clientVatNumber:quote.clientVatNumber.trim(), siteAddress:quote.siteAddress.trim(), title:quote.title.trim(), introduction:quote.introduction.trim(), items:quote.items,
    baseEconomics:calculateEconomics(quote.items,quote.globalDiscountBasisPoints),
    conditions:business.defaultConditions.trim(), paymentTerms:business.defaultPaymentTerms.trim() };
}

export function buildFinalDocumentModel(snapshot: unknown): StandardDocumentModel {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Snapshot emesso non valido.');
  const value=snapshot as Record<string,unknown>;
  if (value.schemaVersion !== 3 || value.documentModel !== 'standard-v1' || value.status !== 'issued') throw new Error('Lo snapshot storico non è supportato dal renderer Standard corrente.');
  const items=value.items as QuoteItem[]; const business=value.businessProfile as DocumentBusiness;
  if (!Array.isArray(items) || !business || typeof business !== 'object') throw new Error('Snapshot emesso incompleto.');
  const stored=value.economics as EconomicResult;
  if (!stored || typeof stored.totalCents !== 'number') throw new Error('Risultato economico dello snapshot assente.');
  return { rendererVersion:STANDARD_RENDERER_VERSION, mode:'final', quoteId:String(value.id),
    numberLabel:numberLabel(value.number as number,value.numberYear as number), issueDate:String(value.issuedLocalDate), validUntil:String(value.validUntil),
    business, client:String(value.client??''), clientContactName:String(value.clientContactName??''), clientPhone:String(value.clientPhone??''), clientEmail:String(value.clientEmail??''), clientAddress:String(value.clientAddress??''), clientTaxId:String(value.clientTaxId??''), clientVatNumber:String(value.clientVatNumber??''), siteAddress:String(value.siteAddress??''), title:String(value.title??''), introduction:String(value.introduction??''), items,
    baseEconomics:stored,
    conditions:String(business.defaultConditions??''), paymentTerms:String(business.defaultPaymentTerms??'') };
}
