import { currentQuoteProjection, Quote } from '../../domain';

/** Home consumes the same current-quote projection used by the operational archive. */
export function recentCurrentQuotes(quotes: Quote[], limit = 3) {
  return currentQuoteProjection(quotes).currentQuotes.slice(0, limit);
}
