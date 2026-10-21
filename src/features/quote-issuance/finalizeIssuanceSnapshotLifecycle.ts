import { IssuanceSnapshotRepository } from './IssuanceSnapshotRepository';
import { registerIssuanceSnapshot } from './registerIssuanceSnapshot';

export type IssuanceSnapshotLifecycleResult<T> = Readonly<{
  emission: T;
  snapshot: unknown;
  registration: { kind: 'COMPLETE' } | { kind: 'PENDING_RECOVERY'; cause: unknown };
}>;

/**
 * Local emission is never repeated after the server has authorized its issuance.
 * A failed remote snapshot registration is explicitly recoverable with the same
 * issuance id and immutable local snapshot.
 */
export async function finalizeIssuanceSnapshotLifecycle<T>(input: {
  issuanceId: string;
  finalize: () => Promise<T>;
  loadIssuedSnapshot: () => Promise<unknown>;
  markPending: () => Promise<void>;
  markSynced: () => Promise<void>;
  repository: IssuanceSnapshotRepository;
}): Promise<IssuanceSnapshotLifecycleResult<T>> {
  const emission = await input.finalize();
  const snapshot = await input.loadIssuedSnapshot();
  await input.markPending();
  try {
    await registerIssuanceSnapshot(input.repository, { issuanceId: input.issuanceId, snapshot });
    await input.markSynced();
    return { emission, snapshot, registration: { kind: 'COMPLETE' } };
  } catch (cause) {
    return { emission, snapshot, registration: { kind: 'PENDING_RECOVERY', cause } };
  }
}

/** Safe retry: this only registers the pre-existing local immutable snapshot. */
export async function recoverIssuanceSnapshot(
  repository: IssuanceSnapshotRepository,
  input: Readonly<{ issuanceId: string; snapshot: unknown }>,
) {
  return registerIssuanceSnapshot(repository, input);
}
