import { AuthSession } from './AuthTypes';

export interface AuthRepository {
  getSession(): Promise<AuthSession | null>;
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
  signUp(email: string, password: string): Promise<AuthSession | null>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signInWithGoogle(): Promise<AuthSession>;
  signOut(): Promise<void>;
}
