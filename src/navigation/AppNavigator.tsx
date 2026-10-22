import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CatalogItem, Client, closeAccountDatabase, createDraft, createMeasurementUnit, createVatRate, deleteDraft, durabilityLocalRepository, finalizeDraft, findCatalogItemByTitle, initializeDatabase, listCatalogItems, listClients, listMeasurementUnits, listQuotes, listRecentWorkItems, listVatRates, loadBusinessProfile, loadDocumentExport, loadDraftBusinessSnapshot, loadIssuedSnapshot, loadQuoteShareLinkCache, MeasurementUnit, saveCatalogItem, saveClient, saveDraft, saveQuoteShareLinkCache, subscribeDurabilityChanges, updateBusinessProfile, VatRate } from '../database';
import { BusinessProfile, choosePersistentLogo, deleteManagedLogo } from '../businessProfile';
import { formatQuoteNumber } from '../emissionClock';
import { calculateEconomics, createEmptyQuoteItem, formatMoney, globalDiscountInputKey, hasMeaningfulDraftContent, itemTotalCents, materializeNumericInputs, newId, numericInputKey, NumericInputDrafts, parseMoneyCents, parsePercentBasisPoints, Quote, quoteTotalCents, revisionHistoryForQuote, tryParseDecimal } from '../domain';
import { buildDraftDocumentModel } from '../documents/documentModel';
import { generateStoredFinalPdf, openIssuedPdf } from '../documents/finalPdfWorkflow';
import { generateStoredFinalDocx } from '../documents/docxWorkflow';
import { PdfPreview } from '../documents/PdfPreview';
import { generateDraftPdf, removeDraftPdf } from '../documents/pdfService';
import { prepareFinalPdfForShare, shareDocument, shareQuoteLink } from '../documents/shareService';
import { getQuoteShareCapabilities, quoteShareLifecycleLabel, quoteShareUnavailableMessage, QuoteShareState } from '../features/quote-sharing/shareCapabilities';
import { QuoteShare, QuoteShareCommercialOutcome, QuoteShareLifecycle } from '../features/quote-sharing/QuoteSharingRepository';
import { createOrRecoverQuoteShare, recoverActiveQuoteShareLink } from '../features/quote-sharing/quoteShareUseCases';
import { CommercialStatusBadge } from '../features/quote-status/CommercialStatusBadge';
import { CanonicalCommercialOutcome, commercialOutcomeProvenanceLabel, CommercialOutcomeRemoteError, ManualCommercialOutcome, recordManualCommercialOutcome } from '../features/quote-status/recordManualCommercialOutcome';
import { Button, Card, DetailListRow, Input, ScreenContent, Section, SegmentedTabs, Select, Stack, Toggle } from '../ui/components';
import { showError } from '../ui/showOperationError';
import { Icon, IconName } from '../ui/Icon';
import { ThemeProvider, useTheme } from '../ui/theme';
import { spacing, Theme } from '../ui/tokens';
import { QuotivoLogo, QuotivoMark } from '../ui/QuotivoLogo';
import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { AuthScreen } from '../features/auth/AuthScreen';
import { BackendBootstrapProvider, useBackendBootstrap } from '../features/bootstrap/BackendBootstrapProvider';
import { AccountLifecycleProvider } from '../features/account-lifecycle/AccountLifecycleProvider';
import { AccountSettingsScreen } from '../features/account-lifecycle/AccountSettingsScreen';
import { SupabaseQuoteIssuanceRepository } from '../features/quote-issuance/SupabaseQuoteIssuanceRepository';
import { SupabaseIssuanceSnapshotRepository } from '../features/quote-issuance/SupabaseIssuanceSnapshotRepository';
import { authorizeQuoteIssue } from '../features/quote-issuance/authorizeQuoteIssue';
import { authorizeQuoteRevisionIssue } from '../features/quote-issuance/authorizeQuoteRevisionIssue';
import { finalizeIssuanceSnapshotLifecycle, recoverIssuanceSnapshot } from '../features/quote-issuance/finalizeIssuanceSnapshotLifecycle';
import { SupabaseQuoteNumberingRepository } from '../features/quote-numbering/SupabaseQuoteNumberingRepository';
import { SupabaseQuoteSharingRepository } from '../features/quote-sharing/SupabaseQuoteSharingRepository';
import { claimLegacyDataForCurrentAccount, inspectLegacyDataClaim, LegacyDataClaimAvailability } from '../features/local-data/legacyDataClaim';
import { createRevisionForEditor, getRevisionActionInEditor } from '../features/revisions/revisionEditorActions';
import { RevisionChainCapability } from '../features/revisions/revisionChainCapability';
import { defaultIssuedQuoteDetailTab, issuedQuoteDetailTabs, IssuedQuoteDetailTab } from '../features/quote-detail/issuedQuoteDetailTabs';
import { recoverRevisionShareLifecycle } from '../features/quote-issuance/finalizeRevisionShareLifecycle';
import { RecentWorkItem } from '../features/recent-work-items/recentWorkItems';
import { HomeScreen } from '../features/dashboard/HomeScreen';
import { ArchiveScreen } from '../features/archive/ArchiveScreen';
import { ArchiveNavigationIntent } from '../features/archive/archiveNavigation';
import { ClientsEditor } from '../features/clients/ClientsEditor';
import { CatalogEditor } from '../features/catalog/CatalogEditor';
import { EditorReturnIntent, restoreEditorDraft, saveDraftBeforePrerequisite } from '../features/quote-editor/editorPrerequisiteNavigation';
import { canContinueToQuoteSummary, missingConfirmedWorkItemMessage } from '../features/quote-editor/editorStepNavigation';
import { supabase } from '../data/remote/supabaseClient';
import { SupabaseJobRepository } from '../features/jobs/SupabaseJobRepository';
import { JobApplicationService } from '../features/jobs/JobApplicationService';
import { Job } from '../features/jobs/JobRepository';
import { JobQuoteAction } from '../features/jobs/JobQuoteAction';
import { JobDetailScreen, JobsScreen } from '../features/jobs/JobsScreen';
import { LocalJobIssuanceSnapshotRecovery } from '../features/jobs/LocalJobRepositories';
import { JobInputsApplicationService } from '../features/jobs/JobInputsApplicationService';
import { SupabaseJobInputsRepository } from '../features/jobs/SupabaseJobInputsRepository';
import { LocalJobInputsCacheRepository } from '../features/jobs/LocalJobInputsCacheRepository';
import { QuoteEditorScreen } from '../features/quote-editor/QuoteEditorScreen';
import { QuoteNumberingScreen } from '../features/quote-numbering/QuoteNumberingScreen';
import { BusinessProfileEditor } from '../features/business-profile/BusinessProfileEditor';
import { DurabilitySyncService } from '../features/durability/DurabilitySyncService';
import { SupabaseDurabilityRepository } from '../features/durability/SupabaseDurabilityRepository';
const quoteIssuanceRepository = new SupabaseQuoteIssuanceRepository();
const issuanceSnapshotRepository = new SupabaseIssuanceSnapshotRepository();
const quoteSharingRepository = new SupabaseQuoteSharingRepository();
const jobApplicationService = new JobApplicationService(new SupabaseJobRepository({ rpc: async (functionName, arguments_) => supabase.rpc(functionName, arguments_) }), undefined, undefined, new LocalJobIssuanceSnapshotRecovery(issuanceSnapshotRepository));
const jobInputsApplicationService = new JobInputsApplicationService(new SupabaseJobInputsRepository({ rpc: async (functionName, arguments_) => supabase.rpc(functionName, arguments_) }), new LocalJobInputsCacheRepository());
const durabilitySyncService = new DurabilitySyncService(durabilityLocalRepository(), new SupabaseDurabilityRepository());
type Screen = 'home' | 'archive' | 'clients' | 'catalog' | 'jobs' | 'job-detail' | 'settings' | 'numbering' | 'business-profile' | 'editor';
export function AppNavigator({ ownerUserId }: { ownerUserId: string }) {
  const {theme,preference,ready,setPreference}=useTheme(); styles=createStyles(theme);
  const { version } = useBackendBootstrap();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>('home');
  const rootScrollRef = useRef<ScrollView>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [commercialOutcomes, setCommercialOutcomes] = useState<Record<string, QuoteShareCommercialOutcome | null>>({});
  const [initialArchiveFilter, setInitialArchiveFilter] = useState<ArchiveNavigationIntent | undefined>();
  const [editing, setEditing] = useState<Quote | null>(null);
  const [selectedJob, setSelectedJob] = useState<Readonly<{ job: Job; sourceReference: string }> | null>(null);
  const [editorReturnIntent, setEditorReturnIntent] = useState<EditorReturnIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [legacyClaimAvailability, setLegacyClaimAvailability] = useState<LegacyDataClaimAvailability>('unavailable');
  const [claimingLegacyData, setClaimingLegacyData] = useState(false);
  const syncDurability = useCallback(async () => {
    try { await durabilitySyncService.sync(); }
    catch (error) { console.info('QUOTIVO_DURABILITY_SYNC_PENDING', error instanceof Error ? error.message : 'UNKNOWN'); }
  }, []);
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
      .then(syncDurability)
      .then(refresh)
      .then(() => inspectLegacyDataClaim(ownerUserId))
      .then((availability) => { if (active) setLegacyClaimAvailability(availability); })
      .catch((error) => { setLoadError(error instanceof Error ? error : new Error('Archivio locale non disponibile.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ownerUserId, refresh, syncDurability]);
  useEffect(() => subscribeDurabilityChanges(() => { void syncDurability(); }), [syncDurability]);
  useEffect(() => {
    requestAnimationFrame(() => rootScrollRef.current?.scrollTo({ y: 0, animated: false }));
  }, [initialArchiveFilter, screen]);
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
      if (quote) { setEditorReturnIntent(null); setEditing(quote); setScreen('editor'); }
    } catch (error) { showError(error); }
  }
  async function closeEditor() { await refresh(); setEditorReturnIntent(null); setEditing(null); setScreen('archive'); }
  async function startDraftForClient(client:Client) {
    try { const id=await createDraft(); const current=await listQuotes(); const draft=current.find((quote)=>quote.id===id); if(!draft)return; const populated={...draft,clientId:client.id,client:client.name,clientContactName:client.contactName,clientPhone:client.phone,clientEmail:client.email,clientAddress:client.address,clientTaxId:client.taxId,clientVatNumber:client.vatNumber,siteAddress:client.address}; await saveDraft(populated); setQuotes(await listQuotes());setEditorReturnIntent(null);setEditing(populated);setScreen('editor'); } catch(error) { showError(error); }
  }
  function openEditorPrerequisite(intent: EditorReturnIntent) { setEditorReturnIntent(intent); setScreen(intent.prerequisite); }
  async function returnToEditorFromPrerequisite() {
    const intent=editorReturnIntent;
    if(!intent) { setScreen('settings'); return; }
    try {
      const current=await listQuotes();
      const draft=restoreEditorDraft(intent,current);
      setQuotes(current);
      setEditing(draft);
      setEditorReturnIntent(null);
      setScreen('editor');
    } catch(error) { showError(error); }
  }
  if (!ready) return <SafeAreaView style={styles.center}><ActivityIndicator color={theme.green} /></SafeAreaView>;
  if (preference===null) return <ThemeOnboarding onChoose={setPreference}/>;
  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={theme.green} /></SafeAreaView>;
  if (loadError) return <SafeAreaView style={styles.safeArea}><View style={styles.center}><Text style={styles.emptyTitle}>Archivio non disponibile</Text><Text style={styles.emptyText}>I dati non sono stati caricati. Riprova senza uscire dall’account.</Text><Pressable style={styles.primaryAction} onPress={() => { setLoading(true); initializeDatabase(ownerUserId).then(refresh).catch((error) => setLoadError(error instanceof Error ? error : new Error('Archivio locale non disponibile.'))).finally(() => setLoading(false)); }}><Text style={styles.primaryButtonText}>Riprova</Text></Pressable></View></SafeAreaView>;
  if (screen === 'editor' && editing) return <QuoteEditorScreen key={editing.id} initialQuote={editing} allQuotes={quotes} commercialOutcomes={commercialOutcomes} jobService={jobApplicationService} onOpenJob={(job)=>void openJob(job)} onClose={closeEditor} onRevisionDraft={async(quoteId)=>{const draft=await createRevisionForEditor(quoteId);setQuotes(await listQuotes());setEditing(draft);}} onResumeRevisionDraft={async(quoteId)=>{const current=await listQuotes();const draft=current.find((candidate)=>candidate.id===quoteId&&candidate.status==='draft');if(!draft)throw new Error('La bozza revisione non è più disponibile.');setQuotes(current);setEditing(draft);}} onOpenSettings={openEditorPrerequisite} onOpenNumbering={openEditorPrerequisite} />;
  const openQuote = (quote: Quote) => { setEditing(quote); setScreen('editor'); };
  const openArchive = (intent?: ArchiveNavigationIntent) => { setInitialArchiveFilter(intent); setScreen('archive'); };
  async function openJob(job: Job) { try { setSelectedJob(await jobApplicationService.describe(job)); setScreen('job-detail'); } catch (error) { showError(error); } }
  return <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}><View style={styles.appShell}>
    <ScrollView ref={rootScrollRef} contentContainerStyle={[styles.content, { paddingBottom: 94 + insets.bottom }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.topBar}><View><QuotivoLogo width={142}/></View></View>
      {version === 'UPDATE_AVAILABLE' && <View style={styles.lockNotice}><Text style={styles.lockText}>È disponibile un aggiornamento di Quotivo.</Text></View>}
      {version === 'UPDATE_REQUIRED' && <View style={styles.lockNotice}><Text style={styles.lockText}>Aggiorna Quotivo per usare le funzioni che richiedono una validazione online. Archivio ed esportazioni restano disponibili.</Text></View>}
      {version === 'MAINTENANCE' && <View style={styles.lockNotice}><Text style={styles.lockText}>Le funzioni online sono temporaneamente in manutenzione. I tuoi documenti locali restano disponibili.</Text></View>}
      {screen === 'home' ? <HomeScreen quotes={quotes} outcomes={commercialOutcomes} onStartDraft={startDraft} onOpenArchive={openArchive} onOpenQuote={openQuote} onDeleteDraft={confirmDeleteDraft} onOpenSettings={()=>{setEditorReturnIntent(null);setScreen('settings');}} onOpenJobs={()=>{setEditorReturnIntent(null);setScreen('jobs');}} /> : screen === 'archive' ? <ArchiveScreen key={initialArchiveFilter ?? 'ALL'} quotes={quotes} outcomes={commercialOutcomes} initialArchiveFilter={initialArchiveFilter} onStartDraft={startDraft} onOpenQuote={openQuote} onDeleteDraft={confirmDeleteDraft} /> : screen === 'jobs' ? <JobsScreen service={jobApplicationService} onOpenJob={(job)=>void openJob(job)} /> : screen === 'job-detail' && selectedJob ? <JobDetailScreen job={selectedJob.job} sourceReference={selectedJob.sourceReference} service={jobApplicationService} inputsService={jobInputsApplicationService} onJobUpdated={(job)=>setSelectedJob((current)=>current ? { ...current, job } : current)} onClose={()=>setScreen('jobs')} /> : screen === 'clients' ? <ClientsEditor onCreateQuote={startDraftForClient} /> : screen === 'catalog' ? <CatalogEditor /> : screen === 'settings' ? <AccountSettingsScreen onOpenBusinessProfile={()=>{setEditorReturnIntent(null);setScreen('business-profile');}} onOpenNumbering={()=>{setEditorReturnIntent(null);setScreen('numbering');}} /> : screen === 'numbering' ? <QuoteNumberingScreen onClose={editorReturnIntent?()=>void returnToEditorFromPrerequisite():()=>{setEditorReturnIntent(null);setScreen('settings');}} closeLabel={editorReturnIntent?'Torna al preventivo':'Chiudi'} /> : <BusinessProfileEditor onReturnToQuote={editorReturnIntent?()=>void returnToEditorFromPrerequisite():undefined} onClose={()=>{setEditorReturnIntent(null);setScreen('settings');}} />}
    </ScrollView>
    <View style={[styles.tabBar, { height: 64 + insets.bottom, paddingBottom: insets.bottom }]}><TabButton label="Home" icon="home-variant-outline" active={screen === 'home'} onPress={() => {setEditorReturnIntent(null);setScreen('home');}} /><TabButton label="Preventivi" icon="file-document-outline" active={screen === 'archive'} onPress={() => {setEditorReturnIntent(null);openArchive();}} /><TabButton label="Clienti" icon="account-group-outline" active={screen === 'clients'} onPress={() => {setEditorReturnIntent(null);setScreen('clients');}} /><TabButton label="Catalogo" icon="format-list-bulleted" active={screen === 'catalog'} onPress={() => {setEditorReturnIntent(null);setScreen('catalog');}} /><TabButton label="Impostazioni" icon="cog-outline" active={screen === 'settings'} onPress={() => {setEditorReturnIntent(null);setScreen('settings');}} /></View>
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
function ThemeOnboarding({onChoose}:{onChoose:(preference:'light'|'dark'|'system')=>Promise<void>}) { return <SafeAreaView style={styles.safeArea}><View style={styles.themeOnboarding}><View style={styles.brandMark}><QuotivoMark size={58}/></View><Text style={styles.pageTitle}>Scegli il tuo tema</Text><Text style={styles.pageSubtitle}>Potrai cambiarlo in qualsiasi momento dalle Impostazioni.</Text><View style={styles.themeChoices}><Pressable style={styles.primaryAction} onPress={()=>void onChoose('light')}><Text style={styles.primaryButtonText}>Chiaro</Text></Pressable><Pressable style={styles.previewAction} onPress={()=>void onChoose('dark')}><Text style={styles.previewActionText}>Scuro</Text></Pressable><Pressable style={styles.previewAction} onPress={()=>void onChoose('system')}><Text style={styles.previewActionText}>Sistema</Text></Pressable></View></View></SafeAreaView>; }
function TabButton({ label, icon, active, onPress }: { label: string; icon: IconName; active: boolean; onPress: () => void }) { const {theme}=useTheme(); const color=active?theme.greenStrong:theme.muted; return <Pressable style={styles.tabButton} onPress={onPress}><Icon name={icon} size={20} color={color}/><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></Pressable>; }
let styles: ReturnType<typeof createStyles>;
function createStyles(t:Theme) { return StyleSheet.create({
  safeArea:{flex:1,backgroundColor:t.background},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:t.background},appShell:{flex:1},content:{paddingHorizontal:18,paddingTop:18,paddingBottom:110},topBar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:24},eyebrow:{color:t.greenStrong,fontSize:11,letterSpacing:1.6,fontWeight:'800'},greeting:{color:t.text,fontSize:24,fontWeight:'800',marginTop:6},avatar:{height:42,width:42,borderRadius:16,backgroundColor:t.greenSoft,alignItems:'center',justifyContent:'center'},avatarText:{color:t.greenStrong,fontWeight:'800'},
  primaryButtonText:{color:t.onGreen,fontSize:12,fontWeight:'800'},
  sectionHeading:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:12,marginTop:20},sectionTitle:{color:t.text,fontSize:20,fontWeight:'800',marginBottom:12,flexShrink:1},linkText:{color:t.violet,fontWeight:'800',fontSize:12},
  quoteTitle:{color:t.text,fontWeight:'800',fontSize:13,flexShrink:1},quoteClient:{color:t.muted,fontSize:11,marginTop:5,flexShrink:1},quoteTotal:{color:t.text,fontWeight:'800',fontSize:12,marginBottom:6,flexShrink:1},
  archiveHeader:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'flex-end',gap:12,marginBottom:4},archiveFilters:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:12,marginBottom:16},pageTitle:{color:t.text,fontSize:30,fontWeight:'800',flexShrink:1},pageSubtitle:{color:t.muted,fontSize:13,marginTop:5,flexShrink:1},smallButton:{backgroundColor:t.green,borderRadius:12,paddingVertical:11,paddingHorizontal:13,flexShrink:0},smallButtonText:{color:t.onGreen,fontWeight:'800',fontSize:12},tabBar:{position:'absolute',bottom:0,left:0,right:0,backgroundColor:t.surface,borderTopWidth:1,borderTopColor:t.border,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingHorizontal:4,paddingTop:4},tabButton:{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',minHeight:48,paddingHorizontal:1},tabSymbol:{color:t.muted,fontSize:20},tabLabel:{color:t.muted,fontSize:8,fontWeight:'700',marginTop:3,maxWidth:'100%'},tabActive:{color:t.greenStrong},floatingAdd:{width:52,height:52,borderRadius:18,backgroundColor:t.green,alignItems:'center',justifyContent:'center',marginTop:-24,elevation:5},floatingAddText:{color:t.onGreen,fontSize:30,fontWeight:'300'},
  editorHeader:{paddingHorizontal:20,height:58,borderBottomWidth:1,borderBottomColor:t.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},back:{color:t.violet,fontSize:14,fontWeight:'700',flexShrink:1},editorContent:{padding:20,paddingBottom:60},lockNotice:{backgroundColor:t.greenSoft,padding:13,borderRadius:16,marginTop:14},lockText:{color:t.greenStrong,fontSize:12,fontWeight:'700'},field:{marginTop:18},fieldLabel:{color:t.text,fontSize:11,fontWeight:'800',marginBottom:7,textTransform:'uppercase'},input:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:16,paddingHorizontal:13,paddingVertical:12,color:t.text,fontSize:14},inputLocked:{backgroundColor:t.surface2,color:t.muted},
  itemCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:18,padding:14,marginBottom:12,minWidth:0},itemHeading:{flexDirection:'row',justifyContent:'space-between',gap:10,marginBottom:9},itemIndex:{color:t.muted,fontSize:10,fontWeight:'900',letterSpacing:.8,flexShrink:1},deleteLink:{color:t.danger,fontSize:11,fontWeight:'800'},itemFields:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},compactField:{flex:1,minWidth:120},compactInput:{backgroundColor:t.surface2,borderWidth:1,borderColor:t.border,borderRadius:12,paddingHorizontal:9,paddingVertical:10,color:t.text,fontSize:13},lineTotal:{textAlign:'right',color:t.greenStrong,fontWeight:'900',marginTop:12},totalCard:{backgroundColor:t.surface2,borderWidth:1,borderColor:t.border,borderRadius:22,padding:18,flexDirection:'row',flexWrap:'wrap',gap:12,alignItems:'center',justifyContent:'space-between',marginTop:10,marginBottom:18},totalLabel:{color:t.muted,fontSize:11,fontWeight:'900',letterSpacing:1},totalValue:{color:t.greenStrong,fontSize:22,fontWeight:'900',flexShrink:1},primaryAction:{backgroundColor:t.green,borderRadius:16,padding:15,alignItems:'center',marginBottom:10},previewAction:{backgroundColor:t.violetSoft,borderWidth:1,borderColor:t.violet,borderRadius:16,padding:15,alignItems:'center',marginBottom:10},previewActionText:{color:t.violet,fontSize:13,fontWeight:'800'},issueAction:{backgroundColor:t.violet,borderRadius:16,padding:15,alignItems:'center'},issueActionText:{color:t.onViolet,fontSize:13,fontWeight:'800'},issuedScroll:{flex:1},issuedSuccess:{padding:20,paddingTop:40,paddingBottom:spacing.section},issuedNumber:{color:t.greenStrong,fontSize:24,fontWeight:'900',marginTop:16,marginBottom:4},pdfError:{color:t.danger,fontSize:12,lineHeight:18,marginTop:10},editorValidation:{color:t.danger,fontSize:12,fontWeight:'700',lineHeight:18,marginBottom:12},deleteAction:{padding:18,alignItems:'center'},emptyCard:{padding:24,alignItems:'center'},emptyTitle:{color:t.text,fontWeight:'800',marginBottom:6},emptyText:{color:t.muted,textAlign:'center',fontSize:12,lineHeight:18},
  formSection:{color:t.muted,fontSize:10,fontWeight:'900',letterSpacing:1,marginTop:24},twoColumns:{flexDirection:'row',gap:8},column:{flex:1,minWidth:0},shortColumn:{width:64,flexShrink:0},logoCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:18,padding:12,marginTop:18,flexDirection:'row',alignItems:'center',minWidth:0},logoPreview:{width:70,height:58,flexShrink:0},logoPlaceholder:{width:70,height:58,flexShrink:0,borderRadius:12,backgroundColor:t.greenSoft,alignItems:'center',justifyContent:'center'},logoPlaceholderText:{color:t.greenStrong,fontWeight:'900',fontSize:11},logoInfo:{flex:1,minWidth:0,marginLeft:12},logoActions:{flexDirection:'row',flexWrap:'wrap',gap:16,marginTop:10},detailsToggle:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:16,padding:15,marginVertical:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},detailsToggleText:{color:t.text,fontWeight:'800',fontSize:13,flexShrink:1},chevron:{color:t.muted,fontSize:18},appearanceCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:18,padding:14,minWidth:0},appearanceCopy:{flex:1,minWidth:0},themeModeList:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10},accountCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:18,padding:14,minWidth:0},accountHeading:{flexDirection:'row',alignItems:'center',gap:10},accountIcon:{width:36,height:36,borderRadius:18,backgroundColor:t.greenSoft,alignItems:'center',justifyContent:'center'},accountEmail:{color:t.text,fontSize:14,lineHeight:20,marginTop:12,flexShrink:1},accountRow:{flexDirection:'row',justifyContent:'space-between',gap:16,borderTopWidth:1,borderTopColor:t.border,marginTop:13,paddingTop:13,alignItems:'flex-start'},accountLabel:{color:t.muted,fontSize:12,fontWeight:'800'},accountValue:{alignItems:'flex-end',flexShrink:1},planBadge:{fontSize:10,fontWeight:'900',letterSpacing:.8,paddingHorizontal:8,paddingVertical:4,borderRadius:12,overflow:'hidden',marginBottom:5},proBadge:{backgroundColor:t.greenSoft,color:t.greenStrong},freeBadge:{backgroundColor:t.violetSoft,color:t.violet},planName:{color:t.text,fontSize:13,fontWeight:'800',textAlign:'right'},logoutRow:{minHeight:48,borderWidth:1,borderColor:t.danger,borderRadius:16,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:10,marginTop:20,marginBottom:8},logoutText:{color:t.danger,fontSize:13,fontWeight:'800'},
  choiceRow:{flexDirection:'row',flexWrap:'wrap',gap:7,marginVertical:10},choice:{borderWidth:1,borderColor:t.border,borderRadius:18,paddingHorizontal:12,paddingVertical:8,backgroundColor:t.surface2},choiceActive:{backgroundColor:t.green,borderColor:t.green},choiceText:{fontSize:11,fontWeight:'700',color:t.muted},choiceTextActive:{color:t.onGreen},inlineAdd:{flexDirection:'row',gap:8,alignItems:'center',marginBottom:10},
  stepper:{flexDirection:'row',gap:6,marginTop:18,marginBottom:4},stepChip:{flex:1,borderWidth:1,borderColor:t.border,borderRadius:12,paddingVertical:9,paddingHorizontal:5,alignItems:'center'},stepChipActive:{backgroundColor:t.green,borderColor:t.green},stepChipText:{fontSize:9,fontWeight:'800',color:t.muted},stepChipTextActive:{color:t.onGreen},clientSuggestion:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,padding:12,borderRadius:12,marginTop:6},inlineLink:{alignSelf:'flex-start',paddingVertical:9},activityMissing:{backgroundColor:t.violetSoft,borderWidth:1,borderColor:t.border,borderRadius:16,padding:14,marginTop:10},saveClientToggle:{paddingVertical:12,marginTop:8},secondaryContinue:{backgroundColor:t.violetSoft,borderWidth:1,borderColor:t.violet,borderRadius:16,padding:14,alignItems:'center',marginTop:18},compactItemCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:18,padding:14,marginBottom:10},compactItemRow:{flexDirection:'row',justifyContent:'space-between',gap:8,alignItems:'center',marginTop:8},confirmItemAction:{backgroundColor:t.green,borderRadius:12,padding:13,alignItems:'center',marginTop:14},addItemAction:{borderWidth:1,borderColor:t.green,borderStyle:'dashed',borderRadius:16,padding:15,alignItems:'center',marginBottom:14},
