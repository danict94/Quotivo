import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CatalogItem, Client, closeAccountDatabase, createDraft, createMeasurementUnit, createVatRate, deleteDraft, finalizeDraft, findCatalogItemByTitle, initializeDatabase, listCatalogItems, listClients, listMeasurementUnits, listQuotes, listRecentWorkItems, listVatRates, loadBusinessProfile, loadDocumentExport, loadDraftBusinessSnapshot, loadIssuedSnapshot, loadQuoteShareLinkCache, MeasurementUnit, saveCatalogItem, saveClient, saveDraft, saveQuoteShareLinkCache, updateBusinessProfile, VatRate } from './src/database';
import { BusinessProfile, choosePersistentLogo, deleteManagedLogo } from './src/businessProfile';
import { formatQuoteNumber } from './src/emissionClock';
import { calculateEconomics, createEmptyQuoteItem, formatMoney, globalDiscountInputKey, hasMeaningfulDraftContent, itemTotalCents, materializeNumericInputs, newId, numericInputKey, NumericInputDrafts, parseMoneyCents, parsePercentBasisPoints, Quote, quoteTotalCents, tryParseDecimal } from './src/domain';
import { buildDraftDocumentModel } from './src/documents/documentModel';
import { generateStoredFinalPdf, openIssuedPdf } from './src/documents/finalPdfWorkflow';
import { generateStoredFinalDocx } from './src/documents/docxWorkflow';
import { PdfPreview } from './src/documents/PdfPreview';
import { generateDraftPdf, removeDraftPdf } from './src/documents/pdfService';
import { prepareFinalPdfForShare, shareDocument, shareQuoteLink } from './src/documents/shareService';
import { getQuoteShareCapabilities, quoteShareLifecycleLabel, quoteShareUnavailableMessage, QuoteShareState } from './src/features/quote-sharing/shareCapabilities';
import { QuoteShare, QuoteShareCommercialOutcome, QuoteShareLifecycle } from './src/features/quote-sharing/QuoteSharingRepository';
import { createOrRecoverQuoteShare, recoverActiveQuoteShareLink } from './src/features/quote-sharing/quoteShareUseCases';
import { CommercialStatusBadge } from './src/features/quote-status/CommercialStatusBadge';
import { CanonicalCommercialOutcome, commercialOutcomeProvenanceLabel, CommercialOutcomeRemoteError, ManualCommercialOutcome, recordManualCommercialOutcome } from './src/features/quote-status/recordManualCommercialOutcome';
import { Input, Select, Toggle } from './src/ui/components';
import { showError } from './src/ui/showOperationError';
import { Icon, IconName } from './src/ui/Icon';
import { ThemeProvider, useTheme } from './src/ui/theme';
import { Theme } from './src/ui/tokens';
import { QuotivoLogo, QuotivoMark } from './src/ui/QuotivoLogo';
import { AuthProvider, useAuth } from './src/features/auth/AuthProvider';
import { AuthScreen } from './src/features/auth/AuthScreen';
import { BackendBootstrapProvider, useBackendBootstrap } from './src/features/bootstrap/BackendBootstrapProvider';
import { AccountLifecycleProvider } from './src/features/account-lifecycle/AccountLifecycleProvider';
import { AccountSettingsScreen } from './src/features/account-lifecycle/AccountSettingsScreen';
import { SupabaseQuoteIssuanceRepository } from './src/features/quote-issuance/SupabaseQuoteIssuanceRepository';
import { authorizeQuoteIssue } from './src/features/quote-issuance/authorizeQuoteIssue';
import { authorizeQuoteRevisionIssue } from './src/features/quote-issuance/authorizeQuoteRevisionIssue';
import { SupabaseQuoteNumberingRepository } from './src/features/quote-numbering/SupabaseQuoteNumberingRepository';
import { SupabaseQuoteSharingRepository } from './src/features/quote-sharing/SupabaseQuoteSharingRepository';
import { claimLegacyDataForCurrentAccount, inspectLegacyDataClaim, LegacyDataClaimAvailability } from './src/features/local-data/legacyDataClaim';
import { canCreateRevisionInEditor, createRevisionForEditor } from './src/features/revisions/revisionEditorActions';
import { finalizeRevisionShareLifecycle } from './src/features/quote-issuance/finalizeRevisionShareLifecycle';
import { RecentWorkItem } from './src/features/recent-work-items/recentWorkItems';
import { HomeScreen } from './src/features/dashboard/HomeScreen';
import { ArchiveScreen } from './src/features/archive/ArchiveScreen';
import { ArchiveNavigationIntent } from './src/features/archive/archiveNavigation';
import { ClientsEditor } from './src/features/clients/ClientsEditor';
import { CatalogEditor } from './src/features/catalog/CatalogEditor';
const quoteIssuanceRepository = new SupabaseQuoteIssuanceRepository();
const quoteNumberingRepository = new SupabaseQuoteNumberingRepository();
const quoteSharingRepository = new SupabaseQuoteSharingRepository();
type Screen = 'home' | 'archive' | 'clients' | 'catalog' | 'settings' | 'numbering' | 'business-profile' | 'editor';
const normalizeSearch=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
export default function App() {
  return <SafeAreaProvider><ThemeProvider><AuthProvider><BackendBootstrapProvider><AccountLifecycleProvider><QuotivoApp /></AccountLifecycleProvider></BackendBootstrapProvider></AuthProvider></ThemeProvider></SafeAreaProvider>;
}
function QuotivoApp() {
  const { status, session } = useAuth();
  const bootstrap = useBackendBootstrap();
  const { theme } = useTheme();
  useEffect(() => {
    if (status === 'unauthenticated') void closeAccountDatabase().catch(() => undefined);
  }, [status]);
  if (status === 'restoring') return <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}><ActivityIndicator color={theme.green} /></SafeAreaView>;
  if (status === 'unauthenticated') return <AuthScreen />;
  if (bootstrap.status === 'bootstrapping') return <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}><ActivityIndicator color={theme.green} /></SafeAreaView>;
  return <View style={{ flex: 1 }}><LocalQuotivoApp key={session.user.id} ownerUserId={session.user.id} /></View>;
}
function LocalQuotivoApp({ ownerUserId }: { ownerUserId: string }) {
  const {theme,preference,ready,setPreference}=useTheme(); styles=createStyles(theme);
  const { version } = useBackendBootstrap();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>('home');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [commercialOutcomes, setCommercialOutcomes] = useState<Record<string, QuoteShareCommercialOutcome | null>>({});
  const [initialArchiveFilter, setInitialArchiveFilter] = useState<ArchiveNavigationIntent | undefined>();
  const [editing, setEditing] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [legacyClaimAvailability, setLegacyClaimAvailability] = useState<LegacyDataClaimAvailability>('unavailable');
  const [claimingLegacyData, setClaimingLegacyData] = useState(false);
  const refresh = useCallback(async () => {
    const nextQuotes = await listQuotes();
    const cachedOutcomes = await Promise.all(nextQuotes.map(async (quote) => {
      if (quote.status === 'draft') return [quote.id, null] as const;
      const cache = await loadQuoteShareLinkCache(quote.id).catch(() => null);
      return [quote.id, cache?.commercialOutcome as QuoteShareCommercialOutcome | null ?? null] as const;
    }));
    setQuotes(nextQuotes);
    setCommercialOutcomes(Object.fromEntries(cachedOutcomes));
    setLoadError(null);
  }, []);
  useEffect(() => {
    let active = true;
    initializeDatabase(ownerUserId)
      .then(refresh)
      .then(() => inspectLegacyDataClaim(ownerUserId))
      .then((availability) => { if (active) setLegacyClaimAvailability(availability); })
      .catch((error) => { setLoadError(error instanceof Error ? error : new Error('Archivio locale non disponibile.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ownerUserId, refresh]);
  useEffect(() => {
    if (legacyClaimAvailability !== 'available' || claimingLegacyData) return;
    Alert.alert(
      'Dati Quotivo trovati',
      'Abbiamo trovato dati Quotivo salvati su questo dispositivo.\n\nVuoi associarli a questo account?',
      [
        { text: 'Non ora', style: 'cancel', onPress: () => setLegacyClaimAvailability('unavailable') },
        { text: 'Importa i miei dati', onPress: () => { void importLegacyData(); } },
      ],
    );
  }, [claimingLegacyData, legacyClaimAvailability]);
  async function importLegacyData() {
    try {
      setClaimingLegacyData(true);
      await claimLegacyDataForCurrentAccount(ownerUserId);
      await refresh();
      setLegacyClaimAvailability('claimed');
      Alert.alert('Dati associati', 'I dati Quotivo salvati sul dispositivo sono ora associati a questo account.');
    } catch (error) {
      showError(error);
    } finally {
      setClaimingLegacyData(false);
    }
  }

  async function startDraft() {
    try {
      const id = await createDraft();
      const current = await listQuotes();
      setQuotes(current);
      const quote = current.find((item) => item.id === id);
      if (quote) { setEditing(quote); setScreen('editor'); }
    } catch (error) { showError(error); }
  }
  async function closeEditor() { await refresh(); setEditing(null); setScreen('archive'); }
  async function startDraftForClient(client:Client) {
    try { const id=await createDraft(); const current=await listQuotes(); const draft=current.find((quote)=>quote.id===id); if(!draft)return; const populated={...draft,clientId:client.id,client:client.name,clientContactName:client.contactName,clientPhone:client.phone,clientEmail:client.email,clientAddress:client.address,clientTaxId:client.taxId,clientVatNumber:client.vatNumber,siteAddress:client.address}; await saveDraft(populated); setQuotes(await listQuotes());setEditing(populated);setScreen('editor'); } catch(error) { showError(error); }
  }
  if (!ready) return <SafeAreaView style={styles.center}><ActivityIndicator color={theme.green} /></SafeAreaView>;
  if (preference===null) return <ThemeOnboarding onChoose={setPreference}/>;
  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={theme.green} /></SafeAreaView>;
  if (loadError) return <SafeAreaView style={styles.safeArea}><View style={styles.center}><Text style={styles.emptyTitle}>Archivio non disponibile</Text><Text style={styles.emptyText}>I dati non sono stati caricati. Riprova senza uscire dall’account.</Text><Pressable style={styles.primaryAction} onPress={() => { setLoading(true); initializeDatabase(ownerUserId).then(refresh).catch((error) => setLoadError(error instanceof Error ? error : new Error('Archivio locale non disponibile.'))).finally(() => setLoading(false)); }}><Text style={styles.primaryButtonText}>Riprova</Text></Pressable></View></SafeAreaView>;
  if (screen === 'editor' && editing) return <QuoteEditor key={editing.id} initialQuote={editing} onClose={closeEditor} onRevisionDraft={async(quoteId)=>{const draft=await createRevisionForEditor(quoteId);setQuotes(await listQuotes());setEditing(draft);}} onOpenSettings={(quote)=>{setEditing(quote);setScreen('business-profile');}} onOpenNumbering={()=>setScreen('numbering')} />;

  const openQuote = (quote: Quote) => { setEditing(quote); setScreen('editor'); };
  const openArchive = (intent?: ArchiveNavigationIntent) => { setInitialArchiveFilter(intent); setScreen('archive'); };
  return <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}><StatusBar style="dark" /><View style={styles.appShell}>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 94 + insets.bottom }]} showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}><View><QuotivoLogo width={142}/></View></View>
      {version === 'UPDATE_AVAILABLE' && <View style={styles.lockNotice}><Text style={styles.lockText}>È disponibile un aggiornamento di Quotivo.</Text></View>}
      {version === 'UPDATE_REQUIRED' && <View style={styles.lockNotice}><Text style={styles.lockText}>Aggiorna Quotivo per usare le funzioni che richiedono una validazione online. Archivio ed esportazioni restano disponibili.</Text></View>}
      {version === 'MAINTENANCE' && <View style={styles.lockNotice}><Text style={styles.lockText}>Le funzioni online sono temporaneamente in manutenzione. I tuoi documenti locali restano disponibili.</Text></View>}
      {screen === 'home' ? <HomeScreen quotes={quotes} outcomes={commercialOutcomes} onStartDraft={startDraft} onOpenArchive={openArchive} onOpenQuote={openQuote} onDeleteDraft={confirmDeleteDraft} /> : screen === 'archive' ? <ArchiveScreen key={initialArchiveFilter ?? 'ALL'} quotes={quotes} outcomes={commercialOutcomes} initialArchiveFilter={initialArchiveFilter} onStartDraft={startDraft} onOpenQuote={openQuote} onDeleteDraft={confirmDeleteDraft} /> : screen === 'clients' ? <ClientsEditor onCreateQuote={startDraftForClient} /> : screen === 'catalog' ? <CatalogEditor /> : screen === 'settings' ? <AccountSettingsScreen onOpenBusinessProfile={()=>setScreen('business-profile')} onOpenNumbering={()=>setScreen('numbering')} /> : screen === 'numbering' ? <QuoteNumberingScreen onClose={()=>setScreen('settings')} /> : <BusinessProfileEditor onReturnToQuote={editing?()=>setScreen('editor'):undefined} onClose={()=>setScreen('settings')} />}
    </ScrollView>
    <View style={[styles.tabBar, { height: 64 + insets.bottom, paddingBottom: insets.bottom }]}><TabButton label="Home" icon="home-variant-outline" active={screen === 'home'} onPress={() => setScreen('home')} /><TabButton label="Preventivi" icon="file-document-outline" active={screen === 'archive'} onPress={() => openArchive()} /><TabButton label="Clienti" icon="account-group-outline" active={screen === 'clients'} onPress={() => setScreen('clients')} /><TabButton label="Catalogo" icon="format-list-bulleted" active={screen === 'catalog'} onPress={() => setScreen('catalog')} /><TabButton label="Impostazioni" icon="cog-outline" active={screen === 'settings'} onPress={() => setScreen('settings')} /></View>
  </View></SafeAreaView>;

  function confirmDeleteDraft(quote: Quote) {
    Alert.alert('Eliminare la bozza?', `“${quote.title || 'Preventivo senza titolo'}” verrà eliminata definitivamente.`, [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina bozza', style: 'destructive', onPress: async () => {
        try { await deleteDraft(quote.id); setQuotes((current) => current.filter((value) => value.id !== quote.id)); }
        catch (error) { showError(error); }
      } },
    ]);
  }
}

