export type AuthUser = {
  id: string;
  email: string | null;
  provider: 'email' | 'google' | null;
};

export type AuthSession = {
  accessToken: string;
  expiresAt: number | null;
  user: AuthUser;
};

export type AuthState =
  | { status: 'restoring'; session: null }
  | { status: 'unauthenticated'; session: null }
  | { status: 'authenticated'; session: AuthSession };
