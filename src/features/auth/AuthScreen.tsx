import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '../../ui/theme';
import { QuotivoMark } from '../../ui/QuotivoLogo';
import { useAuth } from './AuthProvider';

export function AuthScreen() {
  const { theme } = useTheme();
  const { signIn, signInWithGoogle, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<'login' | 'signup' | 'google' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const styles = createStyles(theme);

  async function submit(mode: 'login' | 'signup') {
    setMessage(null);
    if (!email.trim() || !password) {
      setMessage('Inserisci email e password.');
      return;
    }

    try {
      setPending(mode);
      if (mode === 'login') await signIn(email, password);
      else await signUp(email, password);
      if (mode === 'signup') setMessage('Controlla la tua email per confermare l’account, se richiesto.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Non è stato possibile completare l’operazione.');
    } finally {
      setPending(null);
    }
  }

  async function signInGoogle() {
    try {
      setMessage(null);
      setPending('google');
      await signInWithGoogle();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Non è stato possibile completare l’accesso con Google.');
    } finally {
      setPending(null);
    }
  }

  return <SafeAreaView style={styles.safeArea}><KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.card}>
      <View style={styles.mark}><QuotivoMark size={52} /></View>
      <Text style={styles.title}>Accedi a Quotivo</Text>
      <Text style={styles.subtitle}>I tuoi preventivi restano sul dispositivo.</Text>
      <Text style={styles.label}>Email</Text>
      <TextInput value={email} onChangeText={setEmail} style={styles.input} placeholder="nome@attivita.it" placeholderTextColor={theme.muted} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" />
      <Text style={styles.label}>Password</Text>
      <TextInput value={password} onChangeText={setPassword} style={styles.input} placeholder="Password" placeholderTextColor={theme.muted} autoCapitalize="none" autoCorrect={false} secureTextEntry textContentType="password" />
      {message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
      <Pressable disabled={pending !== null} style={[styles.primary, pending !== null && styles.disabled]} onPress={() => void submit('login')}><Text style={styles.primaryText}>{pending === 'login' ? 'Accesso in corso…' : 'Accedi'}</Text></Pressable>
      <Pressable disabled={pending !== null} style={[styles.secondary, pending !== null && styles.disabled]} onPress={() => void submit('signup')}><Text style={styles.secondaryText}>{pending === 'signup' ? 'Creazione in corso…' : 'Crea account'}</Text></Pressable>
      <Pressable disabled={pending !== null} style={[styles.google, pending !== null && styles.disabled]} onPress={() => void signInGoogle()}><Text style={styles.googleText}>{pending === 'google' ? 'Apertura Google…' : 'Continua con Google'}</Text></Pressable>
      {pending && <ActivityIndicator color={theme.green} style={styles.spinner} />}
    </View>
  </KeyboardAvoidingView></SafeAreaView>;
}

function createStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.background },
    container: { flex: 1, justifyContent: 'center', padding: 22 },
    card: { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 28, padding: 22 },
    mark: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    title: { color: theme.text, fontSize: 28, fontWeight: '800' },
    subtitle: { color: theme.muted, fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 24 },
    label: { color: theme.text, fontSize: 11, fontWeight: '800', letterSpacing: .6, marginBottom: 7, marginTop: 12, textTransform: 'uppercase' },
    input: { color: theme.text, backgroundColor: theme.surface2, borderColor: theme.border, borderWidth: 1, borderRadius: 14, fontSize: 15, paddingHorizontal: 13, paddingVertical: 12 },
    message: { color: theme.danger, fontSize: 12, lineHeight: 18, marginTop: 15 },
    primary: { alignItems: 'center', backgroundColor: theme.green, borderRadius: 15, marginTop: 22, padding: 15 },
    primaryText: { color: theme.onGreen, fontSize: 14, fontWeight: '800' },
    secondary: { alignItems: 'center', backgroundColor: theme.violetSoft, borderColor: theme.violet, borderRadius: 15, borderWidth: 1, marginTop: 10, padding: 15 },
    secondaryText: { color: theme.violet, fontSize: 14, fontWeight: '800' },
    google: { alignItems: 'center', backgroundColor: theme.surface2, borderColor: theme.border, borderRadius: 15, borderWidth: 1, marginTop: 10, padding: 15 },
    googleText: { color: theme.text, fontSize: 14, fontWeight: '800' },
    disabled: { opacity: .6 },
    spinner: { marginTop: 14 },
  });
}
