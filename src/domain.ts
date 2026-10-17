/** @public Stato persistito di un preventivo. */
export type QuoteStatus = 'draft' | 'issued';
/** @public Contratto di prezzo della lavorazione, persistito negli snapshot. */
export type PriceMode = 'measured' | 'body';
/** @public Trattamento IVA persistito negli snapshot e nei documenti. */
export type VatTreatment = 'rate' | 'not_applied';
export const QUANTITY_SCALE = 10_000;

export type QuoteItem = {
  id: string; confirmed: boolean; description: string; shortDescription: string; priceMode: PriceMode;
  quantity: number; quantityScaled: number; unit: string; unitCode: string | null; unitPriceCents: number; bodyPriceCents: number;
  vatTreatment: VatTreatment; vatRateBasisPoints: number | null; vatNote: string; lineDiscountBasisPoints: number;
  technicalDetails: string; inclusions: string; exclusions: string; isOptional: boolean; position: number;
};
export type Quote = {
  id: string; number: number | null; numberYear: number | null; clientId:string|null; client: string; clientContactName:string; clientPhone:string; clientEmail:string; clientAddress:string; clientTaxId:string; clientVatNumber:string; siteAddress:string; title: string; introduction: string; defaultVatBasisPoints:number;
  revisionRootQuoteId: string | null; parentQuoteId: string | null; revisionNumber: number;
  globalDiscountBasisPoints: number; status: QuoteStatus; createdAt: string; updatedAt: string; issuedAt: string | null;
  issuedLocalDate: string | null; issuedOffsetMinutes: number | null; validUntil: string | null; items: QuoteItem[];
};
export type NumericInputDrafts = Record<string, string>;
export type NumericFieldName = 'quantity' | 'price' | 'bodyPrice' | 'discount';

export function parseScaledDecimal(value: string, places: number) {
  const compact = value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  if (!compact || !/^\d+(?:\.\d+)?$/.test(compact)) throw new Error(`Valore numerico non valido: "${value}"`);
  const [whole, decimals = ''] = compact.split('.');
  if (decimals.length > places) throw new Error(`Sono consentiti al massimo ${places} decimali.`);
  const scaled = Number(BigInt(whole) * 10n ** BigInt(places) + BigInt((decimals + '0'.repeat(places)).slice(0, places)));
  if (!Number.isSafeInteger(scaled)) throw new Error('Valore numerico troppo grande.');
  return scaled;
}
export function parseDecimal(value: string) { return parseScaledDecimal(value, 4) / QUANTITY_SCALE; }
export function tryParseDecimal(value: string) { try { return parseDecimal(value); } catch { return null; } }
export function parseMoneyCents(value: string) { return parseScaledDecimal(value, 2); }
export function parsePercentBasisPoints(value: string) { const n = parseScaledDecimal(value, 2); if (n > 10_000) throw new Error('La percentuale non puo superare il 100%.'); return n; }
export function numericInputKey(itemId: string, field: NumericFieldName) { return `${itemId}:${field}`; }
export function globalDiscountInputKey(quoteId:string) { return `${quoteId}:globalDiscount`; }

export function createEmptyQuoteItem(id: string, position: number): QuoteItem {
  return { id, confirmed:true, description: '', shortDescription: '', priceMode: 'measured', quantity: 1, quantityScaled: QUANTITY_SCALE,
    unit: 'pz', unitCode: 'piece', unitPriceCents: 0, bodyPriceCents: 0, vatTreatment: 'rate', vatRateBasisPoints: 2200,
    vatNote: '', lineDiscountBasisPoints: 0, technicalDetails: '', inclusions: '', exclusions: '', isOptional: false, position };
}

export function hasMeaningfulDraftContent(quote: Pick<Quote, 'client' | 'clientContactName' | 'clientPhone' | 'clientEmail' | 'clientAddress' | 'clientTaxId' | 'clientVatNumber' | 'siteAddress' | 'title' | 'introduction' | 'globalDiscountBasisPoints' | 'items'>) {
  const textFields = [quote.client, quote.clientContactName, quote.clientPhone, quote.clientEmail, quote.clientAddress, quote.clientTaxId, quote.clientVatNumber, quote.siteAddress, quote.title, quote.introduction];
  if (textFields.some((value) => value.trim().length > 0) || quote.globalDiscountBasisPoints !== 0) return true;
  return quote.items.some((item) => [item.description, item.shortDescription, item.technicalDetails, item.inclusions, item.exclusions, item.vatNote].some((value) => value.trim().length > 0)
    || item.priceMode !== 'measured' || item.quantityScaled !== QUANTITY_SCALE || item.quantity !== 1 || item.unit !== 'pz' || item.unitCode !== 'piece'
    || item.unitPriceCents !== 0 || item.bodyPriceCents !== 0 || item.lineDiscountBasisPoints !== 0 || item.isOptional);
}
function roundHalfUp(n: bigint, d: bigint) { return Number((n + d / 2n) / d); }
function itemBaseCents(item: QuoteItem) { return item.priceMode === 'body' ? item.bodyPriceCents : roundHalfUp(BigInt(item.quantityScaled) * BigInt(item.unitPriceCents), BigInt(QUANTITY_SCALE)); }
export function itemTotalCents(item: QuoteItem) { const base = itemBaseCents(item); return base - roundHalfUp(BigInt(base) * BigInt(item.lineDiscountBasisPoints), 10_000n); }