function SettingsScreen2({onOpenBusinessProfile,onOpenNumbering}:{onOpenBusinessProfile:()=>void;onOpenNumbering:()=>void}) {
  const {preference,setPreference}=useTheme(); const {session,signOut}=useAuth(); const {effectivePlan,entitlement}=useBackendBootstrap(); const [loggingOut,setLoggingOut]=useState(false); const provider=session?.user.provider==='google'?'Google':session?.user.provider==='email'?'Email':'Account'; const isPro=effectivePlan==='PRO'; const expiry=entitlement?.validUntil?`Fino al ${new Date(entitlement.validUntil).toLocaleDateString('it-IT')}`:'Senza scadenza';
  async function logout(){try{setLoggingOut(true);await signOut();}catch{Alert.alert('Logout non riuscito','Controlla la connessione e riprova. I dati locali restano sul dispositivo.');}finally{setLoggingOut(false);}}
  return <View><View style={styles.archiveHeader}><View><Text style={styles.pageTitle}>Impostazioni</Text><Text style={styles.pageSubtitle}>Account, attività e preferenze.</Text></View></View><Text style={styles.formSection}>ACCOUNT</Text><View style={styles.accountCard}><View style={styles.accountHeading}><View style={styles.accountIcon}><Icon name="account-outline" size={22}/></View><Text style={styles.quoteTitle}>Account Quotivo</Text></View><Text style={styles.accountEmail} numberOfLines={2} ellipsizeMode="tail">{session?.user.email||'Account Quotivo'}</Text><View style={styles.accountRow}><Text style={styles.accountLabel}>Piano</Text><View style={styles.accountValue}><Text style={[styles.planBadge,isPro?styles.proBadge:styles.freeBadge]}>{isPro?'PRO':'FREE'}</Text><Text style={styles.planName}>{isPro?'Quotivo Pro':'Quotivo Free'}</Text><Text style={styles.quoteClient}>{isPro?expiry:'Piano gratuito'}</Text></View></View><View style={styles.accountRow}><Text style={styles.accountLabel}>Accesso</Text><Text style={styles.planName}>{provider}</Text></View></View><Pressable style={styles.compactItemCard} onPress={onOpenBusinessProfile}><Text style={styles.quoteTitle}>Profilo aziendale</Text><Text style={styles.quoteClient}>Logo, dati impresa e valori predefiniti.</Text></Pressable><Pressable style={styles.compactItemCard} onPress={onOpenNumbering}><Text style={styles.quoteTitle}>Numerazione preventivi</Text><Text style={styles.quoteClient}>Scegli da quale numero continuare</Text></Pressable><Text style={styles.formSection}>ASPETTO</Text><View style={styles.appearanceCard}><Text style={styles.quoteTitle}>Tema</Text><View style={styles.themeModeList}><Choice label="Chiaro" active={preference==='light'} onPress={()=>void setPreference('light')}/><Choice label="Scuro" active={preference==='dark'} onPress={()=>void setPreference('dark')}/><Choice label="Sistema" active={preference==='system'} onPress={()=>void setPreference('system')}/></View></View><Pressable disabled={loggingOut} style={styles.logoutRow} onPress={()=>void logout()}><Icon name="logout" size={20} color={styles.deleteLink.color}/><Text style={styles.logoutText}>{loggingOut?'Uscita in corso…':'Esci dall’account'}</Text></Pressable></View>;
}

function SettingsScreen({onOpenBusinessProfile,onOpenNumbering}:{onOpenBusinessProfile:()=>void;onOpenNumbering:()=>void}) {
  const {preference,setPreference}=useTheme(); const {session,signOut}=useAuth(); const {effectivePlan,entitlement}=useBackendBootstrap(); const [loggingOut,setLoggingOut]=useState(false);
  const isPro=effectivePlan==='PRO'; const expiry=entitlement?.validUntil?`Fino al ${new Date(entitlement.validUntil).toLocaleDateString('it-IT')}`:'Senza scadenza';
  async function logout(){try{setLoggingOut(true);await signOut();}catch{Alert.alert('Logout non riuscito','Controlla la connessione e riprova. I dati locali restano sul dispositivo.');}finally{setLoggingOut(false);}}
  return <View><View style={styles.archiveHeader}><View><Text style={styles.pageTitle}>Impostazioni</Text><Text style={styles.pageSubtitle}>Account, attività e preferenze.</Text></View></View><Text style={styles.formSection}>ACCOUNT</Text><View style={styles.accountCard}><View style={styles.accountHeading}><View style={styles.accountIcon}><Icon name="account-outline" size={22}/></View><Text style={styles.quoteTitle}>Account Quotivo</Text></View><Text style={styles.accountEmail} numberOfLines={2} ellipsizeMode="tail">{session?.user.email||'Account Quotivo'}</Text><View style={styles.accountRow}><Text style={styles.accountLabel}>Piano</Text><View style={styles.accountValue}><Text style={[styles.planBadge,isPro?styles.proBadge:styles.freeBadge]}>{isPro?'PRO':'FREE'}</Text><Text style={styles.planName}>{isPro?'Quotivo Pro':'Quotivo Free'}</Text><Text style={styles.quoteClient}>{isPro?expiry:'Piano gratuito'}</Text></View></View><View style={styles.accountRow}><Text style={styles.accountLabel}>Accesso</Text><Text style={styles.planName}>Email</Text></View></View><Pressable style={styles.compactItemCard} onPress={onOpenBusinessProfile}><Text style={styles.quoteTitle}>Profilo aziendale</Text><Text style={styles.quoteClient}>Logo, dati impresa e valori predefiniti.</Text></Pressable><Text style={styles.formSection}>ASPETTO</Text><View style={styles.appearanceCard}><Text style={styles.quoteTitle}>Tema</Text><View style={styles.themeModeList}><Choice label="Chiaro" active={preference==='light'} onPress={()=>void setPreference('light')}/><Choice label="Scuro" active={preference==='dark'} onPress={()=>void setPreference('dark')}/><Choice label="Sistema" active={preference==='system'} onPress={()=>void setPreference('system')}/></View></View><Pressable disabled={loggingOut} style={styles.logoutRow} onPress={()=>void logout()}><Icon name="logout" size={20} color={styles.deleteLink.color}/><Text style={styles.logoutText}>{loggingOut?'Uscita in corso…':'Esci dall’account'}</Text></Pressable></View>;
}

function QuoteNumberingScreen({onClose}:{onClose:()=>void}) {
  const year=new Date().getFullYear(); const [current,setCurrent]=useState<{lastNumber:number;nextNumber:number}|undefined>(undefined); const [external,setExternal]=useState(''); const [localMax,setLocalMax]=useState(0); const [saving,setSaving]=useState(false);
  useEffect(()=>{Promise.all([quoteNumberingRepository.get(year),listQuotes()]).then(([sequence,quotes])=>{setCurrent(sequence??{lastNumber:0,nextNumber:1});setLocalMax(Math.max(0,...quotes.filter(q=>q.numberYear===year).map(q=>q.number??0)));}).catch(showError);},[year]);
  const typed=Number(external); const baseline=Math.max(localMax,Number.isSafeInteger(typed)&&typed>=0?typed:0); const next=(current?.lastNumber??baseline)+1;
  async function save(start:boolean){try{setSaving(true);const value=start?baseline:typed;if(!Number.isSafeInteger(value)||value<0)throw new Error('Inserisci un numero valido.');if(!start&&current&&value<=current.lastNumber)throw new Error('Inserisci un numero maggiore dell’ultimo già registrato.');const result=start?await quoteNumberingRepository.initialize(year,value):await quoteNumberingRepository.advance(year,value);setCurrent(result);setExternal('');Alert.alert('Numerazione aggiornata',`Il prossimo preventivo sarà ${result.nextNumber}/${year}.`);}catch(error){showError(error)}finally{setSaving(false)}}
  if(!current)return <View style={styles.center}><ActivityIndicator color="#B76F50"/></View>;
  const active=current.lastNumber>0||current.nextNumber>1;
  return <View><View style={styles.archiveHeader}><View><Text style={styles.pageTitle}>Numerazione preventivi</Text><Text style={styles.pageSubtitle}>Mantieni una numerazione continua anche se usi altri software.</Text></View><Pressable onPress={onClose}><Text style={styles.linkText}>Chiudi</Text></Pressable></View>{!active?<><Text style={styles.formSection}>PRIMA CONFIGURAZIONE</Text><View style={styles.compactItemCard}><Text style={styles.quoteTitle}>Come vuoi iniziare la numerazione?</Text><Text style={styles.quoteClient}>Utile se stai passando a Quotivo da un altro software.</Text><Pressable disabled={saving} style={styles.primaryAction} onPress={()=>void save(true)}><Text style={styles.primaryButtonText}>Inizia una nuova numerazione</Text></Pressable><Text style={styles.quoteClient}>Prossimo preventivo: {Math.max(1,baseline+1)}/{year}</Text></View><View style={styles.compactItemCard}><Text style={styles.quoteTitle}>Continua la numerazione che usi già</Text><Field label="Ultimo numero utilizzato" value={external} editable={!saving} keyboardType="number-pad" placeholder="Es. 47" onChangeText={setExternal}/><Text style={styles.quoteClient}>Il prossimo preventivo sarà {Math.max(1,baseline+1)}/{year}</Text><Pressable disabled={saving} style={styles.previewAction} onPress={()=>void save(true)}><Text style={styles.previewActionText}>Continua numerazione</Text></Pressable></View></>:<><View style={styles.compactItemCard}><Text style={styles.quoteTitle}>Numerazione {year}</Text><Text style={styles.quoteClient}>Ultimo numero: {current.lastNumber}/{year}</Text><Text style={styles.quoteTotal}>Prossimo: {current.nextNumber}/{year}</Text></View><Text style={styles.formSection}>AGGIORNA</Text><View style={styles.compactItemCard}><Text style={styles.quoteTitle}>Ho emesso preventivi fuori Quotivo</Text><Text style={styles.quoteClient}>Se utilizzi anche altri software, aggiorna qui l’ultimo numero utilizzato prima di emettere il prossimo preventivo con Quotivo.</Text><Field label="Ultimo numero utilizzato fuori Quotivo" value={external} editable={!saving} keyboardType="number-pad" onChangeText={setExternal}/>{Number.isSafeInteger(typed)&&typed>current.lastNumber&&<Text style={styles.quoteClient}>Il prossimo Quotivo sarà {typed+1}/{year}</Text>}<Pressable disabled={saving} style={styles.previewAction} onPress={()=>void save(false)}><Text style={styles.previewActionText}>Aggiorna numero</Text></Pressable></View></>}</View>;
}

