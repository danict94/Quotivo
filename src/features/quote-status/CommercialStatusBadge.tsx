import { QuoteStatus } from '../../domain';
import { StatusBadge, StatusTone } from '../../ui/components';
import { QuoteShareCommercialOutcome } from '../quote-sharing/QuoteSharingRepository';
import { commercialQuoteStatus, CommercialQuoteStatus } from './commercialQuoteStatus';

const presentation: Record<CommercialQuoteStatus, Readonly<{ label: string; tone: StatusTone }>> = {
  DRAFT: { label: 'Bozza', tone: 'neutral' },
  PENDING: { label: 'In attesa', tone: 'warning' },
  ACCEPTED: { label: 'Accettato', tone: 'success' },
  REJECTED: { label: 'Rifiutato', tone: 'danger' },
};

export function CommercialStatusBadge({ quoteStatus, commercialOutcome }: { quoteStatus: QuoteStatus; commercialOutcome: QuoteShareCommercialOutcome | null }) {
  const status = commercialQuoteStatus({ quoteStatus, commercialOutcome });
  const value = presentation[status];
  return <StatusBadge label={value.label} tone={value.tone} accessibilityLabel={`Stato commerciale: ${value.label}`} />;
}