/** @public Dettaglio economico serializzato nel risultato e negli snapshot. */
export type EconomicLine = { id: string; baseCents: number; lineDiscountCents: number; globalDiscountCents: number; netCents: number };
/** @public Gruppo IVA serializzato nel risultato e negli snapshot. */
export type VatGroup = { treatment: VatTreatment; rateBasisPoints: number | null; note: string; netCents: number; vatCents: number };
export type EconomicResult = { subtotalCents: number; lineDiscountCents: number; globalDiscountCents: number; netCents: number; vatCents: number; totalCents: number; lines: EconomicLine[]; vatGroups: VatGroup[] };

export function calculateEconomics(items: QuoteItem[], globalDiscountBasisPoints = 0): EconomicResult {
  if (!Number.isInteger(globalDiscountBasisPoints) || globalDiscountBasisPoints < 0 || globalDiscountBasisPoints > 10_000) throw new Error('Sconto globale non valido.');
  const rows = items.filter((i) => i.confirmed !== false && i.description.trim() && !i.isOptional).map((item) => {
    const base = itemBaseCents(item); const discount = roundHalfUp(BigInt(base) * BigInt(item.lineDiscountBasisPoints), 10_000n);
    return { item, base, discount, after: base - discount };
  });
  const afterTotal = rows.reduce((s, r) => s + r.after, 0);
  const global = roundHalfUp(BigInt(afterTotal) * BigInt(globalDiscountBasisPoints), 10_000n);
  const allocations = rows.map((r, index) => { const n = BigInt(global) * BigInt(r.after); return { index, value: afterTotal ? Number(n / BigInt(afterTotal)) : 0, remainder: afterTotal ? n % BigInt(afterTotal) : 0n }; });
  let residual = global - allocations.reduce((s, r) => s + r.value, 0);
  [...allocations].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1).forEach((r) => { if (residual-- > 0) allocations[r.index].value++; });
  const lines = rows.map((r, i) => ({ id: r.item.id, baseCents: r.base, lineDiscountCents: r.discount, globalDiscountCents: allocations[i].value, netCents: r.after - allocations[i].value }));
  const groupMap = new Map<string, VatGroup>();
  rows.forEach((r, i) => { const rate = r.item.vatTreatment === 'rate' ? r.item.vatRateBasisPoints : null; const key = `${r.item.vatTreatment}:${rate ?? ''}:${r.item.vatNote}`; const g = groupMap.get(key) ?? { treatment: r.item.vatTreatment, rateBasisPoints: rate, note: r.item.vatNote, netCents: 0, vatCents: 0 }; g.netCents += lines[i].netCents; groupMap.set(key, g); });
  const vatGroups = [...groupMap.values()].map((g) => ({ ...g, vatCents: g.treatment === 'rate' && g.rateBasisPoints !== null ? roundHalfUp(BigInt(g.netCents) * BigInt(g.rateBasisPoints), 10_000n) : 0 }));
  const netCents = lines.reduce((s, r) => s + r.netCents, 0); const vatCents = vatGroups.reduce((s, g) => s + g.vatCents, 0);
  return { subtotalCents: rows.reduce((s, r) => s + r.base, 0), lineDiscountCents: rows.reduce((s, r) => s + r.discount, 0), globalDiscountCents: global, netCents, vatCents, totalCents: netCents + vatCents, lines, vatGroups };
}
export function quoteTotalCents(q: Pick<Quote, 'items' | 'globalDiscountBasisPoints'>) { return calculateEconomics(q.items, q.globalDiscountBasisPoints).totalCents; }
export type RevisionAggregate = { currentQuotes: Quote[]; totalCents: number; deltaByQuoteId: ReadonlyMap<string, number> };

