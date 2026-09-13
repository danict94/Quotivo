import { StatusBar } from 'expo-status-bar';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CatalogItem, Client, createDraft, createMeasurementUnit, createVatRate, deleteCatalogItem, deleteClient, deleteDraft, finalizeDraft, findCatalogItemByTitle, initializeDatabase, listCatalogItems, listClients, listMeasurementUnits, listQuotes, listVatRates, loadBusinessProfile, loadDocumentExport, loadDraftBusinessSnapshot, loadIssuedSnapshot, MeasurementUnit, saveCatalogItem, saveClient, saveDraft, updateBusinessProfile, VatRate } from './src/database';
import { BusinessProfile, choosePersistentLogo, deleteManagedLogo } from './src/businessProfile';
import { formatQuoteNumber } from './src/emissionClock';
import { calculateEconomics, createEmptyQuoteItem, formatMoney, globalDiscountInputKey, hasMeaningfulDraftContent, itemTotalCents, materializeNumericInputs, newId, numericInputKey, NumericInputDrafts, parseMoneyCents, parsePercentBasisPoints, Quote, quoteTotalCents, tryParseDecimal } from './src/domain';
import { buildDraftDocumentModel } from './src/documents/documentModel';
import { generateStoredFinalPdf } from './src/documents/finalPdfWorkflow';
import { generateStoredFinalDocx } from './src/documents/docxWorkflow';
import { PdfPreview } from './src/documents/PdfPreview';
import { generateDraftPdf, removeDraftPdf } from './src/documents/pdfService';
import { prepareFinalPdfForShare, shareDocument } from './src/documents/shareService';
import { EmptyState as BaseEmptyState, Input, Select, Toggle } from './src/ui/components';
import { Icon, IconName } from './src/ui/Icon';
import { ThemeProvider, useTheme } from './src/ui/theme';
import { Theme } from './src/ui/tokens';
import { QuotivoLogo, QuotivoMark } from './src/ui/QuotivoLogo';

type Screen = 'home' | 'archive' | 'clients' | 'catalog' | 'settings' | 'editor';
const normalizeSearch=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();

export default function App() {
  return <SafeAreaProvider><ThemeProvider><QuotivoApp /></ThemeProvider></SafeAreaProvider>;
}

function QuotivoApp() {
  const {theme,preference,ready,setPreference}=useTheme(); styles=createStyles(theme);
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>('home');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => setQuotes(await listQuotes()), []);

  useEffect(() => { initializeDatabase().then(refresh).catch(showError).finally(() => setLoading(false)); }, [refresh]);

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
  if (screen === 'editor' && editing) return <QuoteEditor initialQuote={editing} onClose={closeEditor} onOpenSettings={(quote)=>{setEditing(quote);setScreen('settings');}} />;

  const issued = quotes.filter((quote) => quote.status === 'issued');
  const draftCount = quotes.length - issued.length;
  const issuedTotal = issued.reduce((sum, quote) => sum + quoteTotalCents(quote), 0);
  const openQuote = (quote: Quote) => { setEditing(quote); setScreen('editor'); };

  return <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}><StatusBar style="dark" /><View style={styles.appShell}>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 94 + insets.bottom }]} showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}><View><QuotivoLogo width={142}/></View></View>
      {screen === 'home' ? <>
        <View style={styles.heroCard}><Text style={styles.heroKicker}>ARCHIVIO LOCALE E SICURO</Text><Text style={styles.heroTitle}>Crea il prossimo preventivo in pochi minuti.</Text><Text style={styles.heroDescription}>Il numero viene assegnato soltanto quando emetti il documento.</Text><Pressable style={styles.primaryButton} onPress={startDraft}><Text style={styles.primaryButtonText}>+ Nuovo preventivo</Text></Pressable></View>
        <Text style={styles.sectionTitle}>Panoramica</Text><View style={styles.statsRow}><StatCard label="Emesso" value={formatMoney(issuedTotal)} detail={`${issued.length} preventivi`} /><StatCard label="Da completare" value={String(draftCount)} detail="bozze senza numero" /></View>
        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Ultimi preventivi</Text><Pressable onPress={() => setScreen('archive')}><Text style={styles.linkText}>Vedi archivio</Text></Pressable></View>
        {quotes.slice(0, 3).map((quote) => <QuoteRow key={quote.id} quote={quote} onPress={() => openQuote(quote)} onDeleteDraft={quote.status==='draft'?()=>confirmDeleteDraft(quote):undefined} />)}{!quotes.length && <EmptyState />}
      </> : screen === 'archive' ? <>
        <View style={styles.archiveHeader}><View><Text style={styles.pageTitle}>Archivio</Text><Text style={styles.pageSubtitle}>{quotes.length} preventivi salvati sul dispositivo</Text></View><Pressable style={styles.smallButton} onPress={startDraft}><Text style={styles.smallButtonText}>+ Nuovo</Text></Pressable></View>
        {quotes.map((quote) => <QuoteRow key={quote.id} quote={quote} onPress={() => openQuote(quote)} onDeleteDraft={quote.status==='draft'?()=>confirmDeleteDraft(quote):undefined} />)}{!quotes.length && <EmptyState />}
      </> : screen === 'clients' ? <ClientsEditor onCreateQuote={startDraftForClient} /> : screen === 'catalog' ? <CatalogEditor /> : <BusinessProfileEditor onReturnToQuote={editing?()=>setScreen('editor'):undefined} />}
    </ScrollView>
    <View style={[styles.tabBar, { height: 64 + insets.bottom, paddingBottom: insets.bottom }]}><TabButton label="Home" icon="home-variant-outline" active={screen === 'home'} onPress={() => setScreen('home')} /><TabButton label="Preventivi" icon="file-document-outline" active={screen === 'archive'} onPress={() => setScreen('archive')} /><TabButton label="Clienti" icon="account-group-outline" active={screen === 'clients'} onPress={() => setScreen('clients')} /><TabButton label="Catalogo" icon="format-list-bulleted" active={screen === 'catalog'} onPress={() => setScreen('catalog')} /><TabButton label="Impostazioni" icon="cog-outline" active={screen === 'settings'} onPress={() => setScreen('settings')} /></View>
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

