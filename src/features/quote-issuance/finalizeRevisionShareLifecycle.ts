import { QuoteSharingRepository } from '../quote-sharing/QuoteSharingRepository';

type RevisionShareContext = { parentIssuanceId: string; revisionIssuanceId: string } | null;

/** Executes the remote lifecycle transition only after the local emission completed. */
export async function finalizeRevisionShareLifecycle<T>(input: {
  finalize: () => Promise<T>;
  revisionShare: RevisionShareContext;
  sharingRepository: Pick<QuoteSharingRepository, 'supersedeParentForRevision'>;
}): Promise<T> {
  const result = await input.finalize();
  if (input.revisionShare) {
    await input.sharingRepository.supersedeParentForRevision(input.revisionShare.parentIssuanceId, input.revisionShare.revisionIssuanceId);
  }
  return result;
}