function revisionChainId(quote: Quote) { return quote.revisionNumber > 0 ? quote.revisionRootQuoteId ?? quote.id : quote.id; }

function issuedRevisionChains(quotes: Quote[]) {
  const byChain = new Map<string, Quote[]>();
  quotes.filter((quote) => quote.status === 'issued').forEach((quote) => {
    const chain = revisionChainId(quote);
    const values = byChain.get(chain) ?? [];
    values.push(quote);
    byChain.set(chain, values);
  });
  byChain.forEach((chain) => chain.sort((left, right) => left.revisionNumber - right.revisionNumber || (left.issuedAt ?? '').localeCompare(right.issuedAt ?? '')));
  return byChain;
}

export type CurrentQuoteProjection = Readonly<{
  currentQuotes: Quote[];
  currentIssuedQuotes: Quote[];
  drafts: Quote[];
}>;

/** Canonical current-quote projection: all drafts plus only the latest issued revision per chain. */
export function currentQuoteProjection(quotes: Quote[]): CurrentQuoteProjection {
  const currentIssuedIds = new Set([...issuedRevisionChains(quotes).values()].map((chain) => chain.at(-1)!.id));
  const currentQuotes = quotes.filter((quote) => quote.status === 'draft' || currentIssuedIds.has(quote.id));
  return {
    currentQuotes,
    currentIssuedQuotes: currentQuotes.filter((quote) => quote.status === 'issued'),
    drafts: currentQuotes.filter((quote) => quote.status === 'draft'),
  };
}

/** Restituisce una sola emissione economica per chain: l'ultima revisione emessa. */
export function aggregateIssuedRevisionChains(quotes: Quote[]): RevisionAggregate {
  const byChain = issuedRevisionChains(quotes);
  const deltaByQuoteId = new Map<string, number>();
  byChain.forEach((chain) => {
    chain.forEach((revision) => {
      if (revision.revisionNumber === 0) return;
      const previous = chain.find((quote) => quote.revisionNumber === revision.revisionNumber - 1);
      if (previous) deltaByQuoteId.set(revision.id, quoteTotalCents(revision) - quoteTotalCents(previous));
    });
  });
  const currentQuotes = currentQuoteProjection(quotes).currentIssuedQuotes;
  return { currentQuotes, totalCents: currentQuotes.reduce((total, quote) => total + quoteTotalCents(quote), 0), deltaByQuoteId };
}
export function formatMoney(cents: number) { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100); }

export function materializeNumericInputs(quote: Quote, drafts: NumericInputDrafts): Quote {
  const globalDraft=drafts[globalDiscountInputKey(quote.id)];
  return { ...quote, globalDiscountBasisPoints:globalDraft===undefined?quote.globalDiscountBasisPoints:parsePercentBasisPoints(globalDraft), items: quote.items.map((item) => { const q = drafts[numericInputKey(item.id, 'quantity')], p = drafts[numericInputKey(item.id, 'price')], b = drafts[numericInputKey(item.id, 'bodyPrice')], d = drafts[numericInputKey(item.id, 'discount')];
    const quantityScaled = q === undefined ? item.quantityScaled : parseScaledDecimal(q, 4);
    return { ...item, quantityScaled, quantity: quantityScaled / QUANTITY_SCALE, unitPriceCents: p === undefined ? item.unitPriceCents : parseMoneyCents(p), bodyPriceCents: b === undefined ? item.bodyPriceCents : parseMoneyCents(b), lineDiscountBasisPoints: d === undefined ? item.lineDiscountBasisPoints : parsePercentBasisPoints(d) }; }) };
}
export function validateDraftForFinalization(quote: Quote) {
  if (quote.status !== 'draft') throw new Error('Il preventivo e gia stato emesso.');
  if (!quote.client.trim() || !quote.title.trim()) throw new Error('Inserisci cliente e titolo.');
  const confirmed = quote.items.filter((i) => i.confirmed !== false && i.description.trim());
  if (!confirmed.length) throw new Error('Conferma almeno una voce completa.');
  for (const i of confirmed) { if (i.priceMode === 'measured' && (i.quantityScaled < 0 || !i.unitCode || i.unitPriceCents < 0)) throw new Error('Completa quantita, unita e prezzo delle voci a misura.'); if (i.priceMode === 'body' && i.bodyPriceCents < 0) throw new Error('Importo a corpo non valido.'); if (i.vatTreatment === 'rate' && (i.vatRateBasisPoints === null || i.vatRateBasisPoints < 0)) throw new Error('Seleziona il trattamento IVA.'); }
  calculateEconomics(quote.items, quote.globalDiscountBasisPoints);
}
export function newId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