function BusinessProfileEditor({onReturnToQuote,onClose}:{onReturnToQuote?:()=>void;onClose:()=>void}) {
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

function QuoteEditor({ initialQuote, onClose, onRevisionDraft, onOpenSettings, onOpenNumbering }: { initialQuote: Quote; onClose: () => void; onRevisionDraft:(quoteId:string)=>Promise<void>; onOpenSettings:(quote:Quote)=>void; onOpenNumbering:()=>void }) {
  const { effectivePlan } = useBackendBootstrap();
  const [quote, setQuote] = useState(initialQuote);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{uri:string;title:string;temporary:boolean}|null>(null);
  const [pdfError, setPdfError] = useState<string|null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareId, setShareId] = useState<string|null>(null);
  const [shareLifecycle, setShareLifecycle] = useState<QuoteShareLifecycle|null>(null);
  const [commercialOutcome, setCommercialOutcome] = useState<QuoteShareCommercialOutcome|null>(null);
  const [commercialOutcomeSource, setCommercialOutcomeSource] = useState<CanonicalCommercialOutcome['source']>(null);
  const [commercialOutcomeDecidedAt, setCommercialOutcomeDecidedAt] = useState<string|null>(null);
  const [openedAt, setOpenedAt] = useState<string|null>(null);
  const [units, setUnits] = useState<MeasurementUnit[]>([]);
  const [vatRates, setVatRates] = useState<VatRate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile|null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [clientContact, setClientContact] = useState(initialQuote.clientContactName);
  const [clientPhone, setClientPhone] = useState(initialQuote.clientPhone);
  const [clientEmail, setClientEmail] = useState(initialQuote.clientEmail);
  const [clientTaxId, setClientTaxId] = useState(initialQuote.clientTaxId);
  const [clientVatNumber, setClientVatNumber] = useState(initialQuote.clientVatNumber);
  const [saveClientToBook, setSaveClientToBook] = useState(false);
  const [siteMatchesClient, setSiteMatchesClient] = useState(initialQuote.siteAddress === initialQuote.clientAddress && Boolean(initialQuote.clientAddress));
  const [contactsOpen, setContactsOpen] = useState(Boolean(initialQuote.clientContactName || initialQuote.clientPhone || initialQuote.clientEmail));
  const [quoteOptionsOpen, setQuoteOptionsOpen] = useState(initialQuote.globalDiscountBasisPoints > 0);
  const [defaultVatOpen, setDefaultVatOpen] = useState(false);
  const [step, setStep] = useState<1|2|3>(1);
  const [activeItemId, setActiveItemId] = useState<string | null>(initialQuote.items.find((item)=>item.confirmed===false)?.id ?? null);
  const [detailItems, setDetailItems] = useState<Record<string, boolean>>({});
  const [customUnitItem, setCustomUnitItem] = useState<string | null>(null);
  const [customUnitLabel, setCustomUnitLabel] = useState('');
  const [customVatItem, setCustomVatItem] = useState<string | null>(null);
  const [customVatText, setCustomVatText] = useState('');
  const [unitPickerItem, setUnitPickerItem] = useState<string | null>(null);
  const [vatPickerItem, setVatPickerItem] = useState<string | null>(null);
  const [catalogPickerItem, setCatalogPickerItem] = useState<string | null>(null);
  const [catalogPickerQuery, setCatalogPickerQuery] = useState('');
  const [catalogSuggestionsItem, setCatalogSuggestionsItem] = useState<string | null>(null);
  const [catalogModalItem, setCatalogModalItem] = useState<string | null>(null);
  const [catalogModalQuery, setCatalogModalQuery] = useState('');
  const [recentModalItem, setRecentModalItem] = useState<string | null>(null);
  const [recentItems, setRecentItems] = useState<RecentWorkItem[]>([]);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientPickerQuery, setClientPickerQuery] = useState('');
  const [pickerClients, setPickerClients] = useState<Client[]>([]);
  const [canCreateRevision,setCanCreateRevision]=useState(false);
  const numericDrafts = useRef<NumericInputDrafts>({});
  const operationInFlight = useRef(false);
  const editable = quote.status === 'draft';
  const total = useMemo(() => quoteTotalCents(quote), [quote]);
  const shareState: QuoteShareState = { shareId, lifecycle: shareLifecycle, commercialOutcome, openedAt };
  const shareCapabilities = getQuoteShareCapabilities(shareState);
  const setCanonicalOutcome = (outcome: CanonicalCommercialOutcome) => { setCommercialOutcome(outcome.outcome); setCommercialOutcomeSource(outcome.source); setCommercialOutcomeDecidedAt(outcome.decidedAt); };
  const setShareFromRemote = (share: QuoteShare) => { setShareId(share.id); setShareLifecycle(share.lifecycle); setCommercialOutcome(share.commercialOutcome); setCommercialOutcomeSource(share.commercialOutcomeSource ?? null); setCommercialOutcomeDecidedAt(share.commercialOutcomeDecidedAt ?? null); setOpenedAt(share.openedAt ?? null); };
  const catalogModalItems=useMemo(()=>catalogItems.filter((catalog)=>normalizeSearch(catalog.title).includes(normalizeSearch(catalogModalQuery.trim()))),[catalogItems,catalogModalQuery]);
  const patchItem = (id: string, patch: Partial<Quote['items'][number]>) => setQuote((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  useEffect(() => { Promise.all([listMeasurementUnits(),listVatRates(),listClients(),listCatalogItems(),loadBusinessProfile()]).then(([nextUnits,nextRates,nextClients,nextCatalog,profile])=>{setUnits(nextUnits);setVatRates(nextRates);setClients(nextClients);setCatalogItems(nextCatalog);setBusinessProfile(profile);}).catch(showError); }, []);
  useEffect(()=>{if(clientPickerOpen)listClients(clientPickerQuery).then(setPickerClients).catch(showError);},[clientPickerOpen,clientPickerQuery]);
  useEffect(()=>{if(editable&&!quote.items.length){const item={...createEmptyQuoteItem(newId('item'),0),confirmed:false,vatRateBasisPoints:quote.defaultVatBasisPoints};setQuote((current)=>({...current,items:[item]}));setActiveItemId(item.id);}},[]);
  useEffect(()=>{if(!editable)return;const timer=setTimeout(()=>{if(!operationInFlight.current)saveDraft({...quote,clientContactName:clientContact,clientPhone,clientEmail,clientTaxId,clientVatNumber}).catch(()=>undefined);},650);return()=>clearTimeout(timer);},[quote,editable,clientContact,clientPhone,clientEmail,clientTaxId,clientVatNumber]);
  useEffect(()=>{ if(initialQuote.status==='issued') loadDocumentExport(initialQuote.id).then((record)=>setPdfError(record?.status==='failed'?record.errorMessage??'PDF non disponibile.':null)).catch(showError); },[initialQuote.id,initialQuote.status]);
  useEffect(()=>{ if(initialQuote.status!=='issued') return; loadQuoteShareLinkCache(initialQuote.id).then(async cache=>{ if(!cache) return; setShareId(cache.shareId); setShareLifecycle(cache.lifecycle as QuoteShareLifecycle|null); setCommercialOutcome(cache.commercialOutcome as QuoteShareCommercialOutcome|null); setCommercialOutcomeSource(cache.commercialOutcomeSource as CanonicalCommercialOutcome['source']); setCommercialOutcomeDecidedAt(cache.commercialOutcomeDecidedAt??null); setOpenedAt(cache.openedAt); if(!cache.issuanceId) return; try { const canonical=await quoteSharingRepository.getCommercialOutcome(cache.issuanceId); setCanonicalOutcome(canonical); const remote=cache.shareId?await quoteSharingRepository.status(cache.shareId):null; if(remote) setShareFromRemote(remote); await saveQuoteShareLinkCache({quoteId:cache.quoteId,issuanceId:cache.issuanceId,shareId:remote?.id??cache.shareId,lifecycle:remote?.lifecycle??cache.lifecycle,commercialOutcome:canonical.outcome,commercialOutcomeSource:canonical.source,commercialOutcomeDecidedAt:canonical.decidedAt,openedAt:remote?.openedAt??cache.openedAt,shareSyncedAt:new Date().toISOString()}); } catch { /* cache remains informational while offline */ } }).catch(()=>undefined); },[initialQuote.id,initialQuote.status]);
  useEffect(()=>{if(initialQuote.status!=='issued')return;canCreateRevisionInEditor(initialQuote.id).then(setCanCreateRevision).catch(()=>setCanCreateRevision(false));},[initialQuote.id,initialQuote.status]);
  const newItem=(position:number,vat=quote.defaultVatBasisPoints)=>({...createEmptyQuoteItem(newId('item'),position),confirmed:false,vatTreatment:'rate' as const,vatRateBasisPoints:vat});
  const addItem = () => setQuote((current) => { const item=newItem(current.items.length,current.defaultVatBasisPoints); setActiveItemId(item.id); return { ...current, items: [...current.items,item] }; });
  const confirmedItems=quote.items.filter((item)=>item.confirmed!==false&&item.description.trim());
  const profileReady=Boolean(businessProfile?.businessName.trim());
  async function closeEditor() {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    try {
      let currentQuote: Quote;
      try { currentQuote = materializeNumericInputs(quote, numericDrafts.current); }
      catch { currentQuote = quote; }
      currentQuote={...currentQuote,clientContactName:clientContact,clientPhone,clientEmail,clientTaxId,clientVatNumber};
      if (editable && !hasMeaningfulDraftContent(currentQuote)) await deleteDraft(currentQuote.id);
      await onClose();
    } catch (error) { showError(error); }
    finally { operationInFlight.current = false; }
  }
  function applyClient(client:Client) { setQuote((current)=>({...current,clientId:client.id,client:client.name,clientContactName:client.contactName,clientPhone:client.phone,clientEmail:client.email,clientAddress:client.address,clientTaxId:client.taxId,clientVatNumber:client.vatNumber,siteAddress:siteMatchesClient?client.address:current.siteAddress}));setClientContact(client.contactName);setClientPhone(client.phone);setClientEmail(client.email);setClientTaxId(client.taxId);setClientVatNumber(client.vatNumber);setClientPickerOpen(false);setClientPickerQuery(''); }
  async function sendWithQuotivo() { try { setSaving(true); const cache=await loadQuoteShareLinkCache(quote.id); if(!cache?.issuanceId) throw new Error('Emissione Quotivo non disponibile.'); const cachedState:QuoteShareState={shareId:cache.shareId,lifecycle:cache.lifecycle as QuoteShareLifecycle|null,commercialOutcome:cache.commercialOutcome as QuoteShareCommercialOutcome|null,openedAt:cache.openedAt}; if(__DEV__)console.info('Quote share request',{quoteId:quote.id,issuanceId:cache.issuanceId,shareId:cache.shareId}); const result=await createOrRecoverQuoteShare({repository:quoteSharingRepository,quoteId:quote.id,issuanceId:cache.issuanceId,state:cachedState}); if(!result.url) throw new Error('Link Quotivo non disponibile.'); setShareFromRemote(result);await saveQuoteShareLinkCache({quoteId:quote.id,issuanceId:cache.issuanceId,shareId:result.id,lifecycle:result.lifecycle,commercialOutcome:result.commercialOutcome,openedAt:result.openedAt??null,shareSyncedAt:new Date().toISOString()});await shareQuoteLink(result.url); } catch(error) { showError(error); } finally { setSaving(false); } }
  async function revokeQuotivoLink() { if(!shareId) return; try { if(!shareCapabilities.canRevoke) throw new Error(quoteShareUnavailableMessage(shareState)); setSaving(true);await quoteSharingRepository.revoke(shareId);setShareLifecycle('REVOKED');const cache=await loadQuoteShareLinkCache(quote.id);if(cache)await saveQuoteShareLinkCache({...cache,shareId,lifecycle:'REVOKED',commercialOutcome:commercialOutcome??cache.commercialOutcome,openedAt,shareSyncedAt:new Date().toISOString()});}catch(error){showError(error)}finally{setSaving(false)} }
  async function refreshCanonicalOutcome(issuanceId:string) { const canonical=await quoteSharingRepository.getCommercialOutcome(issuanceId); setCanonicalOutcome(canonical); const cache=await loadQuoteShareLinkCache(quote.id); if(cache) await saveQuoteShareLinkCache({...cache,commercialOutcome:canonical.outcome,commercialOutcomeSource:canonical.source,commercialOutcomeDecidedAt:canonical.decidedAt,shareSyncedAt:new Date().toISOString()}); return canonical; }
  async function recordManualOutcome(outcome:ManualCommercialOutcome) { const cache=await loadQuoteShareLinkCache(quote.id); if(!cache?.issuanceId) return showError(new Error('Emissione Quotivo non disponibile.')); try { setSaving(true); const canonical=await recordManualCommercialOutcome(quoteSharingRepository,cache.issuanceId,outcome); setCanonicalOutcome(canonical); await saveQuoteShareLinkCache({...cache,commercialOutcome:canonical.outcome,commercialOutcomeSource:canonical.source,commercialOutcomeDecidedAt:canonical.decidedAt,shareSyncedAt:new Date().toISOString()}); } catch(error) { if(error instanceof CommercialOutcomeRemoteError&&error.code==='ALREADY_DECIDED') { try { await refreshCanonicalOutcome(cache.issuanceId); Alert.alert('Esito già registrato','È stato mostrato l’esito definitivo già registrato.'); } catch(refreshError) { showCommercialOutcomeError(refreshError); } } else showCommercialOutcomeError(error); } finally { setSaving(false); } }
  function confirmManualOutcome(outcome:ManualCommercialOutcome) { const label=outcome==='ACCEPTED'?'accettato':'rifiutato'; Alert.alert(`Segnare come ${label}?`,'Questa decisione è definitiva e non potrà essere modificata.',[{text:'Annulla',style:'cancel'},{text:`Segna come ${label}`,style:'destructive',onPress:()=>void recordManualOutcome(outcome)}]); }
  async function openSettings() { try { const current={...materializeNumericInputs(quote,numericDrafts.current),clientContactName:clientContact,clientPhone,clientEmail,clientTaxId,clientVatNumber}; await saveDraft(current); onOpenSettings(current); } catch(error) { showError(error); } }
  async function addCustomUnit(itemId:string) { try { const unit = await createMeasurementUnit(customUnitLabel); setUnits((current) => [...current, unit]); patchItem(itemId, { unitCode:unit.code, unit:unit.label }); setCustomUnitLabel(''); setCustomUnitItem(null); } catch (error) { showError(error); } }
  async function addCustomVat(itemId:string) { try { const basisPoints=parsePercentBasisPoints(customVatText); const rate=await createVatRate(`${customVatText.trim()}%`,basisPoints); setVatRates((current)=>[...current,rate]); patchItem(itemId,{vatTreatment:'rate',vatRateBasisPoints:basisPoints}); setCustomVatText('');setCustomVatItem(null); } catch(error){showError(error);} }
  function copyCatalogItem(itemId:string, catalog:CatalogItem) {
    patchItem(itemId, catalog.priceMode==='measured' ? {description:catalog.title,priceMode:'measured',unitCode:catalog.unitCode,unit:catalog.unitLabel,unitPriceCents:catalog.priceCents} : {description:catalog.title,priceMode:'body',unitCode:null,unit:'',bodyPriceCents:catalog.priceCents});
    setCatalogPickerItem(null); setCatalogPickerQuery(''); setCatalogModalItem(null); setCatalogModalQuery(''); setCatalogSuggestionsItem(null);
  }
  function copyRecentItem(itemId:string, recent:RecentWorkItem) {
    const { id: _id, position: _position, confirmed: _confirmed, ...item } = recent.item;
    patchItem(itemId, { ...item, confirmed:false });
    setRecentModalItem(null);
  }
  async function saveItemToCatalog(item: Quote['items'][number]) {
    try {
      const value={title:item.description,priceMode:item.priceMode,unitCode:item.priceMode==='measured'?item.unitCode:null,unitLabel:item.priceMode==='measured'?item.unit:'',priceCents:item.priceMode==='measured'?item.unitPriceCents:item.bodyPriceCents} as const;
      const existing=await findCatalogItemByTitle(value.title);
      const save=async(id?:string)=>{const saved=await saveCatalogItem({...value,id});setCatalogItems((items)=>[...items.filter((catalog)=>catalog.id!==saved.id),saved].sort((a,b)=>a.title.localeCompare(b.title,'it')));};
      if(existing) Alert.alert('Lavorazione già in catalogo',`Vuoi aggiornare “${existing.title}” con i valori correnti?`,[{text:'Annulla',style:'cancel'},{text:'Aggiorna',onPress:()=>{void save(existing.id).catch(showError);}}]);
      else await save();
    } catch(error) { showError(error); }
  }
  async function saveCurrentItemToCatalog(itemId:string) {
    const current=materializeNumericInputs(quote,numericDrafts.current); const item=current.items.find((value)=>value.id===itemId);
    if(!item) return showError(new Error('Lavorazione non trovata.'));
    await saveItemToCatalog(item);
  }
  async function openRecentItems(itemId:string) {
    try { setRecentItems(await listRecentWorkItems()); setRecentModalItem(itemId); }
    catch(error) { showError(error); }
  }

  async function persist(finalize = false) {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    try {
      setSaving(true);
      let currentQuote = materializeNumericInputs(quote, numericDrafts.current);
      currentQuote={...currentQuote,clientContactName:clientContact,clientPhone,clientEmail,clientTaxId,clientVatNumber};
      if (saveClientToBook && currentQuote.client.trim()) { const saved=await saveClient({id:currentQuote.clientId??undefined,name:currentQuote.client,contactName:clientContact,phone:clientPhone,email:clientEmail,address:currentQuote.clientAddress,taxId:clientTaxId,vatNumber:clientVatNumber}); setClients((current)=>[...current.filter((client)=>client.id!==saved.id),saved]); currentQuote={...currentQuote,clientId:saved.id}; }
      if (!currentQuote.client.trim() || !currentQuote.title.trim()) throw new Error('Inserisci cliente e titolo.');
      if (finalize && !profileReady) throw new Error('Completa i dati della tua attività prima di finalizzare.');
      if (finalize) {
        if(currentQuote.revisionNumber>0&&(!currentQuote.revisionRootQuoteId||!currentQuote.parentQuoteId)) throw new Error('Catena revisione incompleta.');
        const revisionContext=currentQuote.revisionNumber>0 ? {rootQuoteId:currentQuote.revisionRootQuoteId!,parentQuoteId:currentQuote.parentQuoteId!,revisionNumber:currentQuote.revisionNumber} : null;
        let parentIssuanceId: string | null = null;
        const authorization=revisionContext ? await (async()=>{const [root,parent]=await Promise.all([loadQuoteShareLinkCache(revisionContext.rootQuoteId!),loadQuoteShareLinkCache(revisionContext.parentQuoteId!)]);if(!root?.issuanceId||!parent?.issuanceId)throw new Error('Emissione originale non disponibile per la revisione.');parentIssuanceId=parent.issuanceId;return authorizeQuoteRevisionIssue(quoteIssuanceRepository,{stableQuoteId:currentQuote.id,rootIssuanceId:root.issuanceId,parentIssuanceId:parent.issuanceId,rootQuoteId:revisionContext.rootQuoteId!,parentQuoteId:revisionContext.parentQuoteId!,revisionNumber:revisionContext.revisionNumber});})() : await authorizeQuoteIssue(quoteIssuanceRepository,currentQuote.id);
        if(!authorization.authorized && authorization.reason==='QUOTA_EXCEEDED') { Alert.alert('Limite Free raggiunto','Hai utilizzato i 3 preventivi gratuiti di questo mese. Scopri Quotivo Pro per creare preventivi senza limiti.'); return; }
        if(!authorization.authorized && authorization.reason==='SEQUENCE_UNINITIALIZED') { Alert.alert('Numerazione da configurare','Scegli come iniziare la numerazione prima della prima emissione.',[{text:'Ora no',style:'cancel'},{text:'Configura',onPress:onOpenNumbering}]); return; }
        if(!authorization.authorized) throw new Error('Non è stato possibile autorizzare l’emissione.');
        if(authorization.sequenceNumber===null||authorization.year===null) throw new Error('Numero server non disponibile.');
        if (revisionContext && (!parentIssuanceId || !authorization.issuanceId)) throw new Error('Emissione revisione non disponibile per l aggiornamento share.');
        const assigned = await finalizeRevisionShareLifecycle({
          finalize: () => finalizeDraft(currentQuote,{number:authorization.sequenceNumber!,year:authorization.year!,revision:revisionContext??undefined}),
          revisionShare: revisionContext ? { parentIssuanceId: parentIssuanceId!, revisionIssuanceId: authorization.issuanceId! } : null,
          sharingRepository: quoteSharingRepository,
        });
        const snapshot=await loadIssuedSnapshot(currentQuote.id) as {issuedAt?:string;issuedLocalDate?:string};
        await saveQuoteShareLinkCache({quoteId:currentQuote.id,issuanceId:authorization.issuanceId,shareId:null,lifecycle:null,commercialOutcome:null,openedAt:null,shareSyncedAt:new Date().toISOString()});
        setQuote({...currentQuote,status:'issued',number:assigned.number,numberYear:assigned.year,issuedAt:snapshot.issuedAt??new Date().toISOString(),issuedLocalDate:snapshot.issuedLocalDate??null});
        try {
          await generateStoredFinalPdf(currentQuote.id);
          setPdfError(null);
        } catch(error) {
          const message=error instanceof Error?error.message:'Errore sconosciuto.';
          setPdfError(message);
          Alert.alert('Preventivo emesso correttamente',`È stato assegnato il numero ${assigned.number}/${assigned.year}, ma non è stato possibile generare il PDF. Puoi riprovare senza una nuova emissione.`);
        }
      } else { await saveDraft(currentQuote); onClose(); }
    } catch (error) { showError(error); } finally { setSaving(false); operationInFlight.current = false; }
  }
  async function previewDraft() {
    if(operationInFlight.current)return; operationInFlight.current=true;
    try { if(!profileReady) throw new Error('Completa i dati della tua attività prima di creare l’anteprima.'); setSaving(true); const current={...materializeNumericInputs(quote,numericDrafts.current),clientContactName:clientContact,clientPhone,clientEmail,clientTaxId,clientVatNumber}; await saveDraft(current); setQuote(current); const business=await loadDraftBusinessSnapshot(); const uri=await generateDraftPdf(buildDraftDocumentModel(current,business)); setPreview({uri,title:'Anteprima bozza',temporary:true}); }
    catch(error){showError(error);} finally{setSaving(false);operationInFlight.current=false;}
  }
  async function openOrRegenerateFinal() {
    if(operationInFlight.current)return; operationInFlight.current=true;
    try { setSaving(true); const result=await openIssuedPdf(quote.id);setPdfError(null);setPreview({uri:result.uri,title:`Preventivo ${formatQuoteNumber(quote.number,quote.numberYear)}`,temporary:false}); }
    catch(error){const message=error instanceof Error?error.message:'Errore sconosciuto.';setPdfError(message);showError(error);} finally{setSaving(false);operationInFlight.current=false;}
  }
  async function exportAndShare(kind:'pdf'|'docx') {
    if(operationInFlight.current)return; operationInFlight.current=true;
    try { setSaving(true); const uri=kind==='pdf'?await prepareFinalPdfForShare(quote.id):await generateStoredFinalDocx(quote.id); await shareDocument(uri,kind==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',kind==='pdf'?'Condividi PDF':'Condividi documento Word'); }
    catch(error){showError(error);} finally{setSaving(false);operationInFlight.current=false;}
  }
  async function createRevision() {
    if(operationInFlight.current)return;
    operationInFlight.current=true;
    try { setSaving(true); await onRevisionDraft(quote.id); }
    catch(error) { showError(error); }
    finally { setSaving(false); operationInFlight.current=false; }
  }
  function confirmFinalization(){Alert.alert('Finalizzare il preventivo?','Verrà assegnato il numero definitivo e i contenuti non saranno più modificabili.',[{text:'Annulla',style:'cancel'},{text:'Finalizza',style:'destructive',onPress:()=>persist(true)}]);}
  function removeDraft() { Alert.alert('Eliminare la bozza?', 'Questa operazione non può essere annullata.', [{ text: 'Annulla', style: 'cancel' }, { text: 'Elimina', style: 'destructive', onPress: async () => { try { await deleteDraft(quote.id); onClose(); } catch (error) { showError(error); } } }]); }

  async function copyActiveLink(){try{await Clipboard.setStringAsync(await recoverActiveQuoteShareLink(quoteSharingRepository,shareState));Alert.alert('Link copiato');}catch(error){showError(error);}}
  if(preview)return <PdfPreview uri={preview.uri} title={preview.title} onClose={()=>{if(preview.temporary)removeDraftPdf(preview.uri);setPreview(null);}}/>;
  if(!editable)return <IssuedQuoteDetail quote={quote} total={total} outcome={{outcome:commercialOutcome??'PENDING',source:commercialOutcomeSource,decidedAt:commercialOutcomeDecidedAt}} saving={saving} pdfError={pdfError} shareState={shareState} shareCapabilities={shareCapabilities} canCreateRevision={canCreateRevision} onClose={closeEditor} onPreview={openOrRegenerateFinal} onExport={exportAndShare} onMark={confirmManualOutcome} onSend={sendWithQuotivo} onCopy={copyActiveLink} onRevoke={revokeQuotivoLink} onCreateRevision={createRevision}/>;
  if(!editable)return <SafeAreaView style={styles.safeArea}><View style={styles.appShell}><View style={styles.editorHeader}><Pressable onPress={()=>void closeEditor()}><Text style={styles.back}>‹ Preventivi</Text></Pressable></View><ScrollView contentContainerStyle={styles.issuedSuccess}><Text style={styles.pageTitle}>Dettaglio preventivo</Text><View style={styles.compactItemCard}><Text style={styles.issuedNumber}>N. {formatQuoteNumber(quote.number,quote.numberYear)}</Text><Text style={styles.quoteTitle}>{quote.title||'Preventivo senza titolo'}</Text><Text style={styles.quoteClient}>{quote.client||'Cliente da inserire'}</Text><Text style={styles.quoteTotal}>{formatMoney(total)}</Text><Text style={styles.quoteClient}>Revisione {quote.revisionNumber}</Text></View><Text style={styles.formSection}>STATO COMMERCIALE</Text><View style={styles.compactItemCard}><CommercialStatusBadge quoteStatus={quote.status} commercialOutcome={commercialOutcome}/><Text style={styles.quoteClient}>Lo stato commerciale è distinto dalla condivisione.</Text></View><Text style={styles.formSection}>DOCUMENTO</Text><Pressable disabled={saving} style={styles.previewAction} onPress={()=>void openOrRegenerateFinal()}><Text style={styles.previewActionText}>Visualizza PDF emesso</Text></Pressable><View style={styles.exportChoices}><Pressable disabled={saving} style={styles.exportChoice} onPress={()=>void exportAndShare('pdf')}><Text style={styles.linkText}>Condividi PDF</Text></Pressable><Pressable disabled={saving} style={styles.exportChoice} onPress={()=>void exportAndShare('docx')}><Text style={styles.linkText}>Condividi Word</Text></Pressable></View>{pdfError&&<Text style={styles.pdfError}>PDF non disponibile: {pdfError}</Text>}<Text style={styles.formSection}>CONDIVISIONE QUOTIVO</Text><View style={styles.compactItemCard}><Text style={styles.quoteTitle}>{quoteShareLifecycleLabel(shareState)}</Text><Text style={styles.quoteClient}>Stato del link e della sua condivisione.</Text></View>{shareCapabilities.canShare?<><Pressable disabled={saving} style={styles.issueAction} onPress={()=>void sendWithQuotivo()}><Text style={styles.issueActionText}>Condividi link</Text></Pressable><Pressable disabled={saving} style={styles.previewAction} onPress={()=>void copyActiveLink()}><Text style={styles.previewActionText}>Copia link</Text></Pressable></>:shareCapabilities.canCreateShare&&<Pressable disabled={saving} style={styles.issueAction} onPress={()=>void sendWithQuotivo()}><Text style={styles.issueActionText}>{saving?'Preparazione…':'Invia con Quotivo'}</Text></Pressable>}{shareCapabilities.canRevoke&&<Pressable disabled={saving} style={styles.deleteAction} onPress={()=>void revokeQuotivoLink()}><Text style={styles.deleteLink}>Revoca link</Text></Pressable>}{canCreateRevision&&<><Text style={styles.formSection}>REVISIONE</Text><Pressable disabled={saving} style={styles.issueAction} onPress={()=>void createRevision()}><Text style={styles.issueActionText}>{saving?'Creazione revisione…':'Crea revisione'}</Text></Pressable></>}<Pressable disabled={saving} style={styles.deleteAction} onPress={()=>void closeEditor()}><Text style={styles.linkText}>Torna ai preventivi</Text></Pressable></ScrollView></View></SafeAreaView>;  return <SafeAreaView style={styles.safeArea}><StatusBar style="dark" /><KeyboardAvoidingView style={styles.appShell} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.editorHeader}><Pressable onPress={()=>void closeEditor()}><Text style={styles.back}>‹ Archivio</Text></Pressable><CommercialStatusBadge quoteStatus={quote.status} commercialOutcome={null}/></View>
    <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled"><Text style={styles.pageTitle}>{editable ? `Modifica preventivo${quote.revisionNumber>0?` · Revisione ${quote.revisionNumber}`:''}` : quote.title}</Text>
      {!editable && <View style={styles.lockNotice}><Text style={styles.lockText}>Documento emesso: contenuto e numero sono bloccati.</Text></View>}
      {editable&&<View style={styles.stepper}><Pressable onPress={()=>setStep(1)} style={[styles.stepChip,step===1&&styles.stepChipActive]}><Text style={[styles.stepChipText,step===1&&styles.stepChipTextActive]}>1 Cliente e lavoro</Text></Pressable><Pressable onPress={()=>setStep(2)} style={[styles.stepChip,step===2&&styles.stepChipActive]}><Text style={[styles.stepChipText,step===2&&styles.stepChipTextActive]}>2 Lavorazioni</Text></Pressable><Pressable onPress={()=>setStep(3)} style={[styles.stepChip,step===3&&styles.stepChipActive]}><Text style={[styles.stepChipText,step===3&&styles.stepChipTextActive]}>3 Riepilogo</Text></Pressable></View>}
      {(step===1||!editable)&&<>
      <Text style={styles.formSection}>LA TUA ATTIVITÀ</Text>
      {profileReady?<View style={styles.compactItemCard}><Text style={styles.quoteTitle}>{businessProfile?.businessName}</Text><Text style={styles.quoteClient}>{[businessProfile?.address,businessProfile?.vatNumber&&`P. IVA ${businessProfile.vatNumber}`,businessProfile?.phone].filter(Boolean).join(' · ')||'Dati attività configurati'}</Text>{editable&&<Pressable style={styles.inlineLink} onPress={()=>void openSettings()}><Text style={styles.linkText}>Modifica</Text></Pressable>}</View>:<View style={styles.activityMissing}><Text style={styles.quoteTitle}>Completa i dati della tua attività</Text><Text style={styles.quoteClient}>Servono per anteprima e finalizzazione del documento.</Text>{editable&&<Pressable style={styles.inlineLink} onPress={()=>void openSettings()}><Text style={styles.linkText}>Configura ora</Text></Pressable>}</View>}
      <Text style={styles.formSection}>CLIENTE</Text>
      <Field label="Cliente / Ragione sociale" value={quote.client} editable={editable} placeholder="Es. Mario Rossi" onChangeText={(client) => setQuote((current)=>({ ...current, client, clientId:null }))} />
      {editable&&quote.client.trim().length>1&&clients.filter((client)=>client.name.toLocaleLowerCase().includes(quote.client.toLocaleLowerCase())).slice(0,5).map((client)=><Pressable key={client.id} style={styles.clientSuggestion} onPress={()=>applyClient(client)}><Text style={styles.quoteTitle}>{client.name}</Text><Text style={styles.quoteClient}>{client.address||client.email||client.phone||'Cliente salvato'}</Text></Pressable>)}
      {editable&&<Pressable style={styles.inlineLink} onPress={()=>{setClientPickerOpen((value)=>!value);setClientPickerQuery('');}}><Text style={styles.linkText}>Scegli dalla rubrica</Text></Pressable>}
      {editable&&clientPickerOpen&&<View style={styles.selectorPanel}><TextInput style={styles.catalogSearchInput} value={clientPickerQuery} placeholder="Cerca cliente" placeholderTextColor="#AAA39A" onChangeText={setClientPickerQuery}/>{pickerClients.map((client)=><Pressable key={client.id} style={styles.selectorOption} onPress={()=>applyClient(client)}><Text style={styles.quoteTitle}>{client.name}</Text><Text style={styles.quoteClient}>{client.address||client.email||client.phone||'Cliente salvato'}</Text></Pressable>)}</View>}
      <Field label="Indirizzo cliente (facoltativo)" value={quote.clientAddress} editable={editable} onChangeText={(clientAddress)=>setQuote((current)=>({...current,clientAddress,siteAddress:siteMatchesClient?clientAddress:current.siteAddress}))}/>
      <View style={styles.twoColumns}><View style={styles.column}><Field label="Codice fiscale (facoltativo)" value={clientTaxId} editable={editable} onChangeText={setClientTaxId}/></View><View style={styles.column}><Field label="P. IVA (facoltativa)" value={clientVatNumber} editable={editable} onChangeText={setClientVatNumber}/></View></View>
      {editable&&<Pressable style={styles.detailsToggle} onPress={()=>setContactsOpen((value)=>!value)}><Text style={styles.detailsToggleText}>Contatti facoltativi</Text><Text style={styles.chevron}>{contactsOpen?'−':'+'}</Text></Pressable>}
      {(contactsOpen||!editable)&&<><Field label="Referente (facoltativo)" value={clientContact} editable={editable} onChangeText={setClientContact}/><View style={styles.twoColumns}><View style={styles.column}><Field label="Telefono (facoltativo)" value={clientPhone} editable={editable} keyboardType="phone-pad" onChangeText={setClientPhone}/></View><View style={styles.column}><Field label="Email (facoltativa)" value={clientEmail} editable={editable} keyboardType="email-address" autoCapitalize="none" onChangeText={setClientEmail}/></View></View></>}
      {editable&&<Pressable style={styles.saveClientToggle} onPress={()=>setSaveClientToBook((value)=>!value)}><Text style={styles.detailsToggleText}>{saveClientToBook?'✓ Salva cliente in rubrica':'Salva cliente in rubrica'}</Text></Pressable>}
      <Text style={styles.formSection}>CANTIERE</Text>
      {editable&&<Pressable style={styles.saveClientToggle} onPress={()=>setSiteMatchesClient((value)=>{const next=!value;if(next)setQuote((current)=>({...current,siteAddress:current.clientAddress}));return next;})}><Text style={styles.detailsToggleText}>{siteMatchesClient?'✓ Usa indirizzo cliente':'Usa indirizzo cliente'}</Text></Pressable>}
      {!siteMatchesClient&&<Field label="Indirizzo cantiere (facoltativo)" value={quote.siteAddress} editable={editable} placeholder="Indirizzo distinto del lavoro" onChangeText={(siteAddress)=>setQuote((current)=>({...current,siteAddress}))}/>}
      <Text style={styles.formSection}>DATI PREVENTIVO</Text>
      <Field label="Titolo" value={quote.title} editable={editable} placeholder="Es. Rifacimento bagno" onChangeText={(title) => setQuote((current)=>({ ...current, title }))} />
      <Field label="Introduzione (facoltativa)" value={quote.introduction} editable={editable} multiline placeholder="Breve contesto del lavoro" onChangeText={(introduction) => setQuote((current)=>({ ...current, introduction }))} />
      <Text style={styles.fieldLabel}>IVA PREDEFINITA NUOVE VOCI</Text><Pressable disabled={!editable} style={styles.compactSelector} onPress={()=>setDefaultVatOpen((value)=>!value)}><Text style={styles.compactSelectorText}>{vatRates.find((rate)=>rate.rateBasisPoints===quote.defaultVatBasisPoints)?.label??`${quote.defaultVatBasisPoints/100}%`}</Text><Text style={styles.selectorChevron}>▾</Text></Pressable>
      {editable&&defaultVatOpen&&<View style={styles.selectorPanel}>{vatRates.map((rate)=><Pressable key={rate.code} style={styles.selectorOption} onPress={()=>{setQuote((current)=>({...current,defaultVatBasisPoints:rate.rateBasisPoints}));setDefaultVatOpen(false);}}><Text style={styles.quoteTitle}>{rate.label}</Text></Pressable>)}</View>}
      {editable&&<Pressable style={styles.detailsToggle} onPress={()=>setQuoteOptionsOpen((value)=>!value)}><Text style={styles.detailsToggleText}>Opzioni preventivo</Text><Text style={styles.chevron}>{quoteOptionsOpen?'−':'+'}</Text></Pressable>}
      {(quoteOptionsOpen||!editable)&&<NumericField label="Sconto globale % (facoltativo)" value={quote.globalDiscountBasisPoints/100} editable={editable} onTextValue={(text)=>{numericDrafts.current[globalDiscountInputKey(quote.id)]=text;}} onParsedValue={(value)=>setQuote((current)=>({...current,globalDiscountBasisPoints:Math.round(value*100)}))}/>}
      {editable&&<Pressable style={styles.secondaryContinue} onPress={()=>setStep(2)}><Text style={styles.previewActionText}>Continua alle lavorazioni</Text></Pressable>}
      </>}
      {(step===2||!editable)&&<>
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Lavorazioni</Text><Text style={styles.pageSubtitle}>{confirmedItems.length} confermate</Text></View>
      {quote.items.map((item, index) => item.confirmed!==false&&item.id!==activeItemId ? <Pressable key={item.id} style={styles.compactItemCard} onPress={()=>{setActiveItemId(item.id);setQuote((current)=>({...current,items:current.items.map((row)=>row.id===item.id?{...row,confirmed:false}:row)}));}}><Text style={styles.itemIndex}>LAVORAZIONE</Text><Text style={styles.quoteTitle}>{item.description}</Text><View style={styles.compactItemRow}><Text style={styles.quoteClient}>{item.priceMode==='body'?'A corpo':`${item.quantityScaled/10000} ${item.unit} × ${formatMoney(item.unitPriceCents)}`} · IVA {item.vatTreatment==='rate'?`${(item.vatRateBasisPoints??0)/100}%`:'N/A'}</Text><Text style={styles.quoteTotal}>{formatMoney(itemTotalCents(item))}</Text></View><Text style={styles.linkText}>Modifica</Text></Pressable> : <View key={item.id} style={styles.itemCard}><View style={styles.itemHeading}><Text style={styles.itemIndex}>LAVORAZIONE {index + 1}</Text>{editable && <Pressable onPress={() => setQuote({ ...quote, items: quote.items.filter((row) => row.id !== item.id) })}><Text style={styles.deleteLink}>Rimuovi</Text></Pressable>}</View>
        <Field label="Lavorazione" value={item.description} editable={editable} placeholder="Es. Demolizione pavimento" onChangeText={(description) => {patchItem(item.id, { description });setCatalogSuggestionsItem(item.id);}} />
        {editable&&<View style={styles.catalogActionRow}><Pressable style={styles.catalogAction} onPress={()=>{setCatalogModalItem(item.id);setCatalogModalQuery('');}}><Text style={styles.linkText}>Scegli dal catalogo</Text></Pressable><Pressable style={styles.catalogAction} onPress={()=>void openRecentItems(item.id)}><Text style={styles.linkText}>Recenti</Text></Pressable></View>}
        {editable&&catalogSuggestionsItem===item.id&&item.description.trim().length>0&&catalogItems.filter((catalog)=>catalog.title.toLocaleLowerCase().includes(item.description.trim().toLocaleLowerCase())).slice(0,3).map((catalog)=><Pressable key={catalog.id} style={styles.catalogSuggestion} onPress={()=>copyCatalogItem(item.id,catalog)}><Text style={styles.quoteTitle}>{catalog.title}</Text><Text style={styles.quoteClient}>{catalog.priceMode==='measured'?`${formatMoney(catalog.priceCents)} / ${catalog.unitLabel}`:`A corpo · ${formatMoney(catalog.priceCents)}`}</Text></Pressable>)}
        <Field label="Descrizione breve (facoltativa)" value={item.shortDescription} editable={editable} placeholder="Sintesi della voce" onChangeText={(shortDescription)=>patchItem(item.id,{shortDescription})}/>
        <View style={styles.choiceRow}><Choice label="A misura" active={item.priceMode === 'measured'} disabled={!editable} onPress={() => patchItem(item.id,{priceMode:'measured'})}/><Choice label="A corpo" active={item.priceMode === 'body'} disabled={!editable} onPress={() => patchItem(item.id,{priceMode:'body'})}/></View>
        {item.priceMode === 'measured' ? <><View style={styles.itemFields}><NumericField label="Quantità" value={item.quantityScaled / 10000} editable={editable} emptyWhenZero={item.confirmed===false} onTextValue={(text) => { numericDrafts.current[numericInputKey(item.id, 'quantity')] = text; }} onParsedValue={(quantity) => patchItem(item.id, { quantity, quantityScaled:Math.round(quantity*10000) })} /><NumericField label="Prezzo €" value={item.unitPriceCents / 100} editable={editable} fixedDecimals emptyWhenZero={item.confirmed===false} onTextValue={(text) => { numericDrafts.current[numericInputKey(item.id, 'price')] = text; }} onParsedValue={(value) => patchItem(item.id, { unitPriceCents: Math.round(value * 100) })} /></View>
        <Text style={styles.fieldLabel}>UNITÀ</Text><Pressable disabled={!editable} style={styles.compactSelector} onPress={()=>setUnitPickerItem(unitPickerItem===item.id?null:item.id)}><Text style={styles.compactSelectorText}>{item.unit||'Seleziona'}</Text><Text style={styles.selectorChevron}>▾</Text></Pressable>
        {unitPickerItem===item.id&&<View style={styles.selectorPanel}>{units.map((unit)=><Pressable key={unit.code} style={styles.selectorOption} onPress={()=>{patchItem(item.id,{unitCode:unit.code,unit:unit.label});setUnitPickerItem(null)}}><Text style={styles.quoteTitle}>{unit.label}</Text></Pressable>)}{editable&&<Pressable style={styles.selectorOption} onPress={()=>setCustomUnitItem(item.id)}><Text style={styles.linkText}>+ Aggiungi unità</Text></Pressable>}</View>}
        {customUnitItem===item.id&&<View style={styles.inlineAdd}><TextInput style={[styles.compactInput,{flex:1}]} value={customUnitLabel} onChangeText={setCustomUnitLabel} placeholder="Nuova unità"/><Pressable style={styles.smallButton} onPress={()=>addCustomUnit(item.id)}><Text style={styles.smallButtonText}>Aggiungi</Text></Pressable></View>}</> :
        <><NumericField label="Importo a corpo €" value={item.bodyPriceCents/100} editable={editable} fixedDecimals emptyWhenZero={item.confirmed===false} onTextValue={(text)=>{numericDrafts.current[numericInputKey(item.id,'bodyPrice')]=text;}} onParsedValue={(value)=>patchItem(item.id,{bodyPriceCents:Math.round(value*100)})}/></>}
        <Text style={styles.fieldLabel}>IVA</Text><Pressable disabled={!editable} style={styles.compactSelector} onPress={()=>setVatPickerItem(vatPickerItem===item.id?null:item.id)}><Text style={styles.compactSelectorText}>{item.vatTreatment==='rate'?`${(item.vatRateBasisPoints??0)/100}%`:'Non applicata'}</Text><Text style={styles.selectorChevron}>▾</Text></Pressable>
        {vatPickerItem===item.id&&<View style={styles.selectorPanel}>{vatRates.map((rate)=><Pressable key={rate.code} style={styles.selectorOption} onPress={()=>{patchItem(item.id,{vatTreatment:'rate',vatRateBasisPoints:rate.rateBasisPoints});setVatPickerItem(null)}}><Text style={styles.quoteTitle}>{rate.label}</Text></Pressable>)}<Pressable style={styles.selectorOption} onPress={()=>{patchItem(item.id,{vatTreatment:'not_applied',vatRateBasisPoints:null});setVatPickerItem(null)}}><Text style={styles.quoteTitle}>Non applicata</Text></Pressable>{editable&&<Pressable style={styles.selectorOption} onPress={()=>setCustomVatItem(item.id)}><Text style={styles.linkText}>+ Aggiungi aliquota</Text></Pressable>}</View>}
        {customVatItem===item.id&&<View style={styles.inlineAdd}><TextInput style={[styles.compactInput,{flex:1}]} value={customVatText} keyboardType="decimal-pad" onChangeText={setCustomVatText} placeholder="Es. 6"/><Pressable style={styles.smallButton} onPress={()=>addCustomVat(item.id)}><Text style={styles.smallButtonText}>Aggiungi</Text></Pressable></View>}
        <Pressable style={styles.detailsToggle} onPress={()=>setDetailItems((v)=>({...v,[item.id]:!v[item.id]}))}><Text style={styles.detailsToggleText}>Dettagli facoltativi</Text><Text>{detailItems[item.id]?'−':'+'}</Text></Pressable>
        {detailItems[item.id]&&<><NumericField label="Sconto riga %" value={item.lineDiscountBasisPoints/100} editable={editable} onTextValue={(text)=>{numericDrafts.current[numericInputKey(item.id,'discount')]=text;}} onParsedValue={(value)=>patchItem(item.id,{lineDiscountBasisPoints:Math.round(value*100)})}/><Field label="Dettagli tecnici" value={item.technicalDetails} editable={editable} multiline onChangeText={(technicalDetails)=>patchItem(item.id,{technicalDetails})}/><Field label="Inclusioni" value={item.inclusions} editable={editable} multiline onChangeText={(inclusions)=>patchItem(item.id,{inclusions})}/><Field label="Esclusioni" value={item.exclusions} editable={editable} multiline onChangeText={(exclusions)=>patchItem(item.id,{exclusions})}/><Choice label={item.isOptional?'Voce opzionale':'Rendi opzionale'} active={item.isOptional} disabled={!editable} onPress={()=>patchItem(item.id,{isOptional:!item.isOptional})}/></>}
        <Text style={styles.lineTotal}>{formatMoney(itemTotalCents(item))}</Text>{editable&&<><View style={styles.catalogActionRow}><Pressable style={styles.catalogAction} onPress={()=>void saveCurrentItemToCatalog(item.id)}><Text style={styles.linkText}>Salva nel catalogo</Text></Pressable><Pressable style={styles.catalogAction} onPress={()=>{setCatalogPickerItem(catalogPickerItem===item.id?null:item.id);setCatalogPickerQuery('');}}><Text style={styles.linkText}>Aggiungi dal catalogo</Text></Pressable></View>{catalogPickerItem===item.id&&<View style={styles.selectorPanel}><TextInput style={styles.catalogSearchInput} value={catalogPickerQuery} placeholder="Cerca nel catalogo" placeholderTextColor="#AAA39A" onChangeText={setCatalogPickerQuery}/>{catalogItems.filter((catalog)=>catalog.title.toLocaleLowerCase().includes(catalogPickerQuery.trim().toLocaleLowerCase())).map((catalog)=><Pressable key={catalog.id} style={styles.selectorOption} onPress={()=>copyCatalogItem(item.id,catalog)}><Text style={styles.quoteTitle}>{catalog.title}</Text><Text style={styles.quoteClient}>{catalog.priceMode==='measured'?`${formatMoney(catalog.priceCents)} / ${catalog.unitLabel}`:`A corpo · ${formatMoney(catalog.priceCents)}`}</Text></Pressable>)}{!catalogItems.some((catalog)=>catalog.title.toLocaleLowerCase().includes(catalogPickerQuery.trim().toLocaleLowerCase()))&&<Text style={styles.emptyCatalogText}>Nessuna lavorazione nel catalogo.</Text>}</View>}<Pressable style={styles.confirmItemAction} onPress={()=>{const current=materializeNumericInputs(quote,numericDrafts.current);const row=current.items.find((value)=>value.id===item.id);if(!row?.description.trim())return showError(new Error('Inserisci il nome della voce prima di confermarla.'));setQuote({...current,items:current.items.map((value)=>value.id===item.id?{...value,confirmed:true}:value)});setActiveItemId(null);}}><Text style={styles.primaryButtonText}>Conferma voce</Text></Pressable></>}</View>)}
      {editable&&!quote.items.some((item)=>item.confirmed===false)&&<Pressable style={styles.addItemAction} onPress={addItem}><Text style={styles.linkText}>+ Aggiungi voce</Text></Pressable>}
      {editable&&<Pressable style={styles.secondaryContinue} onPress={()=>setStep(3)}><Text style={styles.previewActionText}>Continua al riepilogo</Text></Pressable>}
      </>}
      {(step===3||!editable)&&<>
      <EconomicSummary quote={quote}/>
      {editable ? <><Pressable disabled={saving} style={styles.primaryAction} onPress={() => persist(false)}><Text style={styles.primaryButtonText}>{saving ? 'Salvataggio…' : 'Salva bozza'}</Text></Pressable><Pressable disabled={saving} style={styles.previewAction} onPress={previewDraft}><Text style={styles.previewActionText}>Anteprima PDF</Text></Pressable><Pressable disabled={saving} style={styles.issueAction} onPress={confirmFinalization}><Text style={styles.issueActionText}>Finalizza preventivo</Text></Pressable><Pressable disabled={saving} style={styles.deleteAction} onPress={removeDraft}><Text style={styles.deleteLink}>Elimina bozza</Text></Pressable></> : <><Pressable disabled={saving} style={styles.previewAction} onPress={openOrRegenerateFinal}><Text style={styles.previewActionText}>Visualizza PDF emesso</Text></Pressable><Pressable disabled={saving} style={styles.previewAction} onPress={()=>setExportOpen((value)=>!value)}><Text style={styles.previewActionText}>Esporta / Condividi</Text></Pressable>{exportOpen&&<View style={styles.exportChoices}><Pressable disabled={saving} style={styles.exportChoice} onPress={()=>void exportAndShare('pdf')}><Text style={styles.linkText}>PDF</Text></Pressable><Pressable disabled={saving} style={styles.exportChoice} onPress={()=>void exportAndShare('docx')}><Text style={styles.linkText}>Word (.docx)</Text></Pressable></View>}{pdfError&&<Text style={styles.pdfError}>PDF non disponibile: {pdfError}</Text>}</>}
      </>}
    </ScrollView>
    <Modal visible={catalogModalItem!==null} transparent animationType="slide" onRequestClose={()=>setCatalogModalItem(null)}>
      <View style={styles.catalogModalBackdrop}><SafeAreaView style={styles.catalogModalSheet} edges={['bottom']}>
        <View style={styles.catalogModalHeader}><Text style={styles.pageTitle}>Catalogo</Text><Pressable accessibilityRole="button" accessibilityLabel="Chiudi catalogo" hitSlop={8} style={styles.modalClose} onPress={()=>setCatalogModalItem(null)}><Icon name="close" size={22}/></Pressable></View>
        <TextInput autoFocus style={styles.catalogSearchInput} value={catalogModalQuery} placeholder="Cerca nel catalogo" placeholderTextColor={styles.catalogSearchPlaceholder.color} onChangeText={setCatalogModalQuery}/>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.catalogModalList}>{catalogModalItems.map((catalog)=><Pressable key={catalog.id} style={styles.selectorOption} onPress={()=>{if(catalogModalItem)copyCatalogItem(catalogModalItem,catalog);}}><Text style={styles.quoteTitle}>{catalog.title}</Text><Text style={styles.quoteClient}>{catalog.priceMode==='measured'?`${formatMoney(catalog.priceCents)} / ${catalog.unitLabel}`:`A corpo · ${formatMoney(catalog.priceCents)}`}</Text></Pressable>)}{!catalogModalItems.length&&<Text style={styles.emptyCatalogText}>Nessuna lavorazione nel catalogo.</Text>}</ScrollView>
      </SafeAreaView></View>
    </Modal>
    <Modal visible={recentModalItem!==null} transparent animationType="slide" onRequestClose={()=>setRecentModalItem(null)}>
      <View style={styles.catalogModalBackdrop}><SafeAreaView style={styles.catalogModalSheet} edges={['bottom']}>
        <View style={styles.catalogModalHeader}><View><Text style={styles.pageTitle}>Recenti</Text><Text style={styles.pageSubtitle}>Lavorazioni da preventivi emessi, più recenti per prime.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Chiudi recenti" hitSlop={8} style={styles.modalClose} onPress={()=>setRecentModalItem(null)}><Icon name="close" size={22}/></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.catalogModalList}>{recentItems.map((recent)=>{const catalogued=catalogItems.some((catalog)=>catalog.title.localeCompare(recent.item.description, 'it', { sensitivity:'accent' })===0);return <View key={recent.item.id} style={styles.selectorOption}><Text style={styles.quoteTitle}>{recent.item.description}</Text><Text style={styles.quoteClient}>{recent.item.priceMode==='measured'?`${formatMoney(recent.item.unitPriceCents)} / ${recent.item.unit}`:`A corpo · ${formatMoney(recent.item.bodyPriceCents)}`}{catalogued?' · Già nel catalogo':''}</Text><View style={styles.catalogActionRow}><Pressable style={styles.catalogAction} onPress={()=>{if(recentModalItem)copyRecentItem(recentModalItem,recent);}}><Text style={styles.linkText}>Usa</Text></Pressable>{!catalogued&&<Pressable style={styles.catalogAction} onPress={()=>void saveItemToCatalog(recent.item)}><Text style={styles.linkText}>Salva nel catalogo</Text></Pressable>}</View></View>;})}{!recentItems.length&&<Text style={styles.emptyCatalogText}>Nessuna lavorazione emessa da riutilizzare.</Text>}</ScrollView>
      </SafeAreaView></View>
    </Modal>
  </KeyboardAvoidingView></SafeAreaView>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) { return <Input {...props} />; }
function CompactField(props: React.ComponentProps<typeof TextInput> & { label: string }) { return <Input {...props} compact />; }
function NumericField({ label, value, editable, fixedDecimals, emptyWhenZero, onTextValue, onParsedValue }: { label: string; value: number; editable: boolean; fixedDecimals?: boolean; emptyWhenZero?:boolean; onTextValue: (text: string) => void; onParsedValue: (value: number) => void }) {
  const display = emptyWhenZero&&value===0 ? '' : fixedDecimals ? value.toFixed(2).replace('.', ',') : String(value).replace('.', ',');
  const [text, setText] = useState(display);
  useEffect(() => setText(display), [display]);
  return <CompactField label={label} value={text} editable={editable} selectTextOnFocus keyboardType="decimal-pad" onChangeText={(next) => { setText(next); onTextValue(next); }} onBlur={() => { const parsed = tryParseDecimal(text); if (parsed !== null) onParsedValue(parsed); }} />;
}
function Choice({label,active,disabled,onPress,fullWidth}:{label:string;active:boolean;disabled?:boolean;onPress:()=>void;fullWidth?:boolean}) { return <Toggle label={label} active={active} disabled={disabled} fullWidth={fullWidth} onPress={onPress} />; }
function EconomicSummary({quote}:{quote:Quote}) { const e=calculateEconomics(quote.items,quote.globalDiscountBasisPoints); return <View style={styles.totalCard}><View><Text style={styles.totalLabel}>IMPONIBILE {formatMoney(e.netCents)}</Text><Text style={styles.totalLabel}>IVA {formatMoney(e.vatCents)}</Text></View><Text style={styles.totalValue}>{formatMoney(e.totalCents)}</Text></View>; }
function IssuedQuoteDetail({ quote, total, outcome, saving, pdfError, shareState, shareCapabilities, canCreateRevision, onClose, onPreview, onExport, onMark, onSend, onCopy, onRevoke, onCreateRevision }: { quote: Quote; total: number; outcome: CanonicalCommercialOutcome; saving: boolean; pdfError: string | null; shareState: QuoteShareState; shareCapabilities: ReturnType<typeof getQuoteShareCapabilities>; canCreateRevision: boolean; onClose: () => Promise<void>; onPreview: () => Promise<void>; onExport: (kind: 'pdf' | 'docx') => Promise<void>; onMark: (outcome: ManualCommercialOutcome) => void; onSend: () => Promise<void>; onCopy: () => Promise<void>; onRevoke: () => Promise<void>; onCreateRevision: () => Promise<void> }) { const provenance=commercialOutcomeProvenanceLabel(outcome); return <SafeAreaView style={styles.safeArea}><View style={styles.appShell}><View style={styles.editorHeader}><Pressable onPress={()=>void onClose()}><Text style={styles.back}>‹ Preventivi</Text></Pressable></View><ScrollView contentContainerStyle={styles.issuedSuccess}><Text style={styles.pageTitle}>Dettaglio preventivo</Text><View style={styles.compactItemCard}><Text style={styles.issuedNumber}>N. {formatQuoteNumber(quote.number,quote.numberYear)}</Text><Text style={styles.quoteTitle}>{quote.title||'Preventivo senza titolo'}</Text><Text style={styles.quoteClient}>{quote.client||'Cliente da inserire'}</Text><Text style={styles.quoteTotal}>{formatMoney(total)}</Text><Text style={styles.quoteClient}>Revisione {quote.revisionNumber}</Text></View><Text style={styles.formSection}>STATO COMMERCIALE</Text><View style={styles.compactItemCard}><CommercialStatusBadge quoteStatus={quote.status} commercialOutcome={outcome.outcome}/>{provenance?<Text style={styles.quoteClient}>{provenance}</Text>:<><Text style={styles.quoteClient}>Lo stato commerciale è distinto dalla condivisione.</Text><Pressable disabled={saving} style={styles.issueAction} onPress={()=>onMark('ACCEPTED')}><Text style={styles.issueActionText}>Segna come accettato</Text></Pressable><Pressable disabled={saving} style={styles.deleteAction} onPress={()=>onMark('REJECTED')}><Text style={styles.deleteLink}>Segna come rifiutato</Text></Pressable></>}</View><Text style={styles.formSection}>DOCUMENTO</Text><Pressable disabled={saving} style={styles.previewAction} onPress={()=>void onPreview()}><Text style={styles.previewActionText}>Visualizza PDF emesso</Text></Pressable><View style={styles.exportChoices}><Pressable disabled={saving} style={styles.exportChoice} onPress={()=>void onExport('pdf')}><Text style={styles.linkText}>Condividi PDF</Text></Pressable><Pressable disabled={saving} style={styles.exportChoice} onPress={()=>void onExport('docx')}><Text style={styles.linkText}>Condividi Word</Text></Pressable></View>{pdfError&&<Text style={styles.pdfError}>PDF non disponibile: {pdfError}</Text>}<Text style={styles.formSection}>CONDIVISIONE QUOTIVO</Text><View style={styles.compactItemCard}><Text style={styles.quoteTitle}>{quoteShareLifecycleLabel(shareState)}</Text><Text style={styles.quoteClient}>Stato del link e della sua condivisione.</Text></View>{shareCapabilities.canShare?<><Pressable disabled={saving} style={styles.issueAction} onPress={()=>void onSend()}><Text style={styles.issueActionText}>Condividi link</Text></Pressable><Pressable disabled={saving} style={styles.previewAction} onPress={()=>void onCopy()}><Text style={styles.previewActionText}>Copia link</Text></Pressable></>:shareCapabilities.canCreateShare&&<Pressable disabled={saving} style={styles.issueAction} onPress={()=>void onSend()}><Text style={styles.issueActionText}>{saving?'Preparazione…':'Invia con Quotivo'}</Text></Pressable>}{shareCapabilities.canRevoke&&<Pressable disabled={saving} style={styles.deleteAction} onPress={()=>void onRevoke()}><Text style={styles.deleteLink}>Revoca link</Text></Pressable>}{canCreateRevision&&<><Text style={styles.formSection}>REVISIONE</Text><Pressable disabled={saving} style={styles.issueAction} onPress={()=>void onCreateRevision()}><Text style={styles.issueActionText}>{saving?'Creazione revisione…':'Crea revisione'}</Text></Pressable></>}<Pressable disabled={saving} style={styles.deleteAction} onPress={()=>void onClose()}><Text style={styles.linkText}>Torna ai preventivi</Text></Pressable></ScrollView></View></SafeAreaView>; }
function ThemeOnboarding({onChoose}:{onChoose:(preference:'light'|'dark'|'system')=>Promise<void>}) { return <SafeAreaView style={styles.safeArea}><View style={styles.themeOnboarding}><View style={styles.brandMark}><QuotivoMark size={58}/></View><Text style={styles.pageTitle}>Scegli il tuo tema</Text><Text style={styles.pageSubtitle}>Potrai cambiarlo in qualsiasi momento dalle Impostazioni.</Text><View style={styles.themeChoices}><Pressable style={styles.primaryAction} onPress={()=>void onChoose('light')}><Text style={styles.primaryButtonText}>Chiaro</Text></Pressable><Pressable style={styles.previewAction} onPress={()=>void onChoose('dark')}><Text style={styles.previewActionText}>Scuro</Text></Pressable><Pressable style={styles.previewAction} onPress={()=>void onChoose('system')}><Text style={styles.previewActionText}>Sistema</Text></Pressable></View></View></SafeAreaView>; }
function TabButton({ label, icon, active, onPress }: { label: string; icon: IconName; active: boolean; onPress: () => void }) { const {theme}=useTheme(); const color=active?theme.greenStrong:theme.muted; return <Pressable style={styles.tabButton} onPress={onPress}><Icon name={icon} size={20} color={color}/><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></Pressable>; }
function showCommercialOutcomeError(error: unknown) { const message=error instanceof CommercialOutcomeRemoteError ? error.code==='OFFLINE' ? 'Nessuna decisione è stata registrata: verifica la connessione e riprova.' : error.code==='AUTH' ? 'Accedi di nuovo per registrare l’esito.' : error.code==='RLS' ? 'Non hai l’autorizzazione per registrare l’esito.' : 'Il servizio Quotivo non è disponibile al momento. Riprova più tardi.' : error instanceof Error ? error.message : 'Si è verificato un errore.'; Alert.alert('Esito non registrato',message); }

let styles: ReturnType<typeof createStyles>;
function createStyles(t:Theme) { return StyleSheet.create({
  safeArea:{flex:1,backgroundColor:t.background},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:t.background},appShell:{flex:1},content:{paddingHorizontal:18,paddingTop:18,paddingBottom:110},topBar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:24},eyebrow:{color:t.greenStrong,fontSize:11,letterSpacing:1.6,fontWeight:'800'},greeting:{color:t.text,fontSize:24,fontWeight:'800',marginTop:6},avatar:{height:42,width:42,borderRadius:16,backgroundColor:t.greenSoft,alignItems:'center',justifyContent:'center'},avatarText:{color:t.greenStrong,fontWeight:'800'},
  primaryButtonText:{color:t.onGreen,fontSize:12,fontWeight:'800'},
  sectionHeading:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:12,marginTop:20},sectionTitle:{color:t.text,fontSize:20,fontWeight:'800',marginBottom:12,flexShrink:1},linkText:{color:t.violet,fontWeight:'800',fontSize:12},
  quoteTitle:{color:t.text,fontWeight:'800',fontSize:13,flexShrink:1},quoteClient:{color:t.muted,fontSize:11,marginTop:5,flexShrink:1},quoteTotal:{color:t.text,fontWeight:'800',fontSize:12,marginBottom:6,flexShrink:1},
  archiveHeader:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'flex-end',gap:12,marginBottom:4},archiveFilters:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:12,marginBottom:16},pageTitle:{color:t.text,fontSize:30,fontWeight:'800',flexShrink:1},pageSubtitle:{color:t.muted,fontSize:13,marginTop:5,flexShrink:1},smallButton:{backgroundColor:t.green,borderRadius:12,paddingVertical:11,paddingHorizontal:13,flexShrink:0},smallButtonText:{color:t.onGreen,fontWeight:'800',fontSize:12},tabBar:{position:'absolute',bottom:0,left:0,right:0,backgroundColor:t.surface,borderTopWidth:1,borderTopColor:t.border,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingHorizontal:4,paddingTop:4},tabButton:{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',minHeight:48,paddingHorizontal:1},tabSymbol:{color:t.muted,fontSize:20},tabLabel:{color:t.muted,fontSize:8,fontWeight:'700',marginTop:3,maxWidth:'100%'},tabActive:{color:t.greenStrong},floatingAdd:{width:52,height:52,borderRadius:18,backgroundColor:t.green,alignItems:'center',justifyContent:'center',marginTop:-24,elevation:5},floatingAddText:{color:t.onGreen,fontSize:30,fontWeight:'300'},
  editorHeader:{paddingHorizontal:20,height:58,borderBottomWidth:1,borderBottomColor:t.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},back:{color:t.violet,fontSize:14,fontWeight:'700',flexShrink:1},editorContent:{padding:20,paddingBottom:60},lockNotice:{backgroundColor:t.greenSoft,padding:13,borderRadius:16,marginTop:14},lockText:{color:t.greenStrong,fontSize:12,fontWeight:'700'},field:{marginTop:18},fieldLabel:{color:t.text,fontSize:11,fontWeight:'800',marginBottom:7,textTransform:'uppercase'},input:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:16,paddingHorizontal:13,paddingVertical:12,color:t.text,fontSize:14},inputLocked:{backgroundColor:t.surface2,color:t.muted},
  itemCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:18,padding:14,marginBottom:12,minWidth:0},itemHeading:{flexDirection:'row',justifyContent:'space-between',gap:10,marginBottom:9},itemIndex:{color:t.muted,fontSize:10,fontWeight:'900',letterSpacing:.8,flexShrink:1},deleteLink:{color:t.danger,fontSize:11,fontWeight:'800'},itemFields:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},compactField:{flex:1,minWidth:120},compactInput:{backgroundColor:t.surface2,borderWidth:1,borderColor:t.border,borderRadius:12,paddingHorizontal:9,paddingVertical:10,color:t.text,fontSize:13},lineTotal:{textAlign:'right',color:t.greenStrong,fontWeight:'900',marginTop:12},totalCard:{backgroundColor:t.surface2,borderWidth:1,borderColor:t.border,borderRadius:22,padding:18,flexDirection:'row',flexWrap:'wrap',gap:12,alignItems:'center',justifyContent:'space-between',marginTop:10,marginBottom:18},totalLabel:{color:t.muted,fontSize:11,fontWeight:'900',letterSpacing:1},totalValue:{color:t.greenStrong,fontSize:22,fontWeight:'900',flexShrink:1},primaryAction:{backgroundColor:t.green,borderRadius:16,padding:15,alignItems:'center',marginBottom:10},previewAction:{backgroundColor:t.violetSoft,borderWidth:1,borderColor:t.violet,borderRadius:16,padding:15,alignItems:'center',marginBottom:10},previewActionText:{color:t.violet,fontSize:13,fontWeight:'800'},issueAction:{backgroundColor:t.violet,borderRadius:16,padding:15,alignItems:'center'},issueActionText:{color:t.onViolet,fontSize:13,fontWeight:'800'},issuedSuccess:{flex:1,padding:20,paddingTop:40},issuedNumber:{color:t.greenStrong,fontSize:24,fontWeight:'900',marginTop:16,marginBottom:4},pdfError:{color:t.danger,fontSize:12,lineHeight:18,marginTop:10},deleteAction:{padding:18,alignItems:'center'},emptyCard:{padding:24,alignItems:'center'},emptyTitle:{color:t.text,fontWeight:'800',marginBottom:6},emptyText:{color:t.muted,textAlign:'center',fontSize:12,lineHeight:18},
  formSection:{color:t.muted,fontSize:10,fontWeight:'900',letterSpacing:1,marginTop:24},twoColumns:{flexDirection:'row',gap:8},column:{flex:1,minWidth:0},shortColumn:{width:64,flexShrink:0},logoCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:18,padding:12,marginTop:18,flexDirection:'row',alignItems:'center',minWidth:0},logoPreview:{width:70,height:58,flexShrink:0},logoPlaceholder:{width:70,height:58,flexShrink:0,borderRadius:12,backgroundColor:t.greenSoft,alignItems:'center',justifyContent:'center'},logoPlaceholderText:{color:t.greenStrong,fontWeight:'900',fontSize:11},logoInfo:{flex:1,minWidth:0,marginLeft:12},logoActions:{flexDirection:'row',flexWrap:'wrap',gap:16,marginTop:10},detailsToggle:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:16,padding:15,marginVertical:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},detailsToggleText:{color:t.text,fontWeight:'800',fontSize:13,flexShrink:1},chevron:{color:t.muted,fontSize:18},appearanceCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:18,padding:14,minWidth:0},appearanceCopy:{flex:1,minWidth:0},themeModeList:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10},accountCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:18,padding:14,minWidth:0},accountHeading:{flexDirection:'row',alignItems:'center',gap:10},accountIcon:{width:36,height:36,borderRadius:18,backgroundColor:t.greenSoft,alignItems:'center',justifyContent:'center'},accountEmail:{color:t.text,fontSize:14,lineHeight:20,marginTop:12,flexShrink:1},accountRow:{flexDirection:'row',justifyContent:'space-between',gap:16,borderTopWidth:1,borderTopColor:t.border,marginTop:13,paddingTop:13,alignItems:'flex-start'},accountLabel:{color:t.muted,fontSize:12,fontWeight:'800'},accountValue:{alignItems:'flex-end',flexShrink:1},planBadge:{fontSize:10,fontWeight:'900',letterSpacing:.8,paddingHorizontal:8,paddingVertical:4,borderRadius:12,overflow:'hidden',marginBottom:5},proBadge:{backgroundColor:t.greenSoft,color:t.greenStrong},freeBadge:{backgroundColor:t.violetSoft,color:t.violet},planName:{color:t.text,fontSize:13,fontWeight:'800',textAlign:'right'},logoutRow:{minHeight:48,borderWidth:1,borderColor:t.danger,borderRadius:16,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:10,marginTop:20,marginBottom:8},logoutText:{color:t.danger,fontSize:13,fontWeight:'800'},
  choiceRow:{flexDirection:'row',flexWrap:'wrap',gap:7,marginVertical:10},choice:{borderWidth:1,borderColor:t.border,borderRadius:18,paddingHorizontal:12,paddingVertical:8,backgroundColor:t.surface2},choiceActive:{backgroundColor:t.green,borderColor:t.green},choiceText:{fontSize:11,fontWeight:'700',color:t.muted},choiceTextActive:{color:t.onGreen},inlineAdd:{flexDirection:'row',gap:8,alignItems:'center',marginBottom:10},
  stepper:{flexDirection:'row',gap:6,marginTop:18,marginBottom:4},stepChip:{flex:1,borderWidth:1,borderColor:t.border,borderRadius:12,paddingVertical:9,paddingHorizontal:5,alignItems:'center'},stepChipActive:{backgroundColor:t.green,borderColor:t.green},stepChipText:{fontSize:9,fontWeight:'800',color:t.muted},stepChipTextActive:{color:t.onGreen},clientSuggestion:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,padding:12,borderRadius:12,marginTop:6},inlineLink:{alignSelf:'flex-start',paddingVertical:9},activityMissing:{backgroundColor:t.violetSoft,borderWidth:1,borderColor:t.border,borderRadius:16,padding:14,marginTop:10},saveClientToggle:{paddingVertical:12,marginTop:8},secondaryContinue:{backgroundColor:t.violetSoft,borderWidth:1,borderColor:t.violet,borderRadius:16,padding:14,alignItems:'center',marginTop:18},compactItemCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:18,padding:14,marginBottom:10},compactItemRow:{flexDirection:'row',justifyContent:'space-between',gap:8,alignItems:'center',marginTop:8},confirmItemAction:{backgroundColor:t.green,borderRadius:12,padding:13,alignItems:'center',marginTop:14},addItemAction:{borderWidth:1,borderColor:t.green,borderStyle:'dashed',borderRadius:16,padding:15,alignItems:'center',marginBottom:14},
