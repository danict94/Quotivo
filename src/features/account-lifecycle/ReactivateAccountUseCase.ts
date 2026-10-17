import { AccountLifecycle, AccountLifecycleRepository } from './AccountLifecycle';

/** Server-authoritative and idempotent; it restores no data because none was removed. */
export class ReactivateAccountUseCase {
  constructor(private readonly repository: AccountLifecycleRepository) {}
  execute(): Promise<AccountLifecycle> { return this.repository.setStatus('ACTIVE'); }
}
