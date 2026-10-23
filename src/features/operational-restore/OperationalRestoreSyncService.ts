import { OperationalRestoreLocalRepository, OperationalRestoreRemoteRepository } from './OperationalRestoreContracts';

/**
 * This is discovery only: operational entities already have remote authority.
 * A failed or malformed remote read leaves the last valid local projection intact.
 */
export class OperationalRestoreSyncService {
  constructor(private readonly local: OperationalRestoreLocalRepository, private readonly remote: OperationalRestoreRemoteRepository) {}

  async sync(): Promise<void> {
    await this.local.replaceProjection(await this.remote.getSnapshot());
  }
}