compactSelector:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:12,paddingHorizontal:12,paddingVertical:11,flexDirection:'row',justifyContent:'space-between',alignItems:'center',minWidth:0},compactSelectorText:{color:t.text,fontWeight:'800',fontSize:13,flexShrink:1},selectorChevron:{color:t.muted,fontSize:16},selectorPanel:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:12,marginTop:6,overflow:'hidden'},selectorOption:{paddingHorizontal:13,paddingVertical:11,borderBottomWidth:1,borderBottomColor:t.border,minWidth:0},catalogActionRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},catalogAction:{flexGrow:1,flexBasis:130,minWidth:0,borderWidth:1,borderColor:t.border,borderRadius:12,paddingVertical:10,paddingHorizontal:8,alignItems:'center'},catalogSearchInput:{paddingHorizontal:13,paddingVertical:11,color:t.text,fontSize:13,borderBottomWidth:1,borderBottomColor:t.border},catalogSearchPlaceholder:{color:t.muted},emptyCatalogText:{color:t.muted,fontSize:12,padding:13},catalogSuggestion:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:12,paddingHorizontal:12,paddingVertical:9,marginTop:5,minWidth:0},catalogModalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.42)',justifyContent:'flex-end'},catalogModalSheet:{maxHeight:'78%',backgroundColor:t.surface,borderTopLeftRadius:24,borderTopRightRadius:24,paddingTop:14,overflow:'hidden'},catalogModalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,paddingHorizontal:18,paddingBottom:10},modalClose:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:t.surface2,flexShrink:0},catalogModalList:{paddingHorizontal:10,paddingBottom:18},exportChoices:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:10},exportChoice:{flexGrow:1,flexBasis:130,minWidth:0,borderWidth:1,borderColor:t.border,borderRadius:12,paddingVertical:11,alignItems:'center'},themeOnboarding:{flex:1,justifyContent:'center',padding:24},brandMark:{width:58,height:58,alignItems:'center',justifyContent:'center',marginBottom:20},themeChoices:{marginTop:28},
}); }
