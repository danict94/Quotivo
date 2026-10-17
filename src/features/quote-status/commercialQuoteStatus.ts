import { QuoteStatus } from '../../domain';
import { QuoteShareCommercialOutcome } from '../quote-sharing/QuoteSharingRepository';

export type CommercialQuoteStatus = 'DRAFT' | 'PENDING' | 'ACCEPTED' | 'REJECTED';

/** Canonical commercial state; visual presentation belongs to the Design System adapter. */
export function commercialQuoteStatus(input: {
  quoteStatus: QuoteStatus;
  commercialOutcome: QuoteShareCommercialOutcome | null;
}): CommercialQuoteStatus {
  if (input.quoteStatus === 'draft') {
    if (input.commercialOutcome !== null) throw new Error('Una bozza non può avere un esito commerciale.');
    return 'DRAFT';
  }

  if (input.quoteStatus !== 'issued') throw new Error(`Stato preventivo non supportato: ${String(input.quoteStatus)}.`);
  if (input.commercialOutcome === null || input.commercialOutcome === 'PENDING') return 'PENDING';
  if (input.commercialOutcome === 'ACCEPTED') return 'ACCEPTED';
  if (input.commercialOutcome === 'REJECTED') return 'REJECTED';
  throw new Error(`Esito commerciale non supportato: ${String(input.commercialOutcome)}.`);
}
