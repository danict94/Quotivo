import { AccountLifecycle, AccountLifecycleRepository } from './AccountLifecycle';

/** Server-authoritative and idempotent; it never changes local business data. */
export class DeactivateAccountUseCase {
  constructor(private readonly repository: AccountLifecycleRepository) {}
  execute(): Promise<AccountLifecycle> { return this.repository.setStatus('DEACTIVATED'); }
}
