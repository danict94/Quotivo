import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, TextInput, View } from 'react-native';
import { BusinessProfile, choosePersistentLogo, deleteManagedLogo } from '../../businessProfile';
import { loadBusinessProfile, updateBusinessProfile } from '../../database';
import { Input } from '../../ui/components';
import { showError } from '../../ui/showOperationError';
import { useLegacyStyles } from '../../ui/legacyStyles';

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <Input {...props} />;
}

export function BusinessProfileEditor({onReturnToQuote,onClose}:{onReturnToQuote?:()=>void;onClose:()=>void}) {
  const styles = useLegacyStyles();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [validity, setValidity] = useState('30');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { loadBusinessProfile().then((value) => { setProfile(value); setValidity(String(value.defaultValidityDays)); }).catch(showError); }, []);
  if (!profile) return <View style={styles.center}><ActivityIndicator color="#B76F50" /></View>;
  const currentProfile = profile;
  const patch = (values: Partial<BusinessProfile>) => setProfile((current) => current ? { ...current, ...values } : current);
  async function save(next: BusinessProfile = currentProfile) {
    try {
      setSaving(true);
      const days = Number(validity);
      const value = { ...next, defaultValidityDays: days };
      await updateBusinessProfile(value);
      setProfile(value);
      Alert.alert('Profilo salvato', 'I dati saranno usati nei nuovi preventivi.');
      return true;
    } catch (error) { showError(error); return false; } finally { setSaving(false); }
  }
  async function selectLogo() {
    let selectedUri: string | null = null;
    try {
      setSaving(true);
      const selected = await choosePersistentLogo();
      if (!selected) return;
      selectedUri = selected.uri;
      const oldUri = currentProfile.logoUri;
      const next: BusinessProfile = { ...currentProfile, logoUri: selected.uri, logoMimeType: selected.mimeType, logoOriginalName: selected.originalName, defaultValidityDays: Number(validity) };
      await updateBusinessProfile(next);
      setProfile(next);
      selectedUri = null;
      if (oldUri !== selected.uri) deleteManagedLogo(oldUri);
    } catch (error) { deleteManagedLogo(selectedUri); showError(error); } finally { setSaving(false); }
  }
  async function removeLogo() {
    try {
      setSaving(true);
      const oldUri = currentProfile.logoUri;
      const next: BusinessProfile = { ...currentProfile, logoUri: null, logoMimeType: null, logoOriginalName: null, defaultValidityDays: Number(validity) };
      await updateBusinessProfile(next);
      setProfile(next);
      deleteManagedLogo(oldUri);
    } catch (error) { showError(error); } finally { setSaving(false); }
  }
  return <View><View style={styles.archiveHeader}><View><Text style={styles.pageTitle}>Profilo aziendale</Text><Text style={styles.pageSubtitle}>Dati impresa e valori predefiniti</Text></View>{onReturnToQuote?<Pressable onPress={onReturnToQuote}><Text style={styles.linkText}>Torna al preventivo</Text></Pressable>:<Pressable onPress={onClose}><Text style={styles.linkText}>Chiudi</Text></Pressable>}</View>
    <Text style={styles.formSection}>DATI ESSENZIALI</Text>
    <Field label="Denominazione" value={profile.businessName} editable onChangeText={(businessName) => patch({ businessName })} placeholder="Nome attività" />
    <View style={styles.twoColumns}><View style={styles.column}><Field label="Partita IVA" value={profile.vatNumber} editable onChangeText={(vatNumber) => patch({ vatNumber })} /></View><View style={styles.column}><Field label="Codice fiscale" value={profile.taxId} editable onChangeText={(taxId) => patch({ taxId })} /></View></View>
    <Field label="Indirizzo" value={profile.address} editable onChangeText={(address) => patch({ address })} />
    <View style={styles.twoColumns}><View style={styles.column}><Field label="CAP" value={profile.postalCode} editable keyboardType="number-pad" onChangeText={(postalCode) => patch({ postalCode })} /></View><View style={styles.column}><Field label="Città" value={profile.city} editable onChangeText={(city) => patch({ city })} /></View><View style={styles.shortColumn}><Field label="Prov." value={profile.province} editable maxLength={2} autoCapitalize="characters" onChangeText={(province) => patch({ province })} /></View></View>
    <Field label="Email" value={profile.email} editable keyboardType="email-address" autoCapitalize="none" onChangeText={(email) => patch({ email })} />
    <Field label="Telefono" value={profile.phone} editable keyboardType="phone-pad" onChangeText={(phone) => patch({ phone })} />
    <View style={styles.logoCard}>{profile.logoUri && profile.logoMimeType !== 'image/svg+xml' ? <Image source={{ uri: profile.logoUri }} style={styles.logoPreview} resizeMode="contain" /> : <View style={styles.logoPlaceholder}><Text style={styles.logoPlaceholderText}>{profile.logoUri ? 'SVG' : 'LOGO'}</Text></View>}<View style={styles.logoInfo}><Text style={styles.quoteTitle}>{profile.logoOriginalName || 'Nessun logo'}</Text><Text style={styles.pageSubtitle}>PNG, JPG, WEBP o SVG · max 5 MB</Text><View style={styles.logoActions}><Pressable disabled={saving} onPress={selectLogo}><Text style={styles.linkText}>{profile.logoUri ? 'Sostituisci' : 'Seleziona'}</Text></Pressable>{profile.logoUri && <Pressable disabled={saving} onPress={removeLogo}><Text style={styles.deleteLink}>Rimuovi</Text></Pressable>}</View></View></View>
    <Pressable style={styles.detailsToggle} onPress={() => setDetailsOpen(!detailsOpen)}><Text style={styles.detailsToggleText}>Dettagli facoltativi e predefiniti</Text><Text style={styles.chevron}>{detailsOpen ? '⌃' : '⌄'}</Text></Pressable>
    {detailsOpen && <View><Field label="Sito web" value={profile.website} editable autoCapitalize="none" onChangeText={(website) => patch({ website })} /><Field label="Validità predefinita (giorni)" value={validity} editable keyboardType="number-pad" onChangeText={setValidity} /><Field label="Condizioni predefinite" value={profile.defaultConditions} editable multiline numberOfLines={4} textAlignVertical="top" onChangeText={(defaultConditions) => patch({ defaultConditions })} /><Field label="Pagamenti predefiniti" value={profile.defaultPaymentTerms} editable multiline numberOfLines={3} textAlignVertical="top" placeholder="Es. 30% acconto, 40% avanzamento, 30% saldo" onChangeText={(defaultPaymentTerms) => patch({ defaultPaymentTerms })} /></View>}
    <Pressable disabled={saving} style={styles.primaryAction} onPress={() => save()}><Text style={styles.primaryButtonText}>{saving ? 'Salvataggio…' : 'Salva impostazioni'}</Text></Pressable>
  </View>;
}

