import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { AccountLifecycle, AccountLifecycleError, AccountLifecycleStatus } from './AccountLifecycle';
import { DeactivateAccountUseCase } from './DeactivateAccountUseCase';
import { ReactivateAccountUseCase } from './ReactivateAccountUseCase';
import { SupabaseAccountLifecycleRepository } from './SupabaseAccountLifecycleRepository';

type LifecycleViewState = { lifecycle: AccountLifecycle | null; source: 'remote' | 'cache' | 'unknown'; loading: boolean };
type AccountLifecycleContextValue = LifecycleViewState & { refresh(): Promise<void>; deactivate(): Promise<void>; reactivate(): Promise<void> };
const initial: LifecycleViewState = { lifecycle: null, source: 'unknown', loading: true };
const AccountLifecycleContext = createContext<AccountLifecycleContextValue | null>(null);
const key = (userId: string) => `quotivo.account-lifecycle.v1.${userId}`;

function isLifecycle(value: unknown): value is AccountLifecycle {
  const row = value as Partial<AccountLifecycle> | null;
  return Boolean(row && (row.status === 'ACTIVE' || row.status === 'DEACTIVATED'));
}

export function AccountLifecycleProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState<LifecycleViewState>(initial);
  const request = useRef(0);
  const repository = useMemo(() => new SupabaseAccountLifecycleRepository(), []);

  const refresh = useCallback(async () => {
    const current = ++request.current;
    if (auth.status !== 'authenticated') { setState(initial); return; }
    const storageKey = key(auth.session.user.id);
    let cached: AccountLifecycle | null = null;
    try { const value = JSON.parse(await AsyncStorage.getItem(storageKey) ?? 'null'); cached = isLifecycle(value) ? value : null; } catch { cached = null; }
    if (cached && request.current === current) setState({ lifecycle: cached, source: 'cache', loading: true });
    try {
      const lifecycle = await repository.get();
      await AsyncStorage.setItem(storageKey, JSON.stringify(lifecycle));
      if (request.current === current) setState({ lifecycle, source: 'remote', loading: false });
    } catch {
      if (request.current === current) setState({ lifecycle: cached, source: cached ? 'cache' : 'unknown', loading: false });
    }
  }, [auth, repository]);

  useEffect(() => { void refresh(); }, [refresh]);

  const change = useCallback(async (status: AccountLifecycleStatus) => {
    if (auth.status !== 'authenticated') throw new AccountLifecycleError('AUTH_REQUIRED');
    const lifecycle = status === 'DEACTIVATED' ? await new DeactivateAccountUseCase(repository).execute() : await new ReactivateAccountUseCase(repository).execute();
    await AsyncStorage.setItem(key(auth.session.user.id), JSON.stringify(lifecycle));
    setState({ lifecycle, source: 'remote', loading: false });
  }, [auth, repository]);

  const value = useMemo<AccountLifecycleContextValue>(() => ({ ...state, refresh, deactivate: () => change('DEACTIVATED'), reactivate: () => change('ACTIVE') }), [change, refresh, state]);
  return <AccountLifecycleContext.Provider value={value}>{children}</AccountLifecycleContext.Provider>;
}

export function useAccountLifecycle() {
  const value = useContext(AccountLifecycleContext);
  if (!value) throw new Error('AccountLifecycleProvider mancante.');
  return value;
}
