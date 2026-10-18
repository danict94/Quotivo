import { QuoteItem } from '../../domain';

export const missingConfirmedWorkItemMessage = 'Conferma almeno una lavorazione prima di continuare al riepilogo.';

export function canContinueToQuoteSummary(items: readonly QuoteItem[]) {
  return items.some((item) => item.confirmed !== false && item.description.trim().length > 0);
}
