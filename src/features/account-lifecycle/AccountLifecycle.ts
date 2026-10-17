export type AccountLifecycleStatus = 'ACTIVE' | 'DEACTIVATED';
export type AccountLifecycleErrorCode = 'AUTH_REQUIRED' | 'RLS_DENIED' | 'REMOTE_OFFLINE' | 'REMOTE_ERROR';

export type AccountLifecycle = { status: AccountLifecycleStatus; deactivatedAt: string | null; reactivatedAt: string | null };

export class AccountLifecycleError extends Error {
  constructor(readonly code: AccountLifecycleErrorCode) { super(code); this.name = 'AccountLifecycleError'; }
}

export function accountLifecycleUserMessage(error: unknown) {
  const code = error instanceof AccountLifecycleError ? error.code : null;
  if (code === 'AUTH_REQUIRED') return 'Accedi di nuovo per modificare lo stato dell account.';
  if (code === 'RLS_DENIED') return 'Non hai i permessi per modificare questo account.';
  if (code === 'REMOTE_OFFLINE') return 'Connessione non disponibile. Lo stato dell account non è stato modificato.';
  return 'Non è stato possibile modificare lo stato dell account. Riprova più tardi.';
}

export interface AccountLifecycleRepository {
  get(): Promise<AccountLifecycle>;
  setStatus(status: AccountLifecycleStatus): Promise<AccountLifecycle>;
}