function ClientsEditor({onCreateQuote}:{onCreateQuote:(client:Client)=>Promise<void>}) {
  const [clients,setClients]=useState<Client[]>([]); const [query,setQuery]=useState(''); const [editing,setEditing]=useState<Client|null>(null); const [saving,setSaving]=useState(false);
  const [name,setName]=useState(''); const [address,setAddress]=useState(''); const [taxId,setTaxId]=useState(''); const [vatNumber,setVatNumber]=useState(''); const [phone,setPhone]=useState(''); const [email,setEmail]=useState(''); const [contactName,setContactName]=useState('');
  const refresh=useCallback(async()=>setClients(await listClients(query)),[query]);
  useEffect(()=>{refresh().catch(showError);},[refresh]);
  function edit(client:Client) { setEditing(client);setName(client.name);setAddress(client.address);setTaxId(client.taxId);setVatNumber(client.vatNumber);setPhone(client.phone);setEmail(client.email);setContactName(client.contactName); }
  function create() { setEditing({id:'',name:'',address:'',taxId:'',vatNumber:'',phone:'',email:'',contactName:'',createdAt:'',updatedAt:''});setName('');setAddress('');setTaxId('');setVatNumber('');setPhone('');setEmail('');setContactName(''); }
  async function save() { if(!editing)return; try { setSaving(true);const saved=await saveClient({id:editing.id||undefined,name,address,taxId,vatNumber,phone,email,contactName});setClients((current)=>[...current.filter((client)=>client.id!==saved.id),saved].sort((a,b)=>a.name.localeCompare(b.name,'it')));setEditing(null); } catch(error) { showError(error); } finally { setSaving(false); } }
  async function createQuote() { if(!editing)return; try { setSaving(true); const saved=await saveClient({id:editing.id||undefined,name,address,taxId,vatNumber,phone,email,contactName}); await onCreateQuote(saved); } catch(error) { showError(error); } finally { setSaving(false); } }
  function remove(client:Client) { Alert.alert('Eliminare cliente?',`“${client.name}” verrà rimosso solo dalla rubrica; i preventivi restano invariati.`,[{text:'Annulla',style:'cancel'},{text:'Elimina',style:'destructive',onPress:async()=>{try{await deleteClient(client.id);setClients((current)=>current.filter((value)=>value.id!==client.id));setEditing(null);}catch(error){showError(error);}}}]); }
  if(editing)return <View><View style={styles.archiveHeader}><View><Text style={styles.pageTitle}>{editing.id?'Modifica cliente':'Nuovo cliente'}</Text><Text style={styles.pageSubtitle}>I preventivi già creati non vengono modificati.</Text></View><Pressable onPress={()=>setEditing(null)}><Text style={styles.linkText}>Chiudi</Text></Pressable></View><Field label="Nome / Ragione sociale" value={name} editable placeholder="Es. Mario Rossi" onChangeText={setName}/><Field label="Indirizzo" value={address} editable onChangeText={setAddress}/><View style={styles.twoColumns}><View style={styles.column}><Field label="Codice fiscale" value={taxId} editable onChangeText={setTaxId}/></View><View style={styles.column}><Field label="P. IVA" value={vatNumber} editable onChangeText={setVatNumber}/></View></View><Field label="Telefono" value={phone} editable keyboardType="phone-pad" onChangeText={setPhone}/><Field label="Email" value={email} editable keyboardType="email-address" autoCapitalize="none" onChangeText={setEmail}/><Field label="Referente" value={contactName} editable onChangeText={setContactName}/><Pressable disabled={saving} style={styles.primaryAction} onPress={save}><Text style={styles.primaryButtonText}>{saving?'Salvataggio…':'Salva modifiche'}</Text></Pressable><Pressable disabled={saving} style={styles.previewAction} onPress={()=>void createQuote()}><Text style={styles.previewActionText}>Crea preventivo</Text></Pressable>{Boolean(editing.id)&&<Pressable disabled={saving} style={styles.deleteAction} onPress={()=>remove(editing)}><Text style={styles.deleteLink}>Elimina cliente</Text></Pressable>}</View>;
  return <View><View style={styles.archiveHeader}><View><Text style={styles.pageTitle}>Clienti</Text><Text style={styles.pageSubtitle}>Rubrica locale del dispositivo.</Text></View><Pressable style={styles.smallButton} onPress={create}><Text style={styles.smallButtonText}>+ Nuovo cliente</Text></Pressable></View><Field label="Cerca cliente" value={query} editable placeholder="Nome o referente" onChangeText={setQuery}/>{clients.map((client)=><Pressable key={client.id} style={styles.compactItemCard} onPress={()=>edit(client)}><Text style={styles.quoteTitle}>{client.name}</Text>{Boolean(client.address)&&<Text style={styles.quoteClient}>{client.address}</Text>}</Pressable>)}{!clients.length&&<View style={styles.emptyCard}><Text style={styles.emptyTitle}>{query?'Nessun risultato':'Rubrica vuota'}</Text><Text style={styles.emptyText}>Aggiungi un cliente o salvalo durante un preventivo.</Text></View>}</View>;
}

