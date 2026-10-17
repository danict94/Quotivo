import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { EntitlementRepository } from '../entitlements/EntitlementRepository';
import { SupabaseEntitlementRepository } from '../entitlements/SupabaseEntitlementRepository';
import { AppConfigRepository } from '../versioning/AppConfigRepository';
import { SupabaseAppConfigRepository } from '../versioning/SupabaseAppConfigRepository';
import { BootstrapState, CachedBootstrap, resolveBootstrap } from './BootstrapState';

const entitlementRepository: EntitlementRepository = new SupabaseEntitlementRepository();
const appConfigRepository: AppConfigRepository = new SupabaseAppConfigRepository();
const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '0.0.0';
const initialState: BootstrapState = {
  status: 'bootstrapping', validation: 'UNAVAILABLE', entitlement: null, effectivePlan: 'FREE', config: null,
  version: 'OK', lastValidatedAt: null, capabilities: { hasPremiumAccess: false, canUseServerValidatedActions: false },
};

type BootstrapContextValue = BootstrapState & { refresh(): Promise<void> };
const BootstrapContext = createContext<BootstrapContextValue | null>(null);

function cacheKey(userId: string) { return `quotivo.backend-bootstrap.v1.${userId}`; }

export function BackendBootstrapProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState<BootstrapState>(initialState);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (auth.status !== 'authenticated') {
      setState(initialState);
      return;
    }

    const key = cacheKey(auth.session.user.id);
    setState(initialState);
    try {
      const [entitlement, config] = await Promise.all([entitlementRepository.getForCurrentUser(), appConfigRepository.get()]);
      const snapshot: CachedBootstrap = { entitlement, config, validatedAt: new Date().toISOString() };
      await AsyncStorage.setItem(key, JSON.stringify(snapshot));
      if (requestId.current === currentRequest) setState(resolveBootstrap(snapshot, appVersion, new Date(), true));
    } catch {
      try {
        const cached = await AsyncStorage.getItem(key);
        const snapshot = cached ? JSON.parse(cached) as CachedBootstrap : null;
        if (requestId.current === currentRequest) setState(resolveBootstrap(snapshot, appVersion));
      } catch {
        if (requestId.current === currentRequest) setState(resolveBootstrap(null, appVersion));
      }
    }
  }, [auth]);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<BootstrapContextValue>(() => ({ ...state, refresh }), [state, refresh]);
  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBackendBootstrap(): BootstrapContextValue {
  const value = useContext(BootstrapContext);
  if (!value) throw new Error('BackendBootstrapProvider mancante.');
  return value;
}
