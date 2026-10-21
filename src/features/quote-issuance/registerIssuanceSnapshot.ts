import { IssuanceSnapshotRecord, IssuanceSnapshotRepository } from './IssuanceSnapshotRepository';

export class IssuanceSnapshotRegistrationError extends Error {
  constructor(readonly code: 'INVALID_ISSUANCE_ID' | 'INVALID_SNAPSHOT') {
    super(code);
    this.name = 'IssuanceSnapshotRegistrationError';
  }
}

function isIssuedSnapshot(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const value = snapshot as Record<string, unknown>;
  const economics = value.economics;
  return value.status === 'issued'
    && typeof value.id === 'string'
    && Number.isInteger(value.number)
    && Number.isInteger(value.numberYear)
    && Number.isInteger(value.revisionNumber)
    && typeof value.client === 'string'
    && typeof value.title === 'string'
    && Boolean(economics) && typeof economics === 'object'
    && Number.isInteger((economics as Record<string, unknown>).totalCents);
}

/** Registers the immutable local issuance snapshot without authorizing or creating an issuance. */
export async function registerIssuanceSnapshot(
  repository: IssuanceSnapshotRepository,
  input: Readonly<{ issuanceId: string; snapshot: unknown }>,
): Promise<IssuanceSnapshotRecord> {
  if (!input.issuanceId.trim()) throw new IssuanceSnapshotRegistrationError('INVALID_ISSUANCE_ID');
  if (!isIssuedSnapshot(input.snapshot)) throw new IssuanceSnapshotRegistrationError('INVALID_SNAPSHOT');
  return repository.register(input.issuanceId, input.snapshot);
}
