export type IssuanceSnapshotRecord = Readonly<{
  issuanceId: string;
  snapshotSchemaVersion: number;
  clientName: string;
  title: string;
  quotedAmountCents: number;
  currency: 'EUR';
  createdAt: string;
}>;

export interface IssuanceSnapshotRepository {
  register(issuanceId: string, snapshot: unknown): Promise<IssuanceSnapshotRecord>;
}
