import { currentQuoteProjection, Quote } from '../../domain';
import { QuoteShareCommercialOutcome } from '../quote-sharing/QuoteSharingRepository';
import { CommercialQuoteStatus, commercialQuoteStatus } from './commercialQuoteStatus';

export type ArchiveCommercialFilter = 'ALL' | 'ISSUED' | CommercialQuoteStatus;

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function searchText(quote: Quote) {
  return [
    quote.status === 'draft' ? 'Bozza' : `${quote.number ?? ''}/${quote.numberYear ?? ''}`,
    quote.title,
    quote.client,
  ].join(' ');
}

/** Canonical archive selector: commercial status remains distinct from share lifecycle. */
export function filterArchiveQuotes(input: {
  quotes: Quote[];
  outcomes: Readonly<Record<string, QuoteShareCommercialOutcome | null>>;
  commercialFilter: ArchiveCommercialFilter;
  query: string;
}): Quote[] {
  const query = normalize(input.query.trim());
  return currentQuoteProjection(input.quotes).currentQuotes.filter((quote) => {
    const commercialStatus = commercialQuoteStatus({ quoteStatus: quote.status, commercialOutcome: input.outcomes[quote.id] ?? null });
    const matchesCommercialFilter = input.commercialFilter === 'ALL'
      || (input.commercialFilter === 'ISSUED' ? commercialStatus !== 'DRAFT' : commercialStatus === input.commercialFilter);
    return matchesCommercialFilter
      && (!query || normalize(searchText(quote)).includes(query));
  });
}
