import { loadIssuedSnapshot } from '../../database';
import { publicQuoteSnapshot } from './snapshotPayload';
import { getQuoteShareCapabilities, QuoteShareState, quoteShareUnavailableMessage } from './shareCapabilities';
import { QuoteShare, QuoteSharingRepository } from './QuoteSharingRepository';
import { ensureIssuedPdfUploaded } from './uploadIssuedPdf';

export async function createOrRecoverQuoteShare(input: {
  repository: QuoteSharingRepository;
  quoteId: string;
  issuanceId: string;
  state: QuoteShareState;
}): Promise<QuoteShare> {
  const capabilities = getQuoteShareCapabilities(input.state);
  if (!capabilities.canCreateShare && !capabilities.canShare) throw new Error(quoteShareUnavailableMessage(input.state));

  await ensureIssuedPdfUploaded(input.repository, input.quoteId, input.issuanceId);
  if (capabilities.canShare && input.state.shareId) return input.repository.recover(input.state.shareId);
  return input.repository.create(input.issuanceId, publicQuoteSnapshot(await loadIssuedSnapshot(input.quoteId)));
}

export async function recoverActiveQuoteShareLink(repository: QuoteSharingRepository, state: QuoteShareState): Promise<string> {
  if (!state.shareId || !getQuoteShareCapabilities(state).canCopy) throw new Error(quoteShareUnavailableMessage(state));
  const share = await repository.recover(state.shareId);
  if (!share.url) throw new Error('Link Quotivo non disponibile.');
  return share.url;
}
