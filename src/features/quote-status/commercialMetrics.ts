import { currentQuoteProjection, quoteTotalCents, Quote } from '../../domain';
import { QuoteShareCommercialOutcome } from '../quote-sharing/QuoteSharingRepository';
import { commercialQuoteStatus } from './commercialQuoteStatus';

export type CommercialMetrics = Readonly<{
  issuedCount: number;
  issuedAmountCents: number;
  pendingCount: number;
  pendingAmountCents: number;
  acceptedCount: number;
  acceptedAmountCents: number;
  rejectedCount: number;
  rejectedAmountCents: number;
}>;

type MutableCommercialMetrics = { -readonly [Key in keyof CommercialMetrics]: CommercialMetrics[Key] };

function emptyCommercialMetrics(): MutableCommercialMetrics {
  return {
    issuedCount: 0, issuedAmountCents: 0,
    pendingCount: 0, pendingAmountCents: 0,
    acceptedCount: 0, acceptedAmountCents: 0,
    rejectedCount: 0, rejectedAmountCents: 0,
  };
}

/** Canonical commercial metrics for current issued quotes; designed for future rate, average and trend projections. */
export function commercialMetrics(quotes: Quote[], outcomes: Readonly<Record<string, QuoteShareCommercialOutcome | null>>): CommercialMetrics {
  const metrics = emptyCommercialMetrics();
  for (const quote of currentQuoteProjection(quotes).currentIssuedQuotes) {
    const amountCents = quoteTotalCents(quote);
    metrics.issuedCount += 1;
    metrics.issuedAmountCents += amountCents;
    const status = commercialQuoteStatus({ quoteStatus: quote.status, commercialOutcome: outcomes[quote.id] ?? null });
    if (status === 'PENDING') {
      metrics.pendingCount += 1;
      metrics.pendingAmountCents += amountCents;
    } else if (status === 'ACCEPTED') {
      metrics.acceptedCount += 1;
      metrics.acceptedAmountCents += amountCents;
    } else if (status === 'REJECTED') {
      metrics.rejectedCount += 1;
      metrics.rejectedAmountCents += amountCents;
    } else {
      throw new Error('Un preventivo emesso non può avere stato commerciale Bozza.');
    }
  }
  return metrics;
}
