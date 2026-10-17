import { supabase } from '../../data/remote/supabaseClient';
import { AccountLifecycle, AccountLifecycleError, AccountLifecycleRepository, AccountLifecycleStatus } from './AccountLifecycle';

type RemoteError = { code?: string | null; message?: string | null; status?: number | null; name?: string | null };
type LifecycleRow = { status?: unknown; deactivated_at?: unknown; reactivated_at?: unknown };

function mapError(error: RemoteError): AccountLifecycleError {
  if (error.code === '28000' || error.message === 'AUTH_REQUIRED' || error.status === 401) return new AccountLifecycleError('AUTH_REQUIRED');
  if (error.code === '42501' || error.status === 403) return new AccountLifecycleError('RLS_DENIED');
  if (/network|fetch|offline|timeout|connect/i.test(`${error.name ?? ''} ${error.message ?? ''}`)) return new AccountLifecycleError('REMOTE_OFFLINE');
  return new AccountLifecycleError('REMOTE_ERROR');
}

function mapRow(value: LifecycleRow | undefined): AccountLifecycle {
  if (value?.status !== 'ACTIVE' && value?.status !== 'DEACTIVATED') throw new AccountLifecycleError('REMOTE_ERROR');
  return { status: value.status, deactivatedAt: typeof value.deactivated_at === 'string' ? value.deactivated_at : null, reactivatedAt: typeof value.reactivated_at === 'string' ? value.reactivated_at : null };
}

export class SupabaseAccountLifecycleRepository implements AccountLifecycleRepository {
  async get(): Promise<AccountLifecycle> {
    const { data, error } = await supabase.rpc('get_account_lifecycle');
    if (error) throw mapError(error);
    return mapRow((data as LifecycleRow[] | null)?.[0]);
  }

  async setStatus(status: AccountLifecycleStatus): Promise<AccountLifecycle> {
    const { data, error } = await supabase.rpc('set_account_lifecycle', { p_status: status });
    if (error) throw mapError(error);
    if (data !== status) throw new AccountLifecycleError('REMOTE_ERROR');
    return this.get();
  }
}
