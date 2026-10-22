import { useLegacyStyles } from '../../ui/legacyStyles';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CatalogItem, Client, closeAccountDatabase, createDraft, createMeasurementUnit, createVatRate, deleteDraft, finalizeDraft, findCatalogItemByTitle, initializeDatabase, listCatalogItems, listClients, listMeasurementUnits, listQuotes, listRecentWorkItems, listVatRates, loadBusinessProfile, loadDocumentExport, loadDraftBusinessSnapshot, loadIssuedSnapshot, loadQuoteShareLinkCache, MeasurementUnit, saveCatalogItem, saveClient, saveDraft, saveQuoteShareLinkCache, updateBusinessProfile, VatRate } from '../../database';
import { BusinessProfile, choosePersistentLogo, deleteManagedLogo } from '../../businessProfile';
import { formatQuoteNumber } from '../../emissionClock';
import { calculateEconomics, createEmptyQuoteItem, formatMoney, globalDiscountInputKey, hasMeaningfulDraftContent, itemTotalCents, materializeNumericInputs, newId, numericInputKey, NumericInputDrafts, parseMoneyCents, parsePercentBasisPoints, Quote, quoteTotalCents, revisionHistoryForQuote, tryParseDecimal } from '../../domain';
import { buildDraftDocumentModel } from '../../documents/documentModel';
import { generateStoredFinalPdf, openIssuedPdf } from '../../documents/finalPdfWorkflow';
import { generateStoredFinalDocx } from '../../documents/docxWorkflow';
import { PdfPreview } from '../../documents/PdfPreview';
import { generateDraftPdf, removeDraftPdf } from '../../documents/pdfService';
import { prepareFinalPdfForShare, shareDocument, shareQuoteLink } from '../../documents/shareService';
import { getQuoteShareCapabilities, quoteShareLifecycleLabel, quoteShareUnavailableMessage, QuoteShareState } from '../../features/quote-sharing/shareCapabilities';
import { QuoteShare, QuoteShareCommercialOutcome, QuoteShareLifecycle } from '../../features/quote-sharing/QuoteSharingRepository';
import { createOrRecoverQuoteShare, recoverActiveQuoteShareLink } from '../../features/quote-sharing/quoteShareUseCases';
import { CommercialStatusBadge } from '../../features/quote-status/CommercialStatusBadge';
import { CanonicalCommercialOutcome, commercialOutcomeProvenanceLabel, CommercialOutcomeRemoteError, ManualCommercialOutcome, recordManualCommercialOutcome } from '../../features/quote-status/recordManualCommercialOutcome';
import { Button, Card, DetailListRow, Input, ScreenContent, Section, SegmentedTabs, Select, Stack, Toggle } from '../../ui/components';
import { showError } from '../../ui/showOperationError';
import { Icon, IconName } from '../../ui/Icon';
import { ThemeProvider, useTheme } from '../../ui/theme';
import { spacing, Theme } from '../../ui/tokens';
import { QuotivoLogo, QuotivoMark } from '../../ui/QuotivoLogo';
import { AuthProvider, useAuth } from '../../features/auth/AuthProvider';
import { AuthScreen } from '../../features/auth/AuthScreen';
import { BackendBootstrapProvider, useBackendBootstrap } from '../../features/bootstrap/BackendBootstrapProvider';
import { AccountLifecycleProvider } from '../../features/account-lifecycle/AccountLifecycleProvider';
import { AccountSettingsScreen } from '../../features/account-lifecycle/AccountSettingsScreen';
import { SupabaseQuoteIssuanceRepository } from '../../features/quote-issuance/SupabaseQuoteIssuanceRepository';
import { SupabaseIssuanceSnapshotRepository } from '../../features/quote-issuance/SupabaseIssuanceSnapshotRepository';
import { authorizeQuoteIssue } from '../../features/quote-issuance/authorizeQuoteIssue';
import { authorizeQuoteRevisionIssue } from '../../features/quote-issuance/authorizeQuoteRevisionIssue';
import { finalizeIssuanceSnapshotLifecycle, recoverIssuanceSnapshot } from '../../features/quote-issuance/finalizeIssuanceSnapshotLifecycle';
import { SupabaseQuoteNumberingRepository } from '../../features/quote-numbering/SupabaseQuoteNumberingRepository';
import { SupabaseQuoteSharingRepository } from '../../features/quote-sharing/SupabaseQuoteSharingRepository';
import { claimLegacyDataForCurrentAccount, inspectLegacyDataClaim, LegacyDataClaimAvailability } from '../../features/local-data/legacyDataClaim';
import { createRevisionForEditor, getRevisionActionInEditor } from '../../features/revisions/revisionEditorActions';
import { RevisionChainCapability } from '../../features/revisions/revisionChainCapability';
import { defaultIssuedQuoteDetailTab, issuedQuoteDetailTabs, IssuedQuoteDetailTab } from '../../features/quote-detail/issuedQuoteDetailTabs';
import { recoverRevisionShareLifecycle } from '../../features/quote-issuance/finalizeRevisionShareLifecycle';
import { RecentWorkItem } from '../../features/recent-work-items/recentWorkItems';
import { HomeScreen } from '../../features/dashboard/HomeScreen';
import { ArchiveScreen } from '../../features/archive/ArchiveScreen';
import { ArchiveNavigationIntent } from '../../features/archive/archiveNavigation';
import { ClientsEditor } from '../../features/clients/ClientsEditor';
import { CatalogEditor } from '../../features/catalog/CatalogEditor';
import { EditorReturnIntent, restoreEditorDraft, saveDraftBeforePrerequisite } from '../../features/quote-editor/editorPrerequisiteNavigation';
import { canContinueToQuoteSummary, missingConfirmedWorkItemMessage } from '../../features/quote-editor/editorStepNavigation';
import { supabase } from '../../data/remote/supabaseClient';
import { SupabaseJobRepository } from '../../features/jobs/SupabaseJobRepository';
import { JobApplicationService } from '../../features/jobs/JobApplicationService';
import { Job } from '../../features/jobs/JobRepository';
import { JobQuoteAction } from '../../features/jobs/JobQuoteAction';
import { JobDetailScreen, JobsScreen } from '../../features/jobs/JobsScreen';
import { LocalJobIssuanceSnapshotRecovery } from '../../features/jobs/LocalJobRepositories';
import { JobInputsApplicationService } from '../../features/jobs/JobInputsApplicationService';
import { SupabaseJobInputsRepository } from '../../features/jobs/SupabaseJobInputsRepository';
import { LocalJobInputsCacheRepository } from '../../features/jobs/LocalJobInputsCacheRepository';
const quoteIssuanceRepository = new SupabaseQuoteIssuanceRepository();
const issuanceSnapshotRepository = new SupabaseIssuanceSnapshotRepository();
const quoteNumberingRepository = new SupabaseQuoteNumberingRepository();
const quoteSharingRepository = new SupabaseQuoteSharingRepository();
const jobApplicationService = new JobApplicationService(new SupabaseJobRepository({ rpc: async (functionName, arguments_) => supabase.rpc(functionName, arguments_) }), undefined, undefined, new LocalJobIssuanceSnapshotRecovery(issuanceSnapshotRepository));
const jobInputsApplicationService = new JobInputsApplicationService(new SupabaseJobInputsRepository({ rpc: async (functionName, arguments_) => supabase.rpc(functionName, arguments_) }), new LocalJobInputsCacheRepository());
const normalizeSearch=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
export function QuoteEditorScreen({ initialQuote, allQuotes, commercialOutcomes, jobService, onOpenJob, onClose, onRevisionDraft, onResumeRevisionDraft, onOpenSettings, onOpenNumbering }: { initialQuote: Quote; allQuotes: Quote[]; commercialOutcomes: Readonly<Record<string, QuoteShareCommercialOutcome | null>>; jobService: JobApplicationService; onOpenJob: (job: Job) => void; onClose: () => void; onRevisionDraft:(quoteId:string)=>Promise<void>; onResumeRevisionDraft:(quoteId:string)=>Promise<void>; onOpenSettings:(intent:EditorReturnIntent)=>void; onOpenNumbering:(intent:EditorReturnIntent)=>void }) {
  const styles = useLegacyStyles();
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
  const [revisionAction,setRevisionAction]=useState<RevisionChainCapability>({kind:'ERROR_NOT_FOUND'});
  const [revisionActionLoading,setRevisionActionLoading]=useState(true);
  const [revisionActionError,setRevisionActionError]=useState<string|null>(null);
  const [revisionActionVersion,setRevisionActionVersion]=useState(0);
  const [revisionShareRecoveryError,setRevisionShareRecoveryError]=useState<string|null>(null);
  const [workItemsValidation,setWorkItemsValidation]=useState<string|null>(null);
  const numericDrafts = useRef<NumericInputDrafts>({});
  const operationInFlight = useRef(false);
  const editorScrollRef = useRef<ScrollView>(null);
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
  useEffect(()=>{if(initialQuote.status!=='issued')return;let cancelled=false;void (async()=>{const cache=await loadQuoteShareLinkCache(initialQuote.id);if(!cache?.issuanceId||cache.issuanceSnapshotSyncState!=='PENDING')return;const snapshot=await loadIssuedSnapshot(initialQuote.id);await recoverIssuanceSnapshot(issuanceSnapshotRepository,{issuanceId:cache.issuanceId,snapshot});if(!cancelled)await saveQuoteShareLinkCache({...cache,issuanceSnapshotSyncState:'SYNCED',shareSyncedAt:new Date().toISOString()});})().catch(()=>undefined);return()=>{cancelled=true;};},[initialQuote.id,initialQuote.status]);
  useEffect(()=>{ if(quote.status!=='issued'||quote.revisionNumber===0||!quote.parentQuoteId) return; void recoverRevisionShareSupersession(); },[quote.id,quote.status,quote.revisionNumber,quote.parentQuoteId]);
  useEffect(()=>{let cancelled=false;if(quote.status!=='issued'){setRevisionAction({kind:'ERROR_NOT_FOUND'});setRevisionActionError(null);setRevisionActionLoading(false);return;}setRevisionActionLoading(true);setRevisionActionError(null);getRevisionActionInEditor(quote.id).then((action)=>{if(!cancelled){setRevisionAction(action);setRevisionActionLoading(false);}}).catch((error)=>{if(!cancelled){setRevisionActionError(error instanceof Error?error.message:'Impossibile verificare la disponibilità della revisione.');setRevisionActionLoading(false);}});return()=>{cancelled=true;};},[quote.id,quote.status,revisionActionVersion]);
  const newItem=(position:number,vat=quote.defaultVatBasisPoints)=>({...createEmptyQuoteItem(newId('item'),position),confirmed:false,vatTreatment:'rate' as const,vatRateBasisPoints:vat});
  const addItem = () => setQuote((current) => { const item=newItem(current.items.length,current.defaultVatBasisPoints); setActiveItemId(item.id); return { ...current, items: [...current.items,item] }; });
  const confirmedItems=quote.items.filter((item)=>item.confirmed!==false&&item.description.trim());
  function openWorkItemsStep() { Keyboard.dismiss(); setStep(2); requestAnimationFrame(()=>editorScrollRef.current?.scrollTo({y:0,animated:false})); }
  function openSummaryStep() { if(!canContinueToQuoteSummary(quote.items)){setWorkItemsValidation(missingConfirmedWorkItemMessage);return;} setWorkItemsValidation(null);setStep(3); }
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
  async function sendWithQuotivo() { try { setSaving(true); let cache=await loadQuoteShareLinkCache(quote.id); if(!cache?.issuanceId) throw new Error('Emissione Quotivo non disponibile.'); if(cache.issuanceSnapshotSyncState==='PENDING'){await recoverIssuanceSnapshot(issuanceSnapshotRepository,{issuanceId:cache.issuanceId,snapshot:await loadIssuedSnapshot(quote.id)});cache={...cache,issuanceSnapshotSyncState:'SYNCED'};await saveQuoteShareLinkCache({...cache,shareSyncedAt:new Date().toISOString()});} const cachedState:QuoteShareState={shareId:cache.shareId,lifecycle:cache.lifecycle as QuoteShareLifecycle|null,commercialOutcome:cache.commercialOutcome as QuoteShareCommercialOutcome|null,openedAt:cache.openedAt}; if(__DEV__)console.info('Quote share request',{quoteId:quote.id,issuanceId:cache.issuanceId,shareId:cache.shareId}); const result=await createOrRecoverQuoteShare({repository:quoteSharingRepository,quoteId:quote.id,issuanceId:cache.issuanceId!,state:cachedState}); if(!result.url) throw new Error('Link Quotivo non disponibile.'); setShareFromRemote(result);await saveQuoteShareLinkCache({quoteId:quote.id,issuanceId:cache.issuanceId,shareId:result.id,lifecycle:result.lifecycle,commercialOutcome:result.commercialOutcome,openedAt:result.openedAt??null,shareSyncedAt:new Date().toISOString()});await shareQuoteLink(result.url); } catch(error) { showError(error); } finally { setSaving(false); } }
  async function revokeQuotivoLink() { if(!shareId) return; try { if(!shareCapabilities.canRevoke) throw new Error(quoteShareUnavailableMessage(shareState)); setSaving(true);await quoteSharingRepository.revoke(shareId);setShareLifecycle('REVOKED');const cache=await loadQuoteShareLinkCache(quote.id);if(cache)await saveQuoteShareLinkCache({...cache,shareId,lifecycle:'REVOKED',commercialOutcome:commercialOutcome??cache.commercialOutcome,openedAt,shareSyncedAt:new Date().toISOString()});}catch(error){showError(error)}finally{setSaving(false)} }
  async function recoverRevisionShareSupersession() { if (quote.status!=='issued' || quote.revisionNumber===0 || !quote.parentQuoteId) return; try { const [revisionShare,parentShare]=await Promise.all([loadQuoteShareLinkCache(quote.id),loadQuoteShareLinkCache(quote.parentQuoteId)]);if(!revisionShare?.issuanceId||!parentShare?.issuanceId) throw new Error('Dati di emissione revisione non disponibili.');await recoverRevisionShareLifecycle(quoteSharingRepository,{parentIssuanceId:parentShare.issuanceId,revisionIssuanceId:revisionShare.issuanceId});setRevisionShareRecoveryError(null); } catch { setRevisionShareRecoveryError('Revisione emessa correttamente, ma il link della revisione precedente non è stato ancora aggiornato. Riprova.'); } }
  async function retryRevisionShareSupersession() { try { setSaving(true); await recoverRevisionShareSupersession(); } finally { setSaving(false); } }
  async function refreshCanonicalOutcome(issuanceId:string) { const canonical=await quoteSharingRepository.getCommercialOutcome(issuanceId); setCanonicalOutcome(canonical); const cache=await loadQuoteShareLinkCache(quote.id); if(cache) await saveQuoteShareLinkCache({...cache,commercialOutcome:canonical.outcome,commercialOutcomeSource:canonical.source,commercialOutcomeDecidedAt:canonical.decidedAt,shareSyncedAt:new Date().toISOString()}); return canonical; }
  async function recordManualOutcome(outcome:ManualCommercialOutcome) { const cache=await loadQuoteShareLinkCache(quote.id); if(!cache?.issuanceId) return showError(new Error('Emissione Quotivo non disponibile.')); try { setSaving(true); const canonical=await recordManualCommercialOutcome(quoteSharingRepository,cache.issuanceId,outcome); setCanonicalOutcome(canonical); await saveQuoteShareLinkCache({...cache,commercialOutcome:canonical.outcome,commercialOutcomeSource:canonical.source,commercialOutcomeDecidedAt:canonical.decidedAt,shareSyncedAt:new Date().toISOString()}); } catch(error) { if(error instanceof CommercialOutcomeRemoteError&&error.code==='ALREADY_DECIDED') { try { await refreshCanonicalOutcome(cache.issuanceId); Alert.alert('Esito già registrato','È stato mostrato l’esito definitivo già registrato.'); } catch(refreshError) { showCommercialOutcomeError(refreshError); } } else showCommercialOutcomeError(error); } finally { setSaving(false); } }
  function confirmManualOutcome(outcome:ManualCommercialOutcome) { const label=outcome==='ACCEPTED'?'accettato':'rifiutato'; Alert.alert(`Segnare come ${label}?`,'Questa decisione è definitiva e non potrà essere modificata.',[{text:'Annulla',style:'cancel'},{text:`Segna come ${label}`,style:'destructive',onPress:()=>void recordManualOutcome(outcome)}]); }
  async function openSettings() { try { const current={...materializeNumericInputs(quote,numericDrafts.current),clientContactName:clientContact,clientPhone,clientEmail,clientTaxId,clientVatNumber}; onOpenSettings(await saveDraftBeforePrerequisite(current,'business-profile',saveDraft)); } catch(error) { showError(error); } }
  async function openNumberingPrerequisite(currentQuote: Quote) { try { onOpenNumbering(await saveDraftBeforePrerequisite(currentQuote,'numbering',saveDraft)); } catch(error) { showError(error); } }
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
        if(!authorization.authorized && authorization.reason==='SEQUENCE_UNINITIALIZED') { Alert.alert('Numerazione da configurare','Scegli come iniziare la numerazione prima della prima emissione.',[{text:'Ora no',style:'cancel'},{text:'Configura',onPress:()=>void openNumberingPrerequisite(currentQuote)}]); return; }
        if(!authorization.authorized) throw new Error('Non è stato possibile autorizzare l’emissione.');
        if(authorization.sequenceNumber===null||authorization.year===null) throw new Error('Numero server non disponibile.');
        if (revisionContext && (!parentIssuanceId || !authorization.issuanceId)) throw new Error('Emissione revisione non disponibile per l aggiornamento share.'); if (!authorization.issuanceId) throw new Error('Emissione Quotivo non disponibile per lo snapshot remoto.');
        const issuanceCache={quoteId:currentQuote.id,issuanceId:authorization.issuanceId,shareId:null,lifecycle:null,commercialOutcome:null,openedAt:null,shareSyncedAt:new Date().toISOString()} as const;
        const snapshotLifecycle=await finalizeIssuanceSnapshotLifecycle({issuanceId:authorization.issuanceId,finalize:()=>finalizeDraft(currentQuote,{number:authorization.sequenceNumber!,year:authorization.year!,revision:revisionContext??undefined}),loadIssuedSnapshot:()=>loadIssuedSnapshot(currentQuote.id),markPending:()=>saveQuoteShareLinkCache({...issuanceCache,issuanceSnapshotSyncState:'PENDING'}),markSynced:()=>saveQuoteShareLinkCache({...issuanceCache,issuanceSnapshotSyncState:'SYNCED'}),repository:issuanceSnapshotRepository});
        const assigned = snapshotLifecycle.emission;
        const snapshot=snapshotLifecycle.snapshot as {issuedAt?:string;issuedLocalDate?:string};
        let shareRecoveryPending=false;
        if(snapshotLifecycle.registration.kind==='COMPLETE'&&revisionContext){try{await recoverRevisionShareLifecycle(quoteSharingRepository,{parentIssuanceId:parentIssuanceId!,revisionIssuanceId:authorization.issuanceId});}catch{shareRecoveryPending=true;}}
        const lifecycleResult={supersession:{kind:shareRecoveryPending?'PENDING_RECOVERY':'COMPLETE'}};
        setRevisionShareRecoveryError(lifecycleResult.supersession.kind==='PENDING_RECOVERY'?'Revisione emessa correttamente, ma il link della revisione precedente non è stato ancora aggiornato. Riprova.':null);
        setQuote({...currentQuote,status:'issued',number:assigned.number,numberYear:assigned.year,issuedAt:snapshot.issuedAt??new Date().toISOString(),issuedLocalDate:snapshot.issuedLocalDate??null});
        if(snapshotLifecycle.registration.kind==='PENDING_RECOVERY') Alert.alert('Preventivo emesso correttamente',`È stato assegnato il numero ${assigned.number}/${assigned.year}, ma la copia remota immutabile è in attesa di sincronizzazione. Verrà ritentata senza una nuova emissione.`);
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
  async function openIssuedPdfForQuote(target: Quote) {
    if(operationInFlight.current)return; operationInFlight.current=true;
    try { setSaving(true); const result=await openIssuedPdf(target.id);setPdfError(null);setPreview({uri:result.uri,title:`Preventivo ${formatQuoteNumber(target.number,target.numberYear)} · Rev.${target.revisionNumber}`,temporary:false}); }
    catch(error){const message=error instanceof Error?error.message:'Errore sconosciuto.';setPdfError(message);showError(error);} finally{setSaving(false);operationInFlight.current=false;}
  }
  async function openOrRegenerateFinal() { await openIssuedPdfForQuote(quote); }
  async function exportAndShare(kind:'pdf'|'docx') {
    if(operationInFlight.current)return; operationInFlight.current=true;
    try { setSaving(true); const uri=kind==='pdf'?await prepareFinalPdfForShare(quote.id):await generateStoredFinalDocx(quote.id); await shareDocument(uri,kind==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',kind==='pdf'?'Condividi PDF':'Condividi documento Word'); }
    catch(error){showError(error);} finally{setSaving(false);operationInFlight.current=false;}
  }
  async function handleRevisionAction() {
    if(operationInFlight.current)return;
    operationInFlight.current=true;
    try { setSaving(true); if(revisionAction.kind==='CREATE') await onRevisionDraft(quote.id); else if(revisionAction.kind==='RESUME') await onResumeRevisionDraft(revisionAction.draftQuoteId); }
    catch(error) { showError(error); }
    finally { setSaving(false); operationInFlight.current=false; }
  }
  function confirmFinalization(){Alert.alert('Finalizzare il preventivo?','Verrà assegnato il numero definitivo e i contenuti non saranno più modificabili.',[{text:'Annulla',style:'cancel'},{text:'Finalizza',style:'destructive',onPress:()=>persist(true)}]);}
  function removeDraft() { Alert.alert('Eliminare la bozza?', 'Questa operazione non può essere annullata.', [{ text: 'Annulla', style: 'cancel' }, { text: 'Elimina', style: 'destructive', onPress: async () => { try { await deleteDraft(quote.id); onClose(); } catch (error) { showError(error); } } }]); }
  async function copyActiveLink(){try{await Clipboard.setStringAsync(await recoverActiveQuoteShareLink(quoteSharingRepository,shareState));Alert.alert('Link copiato');}catch(error){showError(error);}}
  const canCreateRevision=revisionAction.kind==='CREATE'||revisionAction.kind==='RESUME';
  const createRevision=handleRevisionAction;
  if(preview)return <PdfPreview uri={preview.uri} title={preview.title} onClose={()=>{if(preview.temporary)removeDraftPdf(preview.uri);setPreview(null);}}/>;
  if(!editable)return <IssuedQuoteDetail quote={quote} total={total} outcome={{outcome:commercialOutcome??'PENDING',source:commercialOutcomeSource,decidedAt:commercialOutcomeDecidedAt}} revisionHistory={revisionHistoryForQuote([...allQuotes.filter((candidate)=>candidate.id!==quote.id),quote],quote)} revisionOutcomes={commercialOutcomes} jobService={jobService} onOpenJob={onOpenJob} saving={saving} pdfError={pdfError} shareState={shareState} shareCapabilities={shareCapabilities} revisionAction={revisionAction} revisionActionError={revisionActionError} revisionActionLoading={revisionActionLoading} revisionShareRecoveryError={revisionShareRecoveryError} onRetryRevisionAction={()=>setRevisionActionVersion((value)=>value+1)} onRetryRevisionShareRecovery={retryRevisionShareSupersession} onClose={closeEditor} onPreview={openOrRegenerateFinal} onPreviewRevision={openIssuedPdfForQuote} onExport={exportAndShare} onMark={confirmManualOutcome} onSend={sendWithQuotivo} onCopy={copyActiveLink} onRevoke={revokeQuotivoLink} onRevisionAction={handleRevisionAction}/>;
  if(!editable)return <SafeAreaView style={styles.safeArea}><View style={styles.appShell}><View style={styles.editorHeader}><Pressable onPress={()=>void closeEditor()}><Text style={styles.back}>‹ Preventivi</Text></Pressable></View><ScrollView contentContainerStyle={styles.issuedSuccess}><Text style={styles.pageTitle}>Dettaglio preventivo</Text><View style={styles.compactItemCard}><Text style={styles.issuedNumber}>N. {formatQuoteNumber(quote.number,quote.numberYear)}</Text><Text style={styles.quoteTitle}>{quote.title||'Preventivo senza titolo'}</Text><Text style={styles.quoteClient}>{quote.client||'Cliente da inserire'}</Text><Text style={styles.quoteTotal}>{formatMoney(total)}</Text><Text style={styles.quoteClient}>Revisione {quote.revisionNumber}</Text></View><Text style={styles.formSection}>STATO COMMERCIALE</Text><View style={styles.compactItemCard}><CommercialStatusBadge quoteStatus={quote.status} commercialOutcome={commercialOutcome}/><Text style={styles.quoteClient}>Lo stato commerciale è distinto dalla condivisione.</Text></View><Text style={styles.formSection}>DOCUMENTO</Text><Pressable disabled={saving} style={styles.previewAction} onPress={()=>void openOrRegenerateFinal()}><Text style={styles.previewActionText}>Visualizza PDF emesso</Text></Pressable><View style={styles.exportChoices}><Pressable disabled={saving} style={styles.exportChoice} onPress={()=>void exportAndShare('pdf')}><Text style={styles.linkText}>Condividi PDF</Text></Pressable><Pressable disabled={saving} style={styles.exportChoice} onPress={()=>void exportAndShare('docx')}><Text style={styles.linkText}>Condividi Word</Text></Pressable></View>{pdfError&&<Text style={styles.pdfError}>PDF non disponibile: {pdfError}</Text>}<Text style={styles.formSection}>CONDIVISIONE QUOTIVO</Text><View style={styles.compactItemCard}><Text style={styles.quoteTitle}>{quoteShareLifecycleLabel(shareState)}</Text><Text style={styles.quoteClient}>Stato del link e della sua condivisione.</Text></View>{shareCapabilities.canShare?<><Pressable disabled={saving} style={styles.issueAction} onPress={()=>void sendWithQuotivo()}><Text style={styles.issueActionText}>Condividi link</Text></Pressable><Pressable disabled={saving} style={styles.previewAction} onPress={()=>void copyActiveLink()}><Text style={styles.previewActionText}>Copia link</Text></Pressable></>:shareCapabilities.canCreateShare&&<Pressable disabled={saving} style={styles.issueAction} onPress={()=>void sendWithQuotivo()}><Text style={styles.issueActionText}>{saving?'Preparazione…':'Invia con Quotivo'}</Text></Pressable>}{shareCapabilities.canRevoke&&<Pressable disabled={saving} style={styles.deleteAction} onPress={()=>void revokeQuotivoLink()}><Text style={styles.deleteLink}>Revoca link</Text></Pressable>}{canCreateRevision&&<><Text style={styles.formSection}>REVISIONE</Text><Pressable disabled={saving} style={styles.issueAction} onPress={()=>void createRevision()}><Text style={styles.issueActionText}>{saving?'Creazione revisione…':'Crea revisione'}</Text></Pressable></>}<Pressable disabled={saving} style={styles.deleteAction} onPress={()=>void closeEditor()}><Text style={styles.linkText}>Torna ai preventivi</Text></Pressable></ScrollView></View></SafeAreaView>;  return <SafeAreaView style={styles.safeArea}><KeyboardAvoidingView style={styles.appShell} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.editorHeader}><Pressable onPress={()=>void closeEditor()}><Text style={styles.back}>‹ Archivio</Text></Pressable><CommercialStatusBadge quoteStatus={quote.status} commercialOutcome={null}/></View>
    <ScrollView ref={editorScrollRef} contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled"><Text style={styles.pageTitle}>{editable ? `Modifica preventivo${quote.revisionNumber>0?` · Revisione ${quote.revisionNumber}`:''}` : quote.title}</Text>
      {!editable && <View style={styles.lockNotice}><Text style={styles.lockText}>Documento emesso: contenuto e numero sono bloccati.</Text></View>}
      {editable&&<View style={styles.stepper}><Pressable onPress={()=>setStep(1)} style={[styles.stepChip,step===1&&styles.stepChipActive]}><Text style={[styles.stepChipText,step===1&&styles.stepChipTextActive]}>1 Cliente e lavoro</Text></Pressable><Pressable onPress={openWorkItemsStep} style={[styles.stepChip,step===2&&styles.stepChipActive]}><Text style={[styles.stepChipText,step===2&&styles.stepChipTextActive]}>2 Lavorazioni</Text></Pressable><Pressable onPress={openSummaryStep} style={[styles.stepChip,step===3&&styles.stepChipActive]}><Text style={[styles.stepChipText,step===3&&styles.stepChipTextActive]}>3 Riepilogo</Text></Pressable></View>}
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
      {editable&&<Pressable style={styles.secondaryContinue} onPress={openWorkItemsStep}><Text style={styles.previewActionText}>Continua alle lavorazioni</Text></Pressable>}
      </>}
      {(step===2||!editable)&&<>
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Lavorazioni</Text><Text style={styles.pageSubtitle}>{confirmedItems.length} confermate</Text></View>
      {workItemsValidation&&<Text style={styles.editorValidation}>{workItemsValidation}</Text>}
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
      {editable&&<Pressable style={styles.secondaryContinue} onPress={openSummaryStep}><Text style={styles.previewActionText}>Continua al riepilogo</Text></Pressable>}
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
function EconomicSummary({quote}:{quote:Quote}) { const styles = useLegacyStyles(); const e=calculateEconomics(quote.items,quote.globalDiscountBasisPoints); return <View style={styles.totalCard}><View><Text style={styles.totalLabel}>IMPONIBILE {formatMoney(e.netCents)}</Text><Text style={styles.totalLabel}>IVA {formatMoney(e.vatCents)}</Text></View><Text style={styles.totalValue}>{formatMoney(e.totalCents)}</Text></View>; }
function IssuedQuoteDetail({ quote, total, outcome, revisionHistory, revisionOutcomes, jobService, onOpenJob, saving, pdfError, shareState, shareCapabilities, revisionAction, revisionActionError, revisionActionLoading, revisionShareRecoveryError, onRetryRevisionAction, onRetryRevisionShareRecovery, onClose, onPreview, onPreviewRevision, onExport, onMark, onSend, onCopy, onRevoke, onRevisionAction }: { quote: Quote; total: number; outcome: CanonicalCommercialOutcome; revisionHistory: readonly Quote[]; revisionOutcomes: Readonly<Record<string, QuoteShareCommercialOutcome | null>>; jobService: JobApplicationService; onOpenJob: (job: Job) => void; saving: boolean; pdfError: string | null; shareState: QuoteShareState; shareCapabilities: ReturnType<typeof getQuoteShareCapabilities>; revisionAction: RevisionChainCapability; revisionActionError: string | null; revisionActionLoading: boolean; revisionShareRecoveryError: string | null; onRetryRevisionAction: () => void; onRetryRevisionShareRecovery: () => Promise<void>; onClose: () => Promise<void>; onPreview: () => Promise<void>; onPreviewRevision: (quote: Quote) => Promise<void>; onExport: (kind: 'pdf' | 'docx') => Promise<void>; onMark: (outcome: ManualCommercialOutcome) => void; onSend: () => Promise<void>; onCopy: () => Promise<void>; onRevoke: () => Promise<void>; onRevisionAction: () => Promise<void> }) {
  const styles = useLegacyStyles();
  const {theme}=useTheme();
  const [activeTab,setActiveTab]=useState<IssuedQuoteDetailTab>(defaultIssuedQuoteDetailTab);
  const provenance=commercialOutcomeProvenanceLabel(outcome);
  const revisionLabel=revisionAction.kind==='RESUME'?'Riprendi revisione':'Crea revisione';
  const revisionCapabilityError=revisionAction.kind==='ERROR_NOT_FOUND'
    ? 'Preventivo non disponibile per la revisione.'
    : revisionAction.kind==='ERROR_INVALID_LINEAGE'
      ? 'La catena delle revisioni non è valida.'
      : null;
  return <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}><View style={styles.appShell}><View style={styles.editorHeader}><Pressable accessibilityRole="button" accessibilityLabel="Torna ai preventivi" onPress={()=>void onClose()}><Text style={styles.back}>‹ Preventivi</Text></Pressable></View><ScreenContent><Stack gap="sm"><Card><Text style={styles.issuedNumber}>N. {formatQuoteNumber(quote.number,quote.numberYear)} · Rev.{quote.revisionNumber}</Text><CommercialStatusBadge quoteStatus={quote.status} commercialOutcome={outcome.outcome}/><Text style={styles.quoteTotal}>{formatMoney(total)}</Text></Card><SegmentedTabs tabs={issuedQuoteDetailTabs} value={activeTab} onChange={setActiveTab}/></Stack></ScreenContent><ScrollView style={styles.issuedScroll} keyboardShouldPersistTaps="handled"><ScreenContent bottom>{activeTab==='summary'&&<><Section title="Riepilogo"><Card><Text style={styles.quoteTitle}>{quote.title||'Preventivo senza titolo'}</Text><Text style={styles.quoteClient}>{quote.client||'Cliente da inserire'}</Text><Text style={styles.quoteTotal}>{formatMoney(total)}</Text></Card></Section><Section title="Esito commerciale"><Card><Stack gap="sm">{provenance?<Text style={styles.quoteClient}>{provenance}</Text>:<><Text style={styles.quoteClient}>Lo stato commerciale è distinto dalla condivisione.</Text><Button disabled={saving} onPress={()=>onMark('ACCEPTED')}>Segna come accettato</Button><Button disabled={saving} variant="danger" onPress={()=>onMark('REJECTED')}>Segna come rifiutato</Button></>}</Stack></Card></Section><JobQuoteAction quote={quote} service={jobService} onOpenJob={onOpenJob}/></>}{activeTab==='document'&&<><Section title="Documento"><Stack gap="sm"><Button disabled={saving} variant="secondary" onPress={()=>void onPreview()}>Apri PDF</Button><Button disabled={saving} variant="secondary" onPress={()=>void onExport('pdf')}>Condividi PDF</Button><Button disabled={saving} variant="secondary" onPress={()=>void onExport('docx')}>Condividi Word</Button>{pdfError&&<Text style={styles.pdfError}>PDF non disponibile: {pdfError}</Text>}</Stack></Section>{(revisionActionLoading||revisionAction.kind==='CREATE'||revisionAction.kind==='RESUME'||revisionActionError||revisionCapabilityError)&&<Section title="Revisione"><Card><Stack gap="sm">{revisionActionLoading?<><ActivityIndicator color={theme.violet}/><Text style={styles.quoteClient}>Verifica revisione…</Text></>:(revisionActionError||revisionCapabilityError)?<><Text style={styles.quoteClient}>{revisionActionError??revisionCapabilityError}</Text><Button disabled={saving} variant="secondary" onPress={onRetryRevisionAction}>Riprova</Button></>:<Button disabled={saving} onPress={()=>void onRevisionAction()}>{saving?(revisionAction.kind==='RESUME'?'Apertura revisione…':'Creazione revisione…'):revisionLabel}</Button>}</Stack></Card></Section>}<Section title={`Storico revisioni (${revisionHistory.length})`}><Stack gap="sm">{revisionHistory.length?revisionHistory.map((revision)=><DetailListRow key={revision.id} title={`Rev.${revision.revisionNumber}`} details={`${revision.issuedLocalDate??revision.issuedAt?.slice(0,10)??'Data non disponibile'} · ${formatMoney(quoteTotalCents(revision))}`} trailing={<CommercialStatusBadge quoteStatus={revision.status} commercialOutcome={revisionOutcomes[revision.id]??null}/>} actionLabel="Apri PDF" onAction={()=>void onPreviewRevision(revision)} disabled={saving}/>):<Text style={styles.quoteClient}>Nessuna revisione precedente.</Text>}</Stack></Section></>}{activeTab==='activity'&&<Section title="Attività"><Stack gap="sm"><Card><Text style={styles.quoteTitle}>{quoteShareLifecycleLabel(shareState)}</Text><Text style={styles.quoteClient}>Stato del link e della sua condivisione.</Text>{provenance&&<Text style={styles.quoteClient}>{provenance}</Text>}</Card>{revisionShareRecoveryError&&<Card><Stack gap="sm"><Text style={styles.quoteClient}>{revisionShareRecoveryError}</Text><Button disabled={saving} variant="secondary" onPress={()=>void onRetryRevisionShareRecovery()}>Riprova aggiornamento link</Button></Stack></Card>}{shareCapabilities.canShare&&<Stack gap="sm"><Button disabled={saving} onPress={()=>void onSend()}>Condividi link</Button><Button disabled={saving} variant="secondary" onPress={()=>void onCopy()}>Copia link</Button></Stack>}{shareCapabilities.canCreateShare&&<Button disabled={saving} onPress={()=>void onSend()}>{saving?'Preparazione…':'Invia con Quotivo'}</Button>}{shareCapabilities.canRevoke&&<Button disabled={saving} variant="danger" onPress={()=>void onRevoke()}>Revoca link</Button>}</Stack></Section>}</ScreenContent></ScrollView></View></SafeAreaView>;
}
function showCommercialOutcomeError(error: unknown) { const message=error instanceof CommercialOutcomeRemoteError ? error.code==='OFFLINE' ? 'Nessuna decisione è stata registrata: verifica la connessione e riprova.' : error.code==='AUTH' ? 'Accedi di nuovo per registrare l’esito.' : error.code==='RLS' ? 'Non hai l’autorizzazione per registrare l’esito.' : 'Il servizio Quotivo non è disponibile al momento. Riprova più tardi.' : error instanceof Error ? error.message : 'Si è verificato un errore.'; Alert.alert('Esito non registrato',message); }

