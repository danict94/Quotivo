import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { AuthRepository } from './AuthRepository';
import { SupabaseAuthRepository } from './SupabaseAuthRepository';
import { AuthState } from './AuthTypes';

type AuthContextValue = AuthState & {
  signUp(email: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const authRepository: AuthRepository = new SupabaseAuthRepository();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'restoring', session: null });

  useEffect(() => {
    let mounted = true;
    const applySession = (session: AuthState['session']) => {
      if (!mounted) return;
      setState(session ? { status: 'authenticated', session } : { status: 'unauthenticated', session: null });
    };

    const unsubscribe = authRepository.onSessionChange(applySession);
    authRepository.getSession().then(applySession).catch(() => applySession(null));

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    signUp: async (email, password) => {
      const session = await authRepository.signUp(email.trim(), password);
      if (session) setState({ status: 'authenticated', session });
    },
    signIn: async (email, password) => {
      const session = await authRepository.signIn(email.trim(), password);
      setState({ status: 'authenticated', session });
    },
    signInWithGoogle: async () => {
      const session = await authRepository.signInWithGoogle();
      setState({ status: 'authenticated', session });
    },
    signOut: async () => {
      await authRepository.signOut();
      setState({ status: 'unauthenticated', session: null });
    },
  }), [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider mancante.');
  return value;
}
