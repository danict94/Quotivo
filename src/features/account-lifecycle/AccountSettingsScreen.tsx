import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { useBackendBootstrap } from '../bootstrap/BackendBootstrapProvider';
import { Button, Card, UsageSummary } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { logoutUserMessage } from '../auth/boundedLogout';
import { accountLifecycleUserMessage } from './AccountLifecycle';
import { useAccountLifecycle } from './AccountLifecycleProvider';
import { freeQuotaPresentation } from '../quote-issuance/monthlyFreeQuota';
import { useMonthlyFreeQuota } from '../quote-issuance/useMonthlyFreeQuota';

export function AccountSettingsScreen({ onOpenBusinessProfile, onOpenNumbering }: { onOpenBusinessProfile(): void; onOpenNumbering(): void }) {
  const { theme, preference, setPreference } = useTheme(); const styles = createStyles(theme);
  const { session, signOut } = useAuth(); const { effectivePlan, entitlement } = useBackendBootstrap(); const { lifecycle, source, loading, deactivate, reactivate } = useAccountLifecycle();
  const [saving, setSaving] = useState(false); const [loggingOut, setLoggingOut] = useState(false); const [logoutError, setLogoutError] = useState<string | null>(null);
  const { quota, error: quotaError, loading: quotaLoading } = useMonthlyFreeQuota();
  const inactive = lifecycle?.status === 'DEACTIVATED'; const isPro = effectivePlan === 'PRO';
  const quotaPresentation = quota ? freeQuotaPresentation(quota) : null;
  const showFreeQuota = quota ? quota.monthlyLimit !== null : !isPro;
  const expiry = entitlement?.validUntil ? `Fino al ${new Date(entitlement.validUntil).toLocaleDateString('it-IT')}` : 'Senza scadenza';
  const provider = session?.user.provider === 'google' ? 'Google' : session?.user.provider === 'email' ? 'Email' : 'Account';
  const status = loading ? 'Verifica stato…' : inactive ? 'Disattivato' : lifecycle?.status === 'ACTIVE' ? 'Attivo' : 'Stato non disponibile';
  async function perform(action: () => Promise<void>) { try { setSaving(true); await action(); } catch (error) { Alert.alert('Stato account non modificato', accountLifecycleUserMessage(error)); } finally { setSaving(false); } }
  async function logout() { if(loggingOut)return; try { setLogoutError(null);setLoggingOut(true);await signOut(); } catch(error) { setLogoutError(logoutUserMessage(error)); } finally { setLoggingOut(false); } }
  const confirmDeactivation = () => Alert.alert('Disattivare account?', 'Disattivando l account conserverai preventivi, PDF, catalogo e storico. Non potrai emettere, modificare dati server o usare/condividere link pubblici finché non riattivi l account.', [{ text: 'Annulla', style: 'cancel' }, { text: 'Disattiva account', style: 'destructive', onPress: () => { void perform(deactivate); } }]);
  return <View><View style={styles.header}><Text style={styles.title}>Impostazioni</Text><Text style={styles.subtitle}>Account, attività e preferenze.</Text></View>
    <Text style={styles.section}>ACCOUNT</Text><Card><Text style={styles.cardTitle}>Account Quotivo</Text><Text style={styles.email}>{session?.user.email || 'Account Quotivo'}</Text><Row label="Piano" value={`${isPro ? 'Quotivo Pro' : 'Quotivo Free'}${isPro ? ` · ${expiry}` : ''}`}/>{showFreeQuota&&<UsageSummary title="Preventivi questo mese" loading={quotaLoading} error={quotaError} primary={quotaPresentation?.used} secondary={quotaPresentation?.remaining}/>}<Row label="Accesso" value={provider}/></Card>
    <Card style={styles.lifecycle}><Row label="Stato account" value={status} danger={inactive}/>{source === 'cache' && <Text style={styles.note}>Ultimo stato locale: conferma richiesta online.</Text>}{inactive ? <Button disabled={saving || loading} onPress={() => { void perform(reactivate); }}>Riattiva account</Button> : <Button variant="danger" disabled={saving || loading || !lifecycle} onPress={confirmDeactivation}>Disattiva account</Button>}</Card>
    <Pressable style={styles.item} onPress={onOpenBusinessProfile}><Text style={styles.cardTitle}>Profilo aziendale</Text><Text style={styles.note}>Logo, dati impresa e valori predefiniti.</Text></Pressable><Pressable style={styles.item} onPress={onOpenNumbering}><Text style={styles.cardTitle}>Numerazione preventivi</Text><Text style={styles.note}>Scegli da quale numero continuare.</Text></Pressable>
    <Text style={styles.section}>ASPETTO</Text><Card><Text style={styles.cardTitle}>Tema</Text><View style={styles.choices}><Button variant="secondary" onPress={() => void setPreference('light')}>Chiaro{preference === 'light' ? ' ✓' : ''}</Button><Button variant="secondary" onPress={() => void setPreference('dark')}>Scuro{preference === 'dark' ? ' ✓' : ''}</Button><Button variant="secondary" onPress={() => void setPreference('system')}>Sistema{preference === 'system' ? ' ✓' : ''}</Button></View></Card>
    {logoutError&&<Text style={styles.logoutError}>{logoutError}</Text>}<Button variant="danger" disabled={loggingOut} style={styles.logout} onPress={() => void logout()}>{loggingOut ? 'Uscita in corso…' : logoutError ? 'Riprova logout' : 'Esci dall account'}</Button>
  </View>;
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) { const { theme } = useTheme(); return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, borderTopWidth: 1, borderTopColor: theme.border, marginTop: 13, paddingTop: 13 }}><Text style={{ color: theme.muted, fontSize: 12, fontWeight: '800' }}>{label}</Text><Text style={{ color: danger ? theme.danger : theme.text, fontSize: 13, fontWeight: '800', textAlign: 'right', flexShrink: 1 }}>{value}</Text></View>; }

function createStyles(theme: import('../../ui/tokens').Theme) { return StyleSheet.create({ header: { marginBottom: 8 }, title: { color: theme.text, fontSize: 25, fontWeight: '900' }, subtitle: { color: theme.muted, fontSize: 13, marginTop: 4 }, section: { color: theme.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 24, marginBottom: 8 }, cardTitle: { color: theme.text, fontSize: 14, fontWeight: '800' }, email: { color: theme.text, fontSize: 14, lineHeight: 20, marginTop: 12 }, lifecycle: { marginTop: 10, gap: 12 }, note: { color: theme.muted, fontSize: 12, lineHeight: 18 }, item: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 18, padding: 14, marginTop: 12, gap: 5 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }, logoutError: { color: theme.danger, fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 16 }, logout: { marginTop: 12, marginBottom: 8 } }); }
