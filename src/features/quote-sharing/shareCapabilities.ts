import { QuoteShareCommercialOutcome, QuoteShareLifecycle } from './QuoteSharingRepository';

export type QuoteShareState = {
  shareId: string | null;
  lifecycle: QuoteShareLifecycle | null;
  commercialOutcome: QuoteShareCommercialOutcome | null;
  openedAt: string | null;
};

export type QuoteShareCapabilities = {
  canCreateShare: boolean;
  canShare: boolean;
  canCopy: boolean;
  canRevoke: boolean;
  canAccept: boolean;
  canReject: boolean;
};

export function getQuoteShareCapabilities(state: QuoteShareState): QuoteShareCapabilities {
  if (!state.shareId || !state.lifecycle) return { canCreateShare: true, canShare: false, canCopy: false, canRevoke: false, canAccept: false, canReject: false };
  if (state.lifecycle === 'REVOKED' || state.lifecycle === 'SUPERSEDED') return { canCreateShare: true, canShare: false, canCopy: false, canRevoke: false, canAccept: false, canReject: false };
  const pending = state.commercialOutcome === 'PENDING';
  return { canCreateShare: false, canShare: true, canCopy: true, canRevoke: true, canAccept: pending, canReject: pending };
}

export function quoteShareLifecycleLabel(state: QuoteShareState): string {
  if (!state.shareId || !state.lifecycle) return 'Non inviato';
  if (state.lifecycle === 'REVOKED') return 'Revocato';
  if (state.lifecycle === 'SUPERSEDED') return 'Sostituito';
  return state.openedAt ? 'Visualizzato' : 'Inviato';
}

export function quoteShareUnavailableMessage(state: QuoteShareState): string {
  if (state.lifecycle === 'REVOKED') return 'Questo link Quotivo è stato revocato.';
  if (state.lifecycle === 'SUPERSEDED') return 'Questo link Quotivo è stato sostituito.';
  if (state.commercialOutcome === 'ACCEPTED' || state.commercialOutcome === 'REJECTED') return 'Il preventivo ha già una risposta definitiva.';
  return 'Il link Quotivo non è disponibile.';
}
