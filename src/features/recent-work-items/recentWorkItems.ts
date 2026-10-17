import { currentQuoteProjection, Quote, QuoteItem } from '../../domain';

export type RecentWorkItem = {
  item: QuoteItem;
  sourceQuoteId: string;
  lastUsedAt: string;
};

function itemKey(item: QuoteItem) {
  const text = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return [
    text(item.description), item.priceMode, item.unitCode ?? '', text(item.unit),
    item.unitPriceCents, item.bodyPriceCents, item.vatTreatment, item.vatRateBasisPoints ?? '',
    item.lineDiscountBasisPoints, item.isOptional ? 1 : 0, text(item.shortDescription),
    text(item.technicalDetails), text(item.inclusions), text(item.exclusions), text(item.vatNote),
  ].join('|');
}

/** Deriva le voci riutilizzabili dagli emessi correnti, senza persistere uno storico parallelo. */
export function deriveRecentWorkItems(quotes: Quote[]): RecentWorkItem[] {
  const seen = new Set<string>();
  return currentQuoteProjection(quotes).currentIssuedQuotes
    .flatMap((quote) => quote.items.filter((item) => item.confirmed && item.description.trim()).map((item) => ({ item, sourceQuoteId: quote.id, lastUsedAt: quote.issuedAt ?? quote.updatedAt })))
    .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))
    .filter((recent) => {
      const key = itemKey(recent.item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