function CatalogEditor() {
  const [items,setItems]=useState<CatalogItem[]>([]);
  const [units,setUnits]=useState<MeasurementUnit[]>([]);
  const [query,setQuery]=useState('');
  const [editing,setEditing]=useState<CatalogItem|null>(null);
  const [title,setTitle]=useState('');
  const [priceMode,setPriceMode]=useState<'measured'|'body'>('measured');
  const [unitCode,setUnitCode]=useState<string|null>(null);
  const [priceText,setPriceText]=useState('0,00');
  const [unitOpen,setUnitOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const refresh=useCallback(async()=>setItems(await listCatalogItems()),[]);
  useEffect(()=>{Promise.all([refresh(),listMeasurementUnits().then(setUnits)]).catch(showError);},[refresh]);
  const visible=items.filter((item)=>item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selectedUnit=units.find((unit)=>unit.code===unitCode)??null;
  function edit(item:CatalogItem) { setEditing(item);setTitle(item.title);setPriceMode(item.priceMode);setUnitCode(item.unitCode);setPriceText((item.priceCents/100).toFixed(2).replace('.',','));setUnitOpen(false); }
  function create() { setEditing({id:'',title:'',priceMode:'measured',unitCode:null,unitLabel:'',priceCents:0,createdAt:'',updatedAt:''});setTitle('');setPriceMode('measured');setUnitCode(null);setPriceText('0,00');setUnitOpen(false); }
  async function save() {
    if(!editing)return;
    try {
      setSaving(true);
      const duplicate=await findCatalogItemByTitle(title);
      const persist=async(id?:string)=>{const saved=await saveCatalogItem({id,title,priceMode,unitCode:priceMode==='measured'?unitCode:null,unitLabel:priceMode==='measured'?selectedUnit?.label??'':'',priceCents:parseMoneyCents(priceText)});setItems((current)=>[...current.filter((item)=>item.id!==saved.id),saved].sort((a,b)=>a.title.localeCompare(b.title,'it')));setEditing(null);};
      if(duplicate&&duplicate.id!==editing.id) Alert.alert('Lavorazione già in catalogo',`Vuoi aggiornare “${duplicate.title}” con questi valori?`,[{text:'Annulla',style:'cancel'},{text:'Aggiorna',onPress:()=>{void persist(duplicate.id).catch(showError);}}]);
      else await persist(editing.id||undefined);
    } catch(error) { showError(error); } finally { setSaving(false); }
  }
  function remove(item:CatalogItem) { Alert.alert('Eliminare dal catalogo?',`“${item.title}” non verrà rimossa dai preventivi esistenti.`,[{text:'Annulla',style:'cancel'},{text:'Elimina',style:'destructive',onPress:async()=>{try{await deleteCatalogItem(item.id);setItems((current)=>current.filter((value)=>value.id!==item.id));setEditing(null);}catch(error){showError(error);}}}]); }
  if(editing)return <View><View style={styles.archiveHeader}><View><Text style={styles.pageTitle}>{editing.id?'Modifica lavorazione':'Nuova lavorazione'}</Text><Text style={styles.pageSubtitle}>Il catalogo non modifica preventivi esistenti.</Text></View><Pressable onPress={()=>setEditing(null)}><Text style={styles.linkText}>Chiudi</Text></Pressable></View><Field label="Lavorazione" value={title} editable onChangeText={setTitle}/><View style={styles.choiceRow}><Choice label="A misura" active={priceMode==='measured'} onPress={()=>setPriceMode('measured')}/><Choice label="A corpo" active={priceMode==='body'} onPress={()=>{setPriceMode('body');setUnitOpen(false);}}/></View>{priceMode==='measured'&&<><Text style={styles.fieldLabel}>UNITÀ</Text><Select value={selectedUnit?.label??'Seleziona'} onPress={()=>setUnitOpen((value)=>!value)}/>{unitOpen&&<View style={styles.selectorPanel}>{units.map((unit)=><Pressable key={unit.code} style={styles.selectorOption} onPress={()=>{setUnitCode(unit.code);setUnitOpen(false);}}><Text style={styles.quoteTitle}>{unit.label}</Text></Pressable>)}</View>}</>}<CompactField label={priceMode==='measured'?'Prezzo €':'Importo a corpo €'} value={priceText} editable keyboardType="decimal-pad" selectTextOnFocus onChangeText={setPriceText}/><Pressable disabled={saving} style={styles.primaryAction} onPress={save}><Text style={styles.primaryButtonText}>{saving?'Salvataggio…':'Salva lavorazione'}</Text></Pressable>{Boolean(editing.id)&&<Pressable disabled={saving} style={styles.deleteAction} onPress={()=>remove(editing)}><Text style={styles.deleteLink}>Elimina dal catalogo</Text></Pressable>}</View>;
  return <View><View style={styles.archiveHeader}><View><Text style={styles.pageTitle}>Catalogo</Text><Text style={styles.pageSubtitle}>Lavorazioni riutilizzabili salvate sul dispositivo.</Text></View><Pressable style={styles.smallButton} onPress={create}><Text style={styles.smallButtonText}>+ Nuova voce</Text></Pressable></View><Field label="Cerca lavorazione" value={query} editable placeholder="Titolo lavorazione" onChangeText={setQuery}/>{visible.map((item)=><Pressable key={item.id} style={styles.compactItemCard} onPress={()=>edit(item)}><Text style={styles.quoteTitle}>{item.title}</Text><Text style={styles.quoteClient}>{item.priceMode==='measured'?`${formatMoney(item.priceCents)} / ${item.unitLabel}`:`A corpo · ${formatMoney(item.priceCents)}`}</Text></Pressable>)}{!visible.length&&<View style={styles.emptyCard}><Text style={styles.emptyTitle}>{items.length?'Nessun risultato':'Catalogo vuoto'}</Text><Text style={styles.emptyText}>Salva una lavorazione dal preventivo o aggiungila qui.</Text></View>}</View>;
}

function BusinessProfileEditor({onReturnToQuote}:{onReturnToQuote?:()=>void}) {
  const {preference,setPreference}=useTheme();
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

  return <View><View style={styles.archiveHeader}><View><Text style={styles.pageTitle}>Impostazioni</Text><Text style={styles.pageSubtitle}>Profilo attività e valori predefiniti</Text></View>{onReturnToQuote&&<Pressable onPress={onReturnToQuote}><Text style={styles.linkText}>Torna al preventivo</Text></Pressable>}</View><View style={styles.appearanceCard}><View><Icon name="theme-light-dark" size={22}/><View style={styles.appearanceCopy}><Text style={styles.quoteTitle}>Aspetto</Text><Text style={styles.quoteClient}>Scegli come visualizzare Quotivo.</Text></View></View><View style={styles.themeModeList}><Choice label="Chiaro" fullWidth active={preference==='light'} onPress={()=>void setPreference('light')}/><Choice label="Scuro" fullWidth active={preference==='dark'} onPress={()=>void setPreference('dark')}/><Choice label="Sistema" fullWidth active={preference==='system'} onPress={()=>void setPreference('system')}/></View></View>
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

function QuoteEditor({ initialQuote, onClose, onOpenSettings }: { initialQuote: Quote; onClose: () => void; onOpenSettings:(quote:Quote)=>void }) {
  const [quote, setQuote] = useState(initialQuote);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{uri:string;title:string;temporary:boolean}|null>(null);
  const [pdfError, setPdfError] = useState<string|null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [justIssued, setJustIssued] = useState(false);
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
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientPickerQuery, setClientPickerQuery] = useState('');
  const [pickerClients, setPickerClients] = useState<Client[]>([]);
  const numericDrafts = useRef<NumericInputDrafts>({});
  const operationInFlight = useRef(false);
  const editable = quote.status === 'draft';
  const total = useMemo(() => quoteTotalCents(quote), [quote]);
  const catalogModalItems=useMemo(()=>catalogItems.filter((catalog)=>normalizeSearch(catalog.title).includes(normalizeSearch(catalogModalQuery.trim()))),[catalogItems,catalogModalQuery]);
  const patchItem = (id: string, patch: Partial<Quote['items'][number]>) => setQuote((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  useEffect(() => { Promise.all([listMeasurementUnits(),listVatRates(),listClients(),listCatalogItems(),loadBusinessProfile()]).then(([nextUnits,nextRates,nextClients,nextCatalog,profile])=>{setUnits(nextUnits);setVatRates(nextRates);setClients(nextClients);setCatalogItems(nextCatalog);setBusinessProfile(profile);}).catch(showError); }, []);
  useEffect(()=>{if(clientPickerOpen)listClients(clientPickerQuery).then(setPickerClients).catch(showError);},[clientPickerOpen,clientPickerQuery]);
  useEffect(()=>{if(editable&&!quote.items.length){const item={...createEmptyQuoteItem(newId('item'),0),confirmed:false,vatRateBasisPoints:quote.defaultVatBasisPoints};setQuote((current)=>({...current,items:[item]}));setActiveItemId(item.id);}},[]);
  useEffect(()=>{if(!editable)return;const timer=setTimeout(()=>{if(!operationInFlight.current)saveDraft({...quote,clientContactName:clientContact,clientPhone,clientEmail,clientTaxId,clientVatNumber}).catch(()=>undefined);},650);return()=>clearTimeout(timer);},[quote,editable,clientContact,clientPhone,clientEmail,clientTaxId,clientVatNumber]);
  useEffect(()=>{ if(initialQuote.status==='issued') loadDocumentExport(initialQuote.id).then((record)=>setPdfError(record?.status==='failed'?record.errorMessage??'PDF non disponibile.':null)).catch(showError); },[initialQuote.id,initialQuote.status]);
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
  async function openSettings() { try { const current={...materializeNumericInputs(quote,numericDrafts.current),clientContactName:clientContact,clientPhone,clientEmail,clientTaxId,clientVatNumber}; await saveDraft(current); onOpenSettings(current); } catch(error) { showError(error); } }
  async function addCustomUnit(itemId:string) { try { const unit = await createMeasurementUnit(customUnitLabel); setUnits((current) => [...current, unit]); patchItem(itemId, { unitCode:unit.code, unit:unit.label }); setCustomUnitLabel(''); setCustomUnitItem(null); } catch (error) { showError(error); } }
  async function addCustomVat(itemId:string) { try { const basisPoints=parsePercentBasisPoints(customVatText); const rate=await createVatRate(`${customVatText.trim()}%`,basisPoints); setVatRates((current)=>[...current,rate]); patchItem(itemId,{vatTreatment:'rate',vatRateBasisPoints:basisPoints}); setCustomVatText('');setCustomVatItem(null); } catch(error){showError(error);} }
  function copyCatalogItem(itemId:string, catalog:CatalogItem) {
    patchItem(itemId, catalog.priceMode==='measured' ? {description:catalog.title,priceMode:'measured',unitCode:catalog.unitCode,unit:catalog.unitLabel,unitPriceCents:catalog.priceCents} : {description:catalog.title,priceMode:'body',unitCode:null,unit:'',bodyPriceCents:catalog.priceCents});
    setCatalogPickerItem(null); setCatalogPickerQuery(''); setCatalogModalItem(null); setCatalogModalQuery(''); setCatalogSuggestionsItem(null);
  }
  async function saveCurrentItemToCatalog(itemId:string) {
    try {
      const current=materializeNumericInputs(quote,numericDrafts.current); const item=current.items.find((value)=>value.id===itemId);
      if(!item) throw new Error('Lavorazione non trovata.');
      const value={title:item.description,priceMode:item.priceMode,unitCode:item.priceMode==='measured'?item.unitCode:null,unitLabel:item.priceMode==='measured'?item.unit:'',priceCents:item.priceMode==='measured'?item.unitPriceCents:item.bodyPriceCents} as const;
      const existing=await findCatalogItemByTitle(value.title);
      const save=async(id?:string)=>{const saved=await saveCatalogItem({...value,id});setCatalogItems((items)=>[...items.filter((catalog)=>catalog.id!==saved.id),saved].sort((a,b)=>a.title.localeCompare(b.title,'it')));};
      if(existing) Alert.alert('Lavorazione già in catalogo',`Vuoi aggiornare “${existing.title}” con i valori correnti?`,[{text:'Annulla',style:'cancel'},{text:'Aggiorna',onPress:()=>{void save(existing.id).catch(showError);}}]);
      else await save();
    } catch(error) { showError(error); }
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
        const assigned = await finalizeDraft(currentQuote);
        const snapshot=await loadIssuedSnapshot(currentQuote.id) as {issuedAt?:string;issuedLocalDate?:string};
        setQuote({...currentQuote,status:'issued',number:assigned.number,numberYear:assigned.year,issuedAt:snapshot.issuedAt??new Date().toISOString(),issuedLocalDate:snapshot.issuedLocalDate??null});
        setJustIssued(true);
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
    try { setSaving(true); const record=await loadDocumentExport(quote.id); if(record?.status==='ready'&&record.fileUri&&new File(record.fileUri).exists){setPreview({uri:record.fileUri,title:`Preventivo ${formatQuoteNumber(quote.number,quote.numberYear)}`,temporary:false});setPdfError(null);return;} const uri=await generateStoredFinalPdf(quote.id);setPdfError(null);setPreview({uri,title:`Preventivo ${formatQuoteNumber(quote.number,quote.numberYear)}`,temporary:false}); }
    catch(error){const message=error instanceof Error?error.message:'Errore sconosciuto.';setPdfError(message);showError(error);} finally{setSaving(false);operationInFlight.current=false;}
  }
  async function exportAndShare(kind:'pdf'|'docx') {
    if(operationInFlight.current)return; operationInFlight.current=true;
    try { setSaving(true); const uri=kind==='pdf'?await prepareFinalPdfForShare(quote.id):await generateStoredFinalDocx(quote.id); await shareDocument(uri,kind==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',kind==='pdf'?'Condividi PDF':'Condividi documento Word'); }
    catch(error){showError(error);} finally{setSaving(false);operationInFlight.current=false;}
  }
  function confirmFinalization(){Alert.alert('Finalizzare il preventivo?','Verrà assegnato il numero definitivo e i contenuti non saranno più modificabili.',[{text:'Annulla',style:'cancel'},{text:'Finalizza',style:'destructive',onPress:()=>persist(true)}]);}
  function removeDraft() { Alert.alert('Eliminare la bozza?', 'Questa operazione non può essere annullata.', [{ text: 'Annulla', style: 'cancel' }, { text: 'Elimina', style: 'destructive', onPress: async () => { try { await deleteDraft(quote.id); onClose(); } catch (error) { showError(error); } } }]); }

  if(preview)return <PdfPreview uri={preview.uri} title={preview.title} onClose={()=>{if(preview.temporary)removeDraftPdf(preview.uri);setPreview(null);}}/>;
  if(justIssued&&!editable)return <SafeAreaView style={styles.safeArea}><StatusBar style="dark"/><View style={styles.appShell}><View style={styles.editorHeader}><Pressable onPress={()=>void closeEditor()}><Text style={styles.back}>‹ Preventivi</Text></Pressable><Text style={styles.editorStatus}>PREVENTIVO EMESSO</Text></View><View style={styles.issuedSuccess}><Text style={styles.pageTitle}>Preventivo emesso</Text><Text style={styles.issuedNumber}>N. {formatQuoteNumber(quote.number,quote.numberYear)}</Text><Text style={styles.pageSubtitle}>Data {quote.issuedLocalDate??new Date().toLocaleDateString('it-IT')} · {quote.client||'Cliente'}</Text><Pressable disabled={saving} style={styles.issueAction} onPress={()=>void exportAndShare('pdf')}><Text style={styles.issueActionText}>Condividi</Text></Pressable><Pressable disabled={saving} style={styles.previewAction} onPress={()=>setExportOpen((value)=>!value)}><Text style={styles.previewActionText}>Esporta</Text></Pressable>{exportOpen&&<View style={styles.exportChoices}><Pressable disabled={saving} style={styles.exportChoice} onPress={()=>void exportAndShare('pdf')}><Text style={styles.linkText}>PDF</Text></Pressable><Pressable disabled={saving} style={styles.exportChoice} onPress={()=>void exportAndShare('docx')}><Text style={styles.linkText}>Word (.docx)</Text></Pressable></View>}{pdfError&&<Text style={styles.pdfError}>PDF non disponibile: {pdfError}</Text>}<Pressable disabled={saving} style={styles.deleteAction} onPress={()=>void closeEditor()}><Text style={styles.linkText}>Torna ai preventivi</Text></Pressable></View></View></SafeAreaView>;
  return <SafeAreaView style={styles.safeArea}><StatusBar style="dark" /><KeyboardAvoidingView style={styles.appShell} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.editorHeader}><Pressable onPress={()=>void closeEditor()}><Text style={styles.back}>‹ Archivio</Text></Pressable><Text style={styles.editorStatus}>{editable ? 'BOZZA · SENZA NUMERO' : `EMESSO · N. ${formatQuoteNumber(quote.number, quote.numberYear)}`}</Text></View>
    <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled"><Text style={styles.pageTitle}>{editable ? 'Modifica preventivo' : quote.title}</Text>
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
        {editable&&<Pressable style={styles.inlineLink} onPress={()=>{setCatalogModalItem(item.id);setCatalogModalQuery('');}}><Text style={styles.linkText}>Scegli dal catalogo</Text></Pressable>}
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
      {editable ? <><Pressable disabled={saving} style={styles.primaryAction} onPress={() => persist(false)}><Text style={styles.primaryButtonText}>{saving ? 'Salvataggio…' : 'Salva bozza'}</Text></Pressable><Pressable disabled={saving} style={styles.previewAction} onPress={previewDraft}><Text style={styles.previewActionText}>Anteprima documento</Text></Pressable><Pressable disabled={saving} style={styles.issueAction} onPress={confirmFinalization}><Text style={styles.issueActionText}>Finalizza preventivo</Text></Pressable><Pressable disabled={saving} style={styles.deleteAction} onPress={removeDraft}><Text style={styles.deleteLink}>Elimina bozza</Text></Pressable></> : <><Pressable disabled={saving} style={styles.previewAction} onPress={openOrRegenerateFinal}><Text style={styles.previewActionText}>{pdfError?'Rigenera PDF':'Apri PDF definitivo'}</Text></Pressable><Pressable disabled={saving} style={styles.previewAction} onPress={()=>setExportOpen((value)=>!value)}><Text style={styles.previewActionText}>Esporta / Condividi</Text></Pressable>{exportOpen&&<View style={styles.exportChoices}><Pressable disabled={saving} style={styles.exportChoice} onPress={()=>void exportAndShare('pdf')}><Text style={styles.linkText}>PDF</Text></Pressable><Pressable disabled={saving} style={styles.exportChoice} onPress={()=>void exportAndShare('docx')}><Text style={styles.linkText}>Word (.docx)</Text></Pressable></View>}{pdfError&&<Text style={styles.pdfError}>PDF non disponibile: {pdfError}</Text>}</>}
      </>}
    </ScrollView>
    <Modal visible={catalogModalItem!==null} transparent animationType="slide" onRequestClose={()=>setCatalogModalItem(null)}>
      <View style={styles.catalogModalBackdrop}><SafeAreaView style={styles.catalogModalSheet} edges={['bottom']}>
        <View style={styles.catalogModalHeader}><Text style={styles.pageTitle}>Catalogo</Text><Pressable accessibilityRole="button" accessibilityLabel="Chiudi catalogo" hitSlop={8} style={styles.modalClose} onPress={()=>setCatalogModalItem(null)}><Icon name="close" size={22}/></Pressable></View>
        <TextInput autoFocus style={styles.catalogSearchInput} value={catalogModalQuery} placeholder="Cerca nel catalogo" placeholderTextColor={styles.catalogSearchPlaceholder.color} onChangeText={setCatalogModalQuery}/>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.catalogModalList}>{catalogModalItems.map((catalog)=><Pressable key={catalog.id} style={styles.selectorOption} onPress={()=>{if(catalogModalItem)copyCatalogItem(catalogModalItem,catalog);}}><Text style={styles.quoteTitle}>{catalog.title}</Text><Text style={styles.quoteClient}>{catalog.priceMode==='measured'?`${formatMoney(catalog.priceCents)} / ${catalog.unitLabel}`:`A corpo · ${formatMoney(catalog.priceCents)}`}</Text></Pressable>)}{!catalogModalItems.length&&<Text style={styles.emptyCatalogText}>Nessuna lavorazione nel catalogo.</Text>}</ScrollView>
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
function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) { return <View style={styles.statCard}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text><Text style={styles.statDetail}>{detail}</Text></View>; }
function ThemeOnboarding({onChoose}:{onChoose:(preference:'light'|'dark'|'system')=>Promise<void>}) { return <SafeAreaView style={styles.safeArea}><View style={styles.themeOnboarding}><View style={styles.brandMark}><QuotivoMark size={58}/></View><Text style={styles.pageTitle}>Scegli il tuo tema</Text><Text style={styles.pageSubtitle}>Potrai cambiarlo in qualsiasi momento dalle Impostazioni.</Text><View style={styles.themeChoices}><Pressable style={styles.primaryAction} onPress={()=>void onChoose('light')}><Text style={styles.primaryButtonText}>Chiaro</Text></Pressable><Pressable style={styles.previewAction} onPress={()=>void onChoose('dark')}><Text style={styles.previewActionText}>Scuro</Text></Pressable><Pressable style={styles.previewAction} onPress={()=>void onChoose('system')}><Text style={styles.previewActionText}>Sistema</Text></Pressable></View></View></SafeAreaView>; }
function EmptyState() { return <BaseEmptyState title="Ancora nessun preventivo" body="Crea una bozza: verrà salvata nell'archivio locale." />; }
function QuoteRow({ quote, onPress, onDeleteDraft }: { quote: Quote; onPress: () => void; onDeleteDraft?: () => void }) { return <View style={styles.quoteRow}><Pressable style={styles.quoteRowAction} onPress={onPress}><View style={styles.quoteNumber}><Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={.72} style={styles.quoteNumberText}>{formatQuoteNumber(quote.number, quote.numberYear)}</Text></View><View style={styles.quoteMain}><Text numberOfLines={2} style={styles.quoteTitle}>{quote.title || 'Preventivo senza titolo'}</Text><Text numberOfLines={1} ellipsizeMode="tail" style={styles.quoteClient}>{quote.client || 'Cliente da inserire'}</Text></View><View style={styles.quoteRight}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.75} style={styles.quoteTotal}>{formatMoney(quoteTotalCents(quote))}</Text><View style={[styles.statusPill, quote.status === 'issued' ? styles.issuedPill : styles.draftPill]}><Text numberOfLines={1} style={styles.statusText}>{quote.status === 'issued' ? 'Emesso' : 'Bozza'}</Text></View></View></Pressable>{onDeleteDraft&&<Pressable accessibilityRole="button" accessibilityLabel="Azioni bozza" hitSlop={8} style={styles.quoteMenu} onPress={onDeleteDraft}><Text style={styles.quoteMenuText}>⋯</Text></Pressable>}</View>; }
function TabButton({ label, icon, active, onPress }: { label: string; icon: IconName; active: boolean; onPress: () => void }) { const {theme}=useTheme(); const color=active?theme.greenStrong:theme.muted; return <Pressable style={styles.tabButton} onPress={onPress}><Icon name={icon} size={20} color={color}/><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></Pressable>; }
function showError(error: unknown) { Alert.alert('Operazione non riuscita', error instanceof Error ? error.message : 'Si è verificato un errore.'); }

let styles: ReturnType<typeof createStyles>;
function createStyles(t:Theme) { return StyleSheet.create({
  safeArea:{flex:1,backgroundColor:t.background},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:t.background},appShell:{flex:1},content:{paddingHorizontal:18,paddingTop:18,paddingBottom:110},topBar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:24},eyebrow:{color:t.greenStrong,fontSize:11,letterSpacing:1.6,fontWeight:'800'},greeting:{color:t.text,fontSize:24,fontWeight:'800',marginTop:6},avatar:{height:42,width:42,borderRadius:16,backgroundColor:t.greenSoft,alignItems:'center',justifyContent:'center'},avatarText:{color:t.greenStrong,fontWeight:'800'},
  heroCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:28,padding:22,minHeight:235,marginBottom:28,shadowColor:t.shadow,shadowOpacity:.08,shadowRadius:24,shadowOffset:{width:0,height:8},elevation:3},heroKicker:{color:t.greenStrong,fontSize:10,fontWeight:'800',letterSpacing:1.1,marginBottom:14},heroTitle:{color:t.text,fontSize:30,lineHeight:33,fontWeight:'800',maxWidth:290},heroDescription:{color:t.muted,fontSize:13,lineHeight:19,marginTop:12,maxWidth:275},primaryButton:{backgroundColor:t.green,borderRadius:16,paddingVertical:13,paddingHorizontal:16,alignSelf:'flex-start',marginTop:18},primaryButtonText:{color:t.onGreen,fontSize:13,fontWeight:'800'},
  sectionHeading:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:12,marginTop:20},sectionTitle:{color:t.text,fontSize:20,fontWeight:'800',marginBottom:12,flexShrink:1},linkText:{color:t.violet,fontWeight:'800',fontSize:12},statsRow:{flexDirection:'row',flexWrap:'wrap',gap:12,marginBottom:20},statCard:{backgroundColor:t.surface,borderRadius:22,padding:16,flex:1,minWidth:130,borderWidth:1,borderColor:t.border},statLabel:{color:t.muted,fontSize:12,fontWeight:'700'},statValue:{color:t.text,fontSize:20,fontWeight:'800',marginTop:10},statDetail:{color:t.muted,fontSize:11,marginTop:4},
  quoteRow:{backgroundColor:t.surface,borderRadius:18,padding:14,marginBottom:10,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:t.border,minWidth:0},quoteRowAction:{flex:1,flexDirection:'row',alignItems:'center',minWidth:0},quoteNumber:{minWidth:46,maxWidth:62,minHeight:42,paddingHorizontal:5,borderRadius:14,backgroundColor:t.greenSoft,alignItems:'center',justifyContent:'center',marginRight:10},quoteNumberText:{color:t.greenStrong,fontSize:11,fontWeight:'900',textAlign:'center'},quoteMain:{flex:1,minWidth:0,flexShrink:1},quoteTitle:{color:t.text,fontWeight:'800',fontSize:13,flexShrink:1},quoteClient:{color:t.muted,fontSize:11,marginTop:5,flexShrink:1},quoteRight:{alignItems:'flex-end',marginLeft:7,maxWidth:88,flexShrink:1},quoteTotal:{color:t.text,fontWeight:'800',fontSize:12,marginBottom:6,flexShrink:1},statusPill:{borderRadius:20,paddingHorizontal:8,paddingVertical:4,maxWidth:'100%'},draftPill:{backgroundColor:t.violetSoft},issuedPill:{backgroundColor:t.greenSoft},statusText:{color:t.muted,fontSize:9,fontWeight:'800'},quoteMenu:{marginLeft:6,paddingHorizontal:5,paddingVertical:8},quoteMenuText:{color:t.muted,fontSize:22,fontWeight:'900',lineHeight:22},
  archiveHeader:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'flex-end',gap:12,marginBottom:22},pageTitle:{color:t.text,fontSize:30,fontWeight:'800',flexShrink:1},pageSubtitle:{color:t.muted,fontSize:13,marginTop:5,flexShrink:1},smallButton:{backgroundColor:t.green,borderRadius:12,paddingVertical:11,paddingHorizontal:13,flexShrink:0},smallButtonText:{color:t.onGreen,fontWeight:'800',fontSize:12},tabBar:{position:'absolute',bottom:0,left:0,right:0,backgroundColor:t.surface,borderTopWidth:1,borderTopColor:t.border,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingHorizontal:4,paddingTop:4},tabButton:{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',minHeight:48,paddingHorizontal:1},tabSymbol:{color:t.muted,fontSize:20},tabLabel:{color:t.muted,fontSize:8,fontWeight:'700',marginTop:3,maxWidth:'100%'},tabActive:{color:t.greenStrong},floatingAdd:{width:52,height:52,borderRadius:18,backgroundColor:t.green,alignItems:'center',justifyContent:'center',marginTop:-24,elevation:5},floatingAddText:{color:t.onGreen,fontSize:30,fontWeight:'300'},
  editorHeader:{paddingHorizontal:20,height:58,borderBottomWidth:1,borderBottomColor:t.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},back:{color:t.violet,fontSize:14,fontWeight:'700',flexShrink:1},editorStatus:{color:t.muted,fontSize:10,letterSpacing:.8,fontWeight:'800',flexShrink:1,textAlign:'right'},editorContent:{padding:20,paddingBottom:60},lockNotice:{backgroundColor:t.greenSoft,padding:13,borderRadius:16,marginTop:14},lockText:{color:t.greenStrong,fontSize:12,fontWeight:'700'},field:{marginTop:18},fieldLabel:{color:t.text,fontSize:11,fontWeight:'800',marginBottom:7,textTransform:'uppercase'},input:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:16,paddingHorizontal:13,paddingVertical:12,color:t.text,fontSize:14},inputLocked:{backgroundColor:t.surface2,color:t.muted},
  itemCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:18,padding:14,marginBottom:12,minWidth:0},itemHeading:{flexDirection:'row',justifyContent:'space-between',gap:10,marginBottom:9},itemIndex:{color:t.muted,fontSize:10,fontWeight:'900',letterSpacing:.8,flexShrink:1},deleteLink:{color:t.danger,fontSize:11,fontWeight:'800'},itemFields:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},compactField:{flex:1,minWidth:120},compactInput:{backgroundColor:t.surface2,borderWidth:1,borderColor:t.border,borderRadius:12,paddingHorizontal:9,paddingVertical:10,color:t.text,fontSize:13},lineTotal:{textAlign:'right',color:t.greenStrong,fontWeight:'900',marginTop:12},totalCard:{backgroundColor:t.surface2,borderWidth:1,borderColor:t.border,borderRadius:22,padding:18,flexDirection:'row',flexWrap:'wrap',gap:12,alignItems:'center',justifyContent:'space-between',marginTop:10,marginBottom:18},totalLabel:{color:t.muted,fontSize:11,fontWeight:'900',letterSpacing:1},totalValue:{color:t.greenStrong,fontSize:22,fontWeight:'900',flexShrink:1},primaryAction:{backgroundColor:t.green,borderRadius:16,padding:15,alignItems:'center',marginBottom:10},previewAction:{backgroundColor:t.violetSoft,borderWidth:1,borderColor:t.violet,borderRadius:16,padding:15,alignItems:'center',marginBottom:10},previewActionText:{color:t.violet,fontSize:13,fontWeight:'800'},issueAction:{backgroundColor:t.violet,borderRadius:16,padding:15,alignItems:'center'},issueActionText:{color:t.onViolet,fontSize:13,fontWeight:'800'},issuedSuccess:{flex:1,padding:20,paddingTop:40},issuedNumber:{color:t.greenStrong,fontSize:24,fontWeight:'900',marginTop:16,marginBottom:4},pdfError:{color:t.danger,fontSize:12,lineHeight:18,marginTop:10},deleteAction:{padding:18,alignItems:'center'},emptyCard:{padding:24,alignItems:'center'},emptyTitle:{color:t.text,fontWeight:'800',marginBottom:6},emptyText:{color:t.muted,textAlign:'center',fontSize:12,lineHeight:18},
  formSection:{color:t.muted,fontSize:10,fontWeight:'900',letterSpacing:1,marginTop:24},twoColumns:{flexDirection:'row',gap:8},column:{flex:1,minWidth:0},shortColumn:{width:64,flexShrink:0},logoCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:18,padding:12,marginTop:18,flexDirection:'row',alignItems:'center',minWidth:0},logoPreview:{width:70,height:58,flexShrink:0},logoPlaceholder:{width:70,height:58,flexShrink:0,borderRadius:12,backgroundColor:t.greenSoft,alignItems:'center',justifyContent:'center'},logoPlaceholderText:{color:t.greenStrong,fontWeight:'900',fontSize:11},logoInfo:{flex:1,minWidth:0,marginLeft:12},logoActions:{flexDirection:'row',flexWrap:'wrap',gap:16,marginTop:10},detailsToggle:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:16,padding:15,marginVertical:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},detailsToggleText:{color:t.text,fontWeight:'800',fontSize:13,flexShrink:1},chevron:{color:t.muted,fontSize:18},appearanceCard:{backgroundColor:t.violetSoft,borderWidth:1,borderColor:t.border,borderRadius:18,padding:14,flexDirection:'row',gap:12,alignItems:'center',minWidth:0},appearanceCopy:{flex:1,minWidth:0},themeModeList:{gap:8,marginTop:10},
  choiceRow:{flexDirection:'row',flexWrap:'wrap',gap:7,marginVertical:10},choice:{borderWidth:1,borderColor:t.border,borderRadius:18,paddingHorizontal:12,paddingVertical:8,backgroundColor:t.surface2},choiceActive:{backgroundColor:t.green,borderColor:t.green},choiceText:{fontSize:11,fontWeight:'700',color:t.muted},choiceTextActive:{color:t.onGreen},inlineAdd:{flexDirection:'row',gap:8,alignItems:'center',marginBottom:10},
  stepper:{flexDirection:'row',gap:6,marginTop:18,marginBottom:4},stepChip:{flex:1,borderWidth:1,borderColor:t.border,borderRadius:12,paddingVertical:9,paddingHorizontal:5,alignItems:'center'},stepChipActive:{backgroundColor:t.green,borderColor:t.green},stepChipText:{fontSize:9,fontWeight:'800',color:t.muted},stepChipTextActive:{color:t.onGreen},clientSuggestion:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,padding:12,borderRadius:12,marginTop:6},inlineLink:{alignSelf:'flex-start',paddingVertical:9},activityMissing:{backgroundColor:t.violetSoft,borderWidth:1,borderColor:t.border,borderRadius:16,padding:14,marginTop:10},saveClientToggle:{paddingVertical:12,marginTop:8},secondaryContinue:{backgroundColor:t.violetSoft,borderWidth:1,borderColor:t.violet,borderRadius:16,padding:14,alignItems:'center',marginTop:18},compactItemCard:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:18,padding:14,marginBottom:10},compactItemRow:{flexDirection:'row',justifyContent:'space-between',gap:8,alignItems:'center',marginTop:8},confirmItemAction:{backgroundColor:t.green,borderRadius:12,padding:13,alignItems:'center',marginTop:14},addItemAction:{borderWidth:1,borderColor:t.green,borderStyle:'dashed',borderRadius:16,padding:15,alignItems:'center',marginBottom:14},