compactSelector:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:12,paddingHorizontal:12,paddingVertical:11,flexDirection:'row',justifyContent:'space-between',alignItems:'center',minWidth:0},compactSelectorText:{color:t.text,fontWeight:'800',fontSize:13,flexShrink:1},selectorChevron:{color:t.muted,fontSize:16},selectorPanel:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:12,marginTop:6,overflow:'hidden'},selectorOption:{paddingHorizontal:13,paddingVertical:11,borderBottomWidth:1,borderBottomColor:t.border,minWidth:0},catalogActionRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},catalogAction:{flexGrow:1,flexBasis:130,minWidth:0,borderWidth:1,borderColor:t.border,borderRadius:12,paddingVertical:10,paddingHorizontal:8,alignItems:'center'},catalogSearchInput:{paddingHorizontal:13,paddingVertical:11,color:t.text,fontSize:13,borderBottomWidth:1,borderBottomColor:t.border},catalogSearchPlaceholder:{color:t.muted},emptyCatalogText:{color:t.muted,fontSize:12,padding:13},catalogSuggestion:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:12,paddingHorizontal:12,paddingVertical:9,marginTop:5,minWidth:0},catalogModalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.42)',justifyContent:'flex-end'},catalogModalSheet:{maxHeight:'78%',backgroundColor:t.surface,borderTopLeftRadius:24,borderTopRightRadius:24,paddingTop:14,overflow:'hidden'},catalogModalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,paddingHorizontal:18,paddingBottom:10},modalClose:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:t.surface2,flexShrink:0},catalogModalList:{paddingHorizontal:10,paddingBottom:18},exportChoices:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:10},exportChoice:{flexGrow:1,flexBasis:130,minWidth:0,borderWidth:1,borderColor:t.border,borderRadius:12,paddingVertical:11,alignItems:'center'},themeOnboarding:{flex:1,justifyContent:'center',padding:24},brandMark:{width:58,height:58,alignItems:'center',justifyContent:'center',marginBottom:20},themeChoices:{marginTop:28},
}); }


