import { QuoteSharingRepository } from '../quote-sharing/QuoteSharingRepository';

type RevisionShareContext = { parentIssuanceId: string; revisionIssuanceId: string } | null;

type RevisionShareSupersession =
  | { kind: 'NOT_REQUIRED' }
  | { kind: 'COMPLETE' }
  | { kind: 'PENDING_RECOVERY'; cause: unknown };

export type RevisionShareLifecycleResult<T> = Readonly<{
  emission: T;
  supersession: RevisionShareSupersession;
}>;

/** Executes the remote lifecycle transition only after the local emission completed. */
export async function finalizeRevisionShareLifecycle<T>(input: {
  finalize: () => Promise<T>;
  revisionShare: RevisionShareContext;
  sharingRepository: Pick<QuoteSharingRepository, 'supersedeParentForRevision'>;
}): Promise<RevisionShareLifecycleResult<T>> {
  const emission = await input.finalize();
  if (!input.revisionShare) return { emission, supersession: { kind: 'NOT_REQUIRED' } };
  try {
    await input.sharingRepository.supersedeParentForRevision(input.revisionShare.parentIssuanceId, input.revisionShare.revisionIssuanceId);
    return { emission, supersession: { kind: 'COMPLETE' } };
  } catch (cause) {
    return { emission, supersession: { kind: 'PENDING_RECOVERY', cause } };
  }
}

/** Safe to retry: the server updates only ACTIVE parent shares for the canonical revision pair. */
export async function recoverRevisionShareLifecycle(
  sharingRepository: Pick<QuoteSharingRepository, 'supersedeParentForRevision'>,
  context: Exclude<RevisionShareContext, null>,
) {
  await sharingRepository.supersedeParentForRevision(context.parentIssuanceId, context.revisionIssuanceId);
}