compactSelector:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:12,paddingHorizontal:12,paddingVertical:11,flexDirection:'row',justifyContent:'space-between',alignItems:'center',minWidth:0},compactSelectorText:{color:t.text,fontWeight:'800',fontSize:13,flexShrink:1},selectorChevron:{color:t.muted,fontSize:16},selectorPanel:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:12,marginTop:6,overflow:'hidden'},selectorOption:{paddingHorizontal:13,paddingVertical:11,borderBottomWidth:1,borderBottomColor:t.border,minWidth:0},catalogActionRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},catalogAction:{flexGrow:1,flexBasis:130,minWidth:0,borderWidth:1,borderColor:t.border,borderRadius:12,paddingVertical:10,paddingHorizontal:8,alignItems:'center'},catalogSearchInput:{paddingHorizontal:13,paddingVertical:11,color:t.text,fontSize:13,borderBottomWidth:1,borderBottomColor:t.border},catalogSearchPlaceholder:{color:t.muted},emptyCatalogText:{color:t.muted,fontSize:12,padding:13},catalogSuggestion:{backgroundColor:t.surface,borderWidth:1,borderColor:t.border,borderRadius:12,paddingHorizontal:12,paddingVertical:9,marginTop:5,minWidth:0},catalogModalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.42)',justifyContent:'flex-end'},catalogModalSheet:{maxHeight:'78%',backgroundColor:t.surface,borderTopLeftRadius:24,borderTopRightRadius:24,paddingTop:14,overflow:'hidden'},catalogModalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,paddingHorizontal:18,paddingBottom:10},modalClose:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:t.surface2,flexShrink:0},catalogModalList:{paddingHorizontal:10,paddingBottom:18},exportChoices:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:10},exportChoice:{flexGrow:1,flexBasis:130,minWidth:0,borderWidth:1,borderColor:t.border,borderRadius:12,paddingVertical:11,alignItems:'center'},themeOnboarding:{flex:1,justifyContent:'center',padding:24},brandMark:{width:58,height:58,alignItems:'center',justifyContent:'center',marginBottom:20},themeChoices:{marginTop:28},
}); }
