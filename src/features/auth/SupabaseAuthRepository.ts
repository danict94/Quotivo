import { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '../../data/remote/supabaseClient';
import { appScheme, authCallbackPath } from '../../config/appVariant';
import { AuthRepository } from './AuthRepository';
import { AuthSession, AuthUser } from './AuthTypes';

function toAuthUser(user: User): AuthUser {
  const provider=user.app_metadata.provider;
  return { id: user.id, email: user.email ?? null, provider:provider==='google'?'google':provider==='email'?'email':null };
}

function toAuthSession(session: Session): AuthSession {
  return {
    accessToken: session.access_token,
    expiresAt: session.expires_at ?? null,
    user: toAuthUser(session.user),
  };
}

function toAuthError(error: { message: string; code?: string; status?: number }): Error {
  const message = error.message.toLocaleLowerCase();

  if (message.includes('invalid login credentials')) return new Error('Email o password non corretti.');
  if (message.includes('already registered') || message.includes('already been registered')) return new Error('Questa email è già registrata.');
  if (message.includes('password should be') || message.includes('password') && message.includes('least')) return new Error('La password non soddisfa i requisiti minimi.');
  if (message.includes('network') || message.includes('fetch') || error.status === 0) return new Error('Connessione non disponibile. Riprova quando sei online.');

  return new Error('Non è stato possibile completare l’operazione. Riprova.');
}

function callbackParams(callbackUrl: string): Record<string, string> {
  const query = callbackUrl.split('?')[1]?.split('#')[0] ?? '';
  const fragment = callbackUrl.split('#')[1] ?? '';
  const values: Record<string, string> = {};

  for (const segment of `${query}&${fragment}`.split('&')) {
    const [key, value] = segment.split('=', 2);
    if (key && value) values[decodeURIComponent(key)] = decodeURIComponent(value);
  }

  return values;
}

export class SupabaseAuthRepository implements AuthRepository {
  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw toAuthError(error);
    return data.session ? toAuthSession(data.session) : null;
  }

  onSessionChange(listener: (session: AuthSession | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      listener(session ? toAuthSession(session) : null);
    });

    return () => data.subscription.unsubscribe();
  }

  async signUp(email: string, password: string): Promise<AuthSession | null> {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw toAuthError(error);
    return data.session ? toAuthSession(data.session) : null;
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw toAuthError(error);
    if (!data.session) throw new Error('Non è stato possibile avviare la sessione. Riprova.');
    return toAuthSession(data.session);
  }

  async signInWithGoogle(): Promise<AuthSession> {
    const redirectTo = Linking.createURL(authCallbackPath, { scheme: appScheme });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw toAuthError(error);
    if (!data.url) throw new Error('Non è stato possibile avviare l’accesso con Google.');

    let result: WebBrowser.WebBrowserAuthSessionResult;
    try {
      result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    } catch {
      throw new Error('Non è stato possibile aprire Google. Verifica la connessione e riprova.');
    }

    if (result.type === 'cancel' || result.type === 'dismiss') throw new Error('Accesso con Google annullato.');
    if (result.type !== 'success') throw new Error('Il ritorno da Google non è andato a buon fine. Riprova.');

    const params = callbackParams(result.url);
    if (params.error || !params.access_token || !params.refresh_token) {
      throw new Error('Google non ha completato l’accesso. Riprova.');
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (sessionError) throw toAuthError(sessionError);
    if (!sessionData.session) throw new Error('La sessione Google non è stata creata. Riprova.');
    return toAuthSession(sessionData.session);
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw toAuthError(error);
  }
}
