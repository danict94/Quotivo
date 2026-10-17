import { ArchiveCommercialFilter } from '../quote-status/archiveQuoteFilter';

/** Navigation-only request emitted by dashboard cards; Archive owns its UI filter state. */
export type ArchiveNavigationIntent = 'EMESSI' | 'PENDING' | 'ACCEPTED' | 'REJECTED';

export function archiveCommercialFilterForNavigationIntent(intent?: ArchiveNavigationIntent): ArchiveCommercialFilter {
  return intent === 'EMESSI' ? 'ISSUED' : intent ?? 'ALL';
}
