import { DurabilityLocalRepository, DurabilityRemoteRepository } from './DurabilityContracts';

export type DurabilitySyncSummary = Readonly<{ applied: number; conflicts: number }>;

/**
 * Deterministic two-phase sync: pull safe remote projections, stage untracked
 * legacy rows, then push the durable outbox. A divergent version is preserved
 * as a conflict; this service never resolves it by last-write-wins.
 */
export class DurabilitySyncService {
  constructor(
    private readonly local: DurabilityLocalRepository,
    private readonly remote: DurabilityRemoteRepository,
  ) {}

  async sync(): Promise<DurabilitySyncSummary> {
    let applied = 0;
    let conflicts = 0;
    const remoteSnapshot = await this.remote.listSnapshot();
    for (const record of remoteSnapshot) await this.local.applyRemote(record);

    await this.local.prepareLegacyUpload();
    for (const operation of await this.local.listPending()) {
      const result = await this.remote.sync(operation);
      if (result.kind === 'CONFLICT') {
        await this.local.markConflict(operation, result.record);
        conflicts += 1;
        continue;
      }
      await this.local.markApplied(operation.operationId, result.record);
      applied += 1;
    }
    return { applied, conflicts };
  }
}
