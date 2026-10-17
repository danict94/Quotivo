import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';
import { newId, Quote, QuoteItem, QUANTITY_SCALE } from './domain';
import { runMigrations } from './migrations';
import { assertDraftDeletable } from './features/quotes/draftDeletionIntegrity';
import { finalizeQuoteData, QuoteTransaction, replaceDraftData } from './quoteTransactions';
import { BusinessProfile, getBusinessProfile, profileSnapshot, saveBusinessProfile } from './businessProfile';
import { addCalendarDays, captureEmissionClock } from './emissionClock';
import { accountDatabaseName, createAccountDatabaseScope, legacyDatabaseName } from './data/local/accountDatabaseScope';
import { LegacyDataClaimAvailability, resolveLegacyDataClaimAvailability } from './features/local-data/legacyClaimPolicy';
import { readLegacyDataSnapshot, transferLegacyData, verifyLegacyDataTransfer, verifyLegacyTargetIntegrity } from './features/local-data/legacyClaimTransfer';
import { CreateRevisionUseCase } from './features/revisions/CreateRevisionUseCase';
import { deriveRecentWorkItems, RecentWorkItem } from './features/recent-work-items/recentWorkItems';
import { repairSingleLegacyIssuedDraft } from './features/local-data/repairLegacyIssuedDraft';
import { reconcileVerifiedLegacyIssuedQuote } from './features/quote-issuance/reconcileIssuedQuoteBootstrap';

const localDatabaseScope = createAccountDatabaseScope((databaseName) => SQLite.openDatabaseAsync(databaseName));
function getActiveDatabase() { return localDatabaseScope.current(); }
let activeAccountOwnerId: string | null = null;
type LegacyRepairDiagnostic = { ownerUserId:string; databaseName:string; schemaVersion:number|null; invoked:boolean; committed:boolean; rolledBack:boolean; finalStatus:string|null; result:unknown };
let latestLegacyRepairDiagnostic: LegacyRepairDiagnostic | null = null;
export function getLegacyRepairDiagnostic() { return latestLegacyRepairDiagnostic; }

async function activateAccountDatabase(ownerUserId: string) {
  if (activeAccountOwnerId && activeAccountOwnerId !== ownerUserId) await closeAccountDatabase();
  const db = await localDatabaseScope.activate(ownerUserId);
  activeAccountOwnerId = ownerUserId;
  return db;
}
const localMetadataDatabaseName = 'quotivo-local-account-metadata-v1.db';

export type { LegacyDataClaimAvailability } from './features/local-data/legacyClaimPolicy';

type LocalDataSummary = {
  businessProfile: number;
  clients: number;
  catalogItems: number;
  quotes: number;
  issuedSnapshots: number;
  documentExports: number;
  shareCache: number;
  numbering: number;
};

function databaseFileUri(databaseName: string) {
  const directory = String(SQLite.defaultDatabaseDirectory).replace(/\\/g, '/').replace(/\/$/, '');
  return directory.startsWith('file:') ? `${directory}/${databaseName}` : `file://${directory}/${databaseName}`;
}

async function tableExists(db: SQLite.SQLiteDatabase, tableName: string) {
  return Boolean(await db.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", tableName));
}

async function tableCount(db: SQLite.SQLiteDatabase, tableName: string, where = '') {
  if (!(await tableExists(db, tableName))) return 0;
  const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${tableName}${where}`);
  return row?.count ?? 0;
}

async function summarizeAccountData(db: SQLite.SQLiteDatabase): Promise<LocalDataSummary> {
  const businessProfile = await tableCount(db, 'business_profiles', " WHERE trim(business_name) <> '' OR trim(tax_id) <> '' OR trim(vat_number) <> '' OR trim(address) <> '' OR trim(email) <> '' OR trim(phone) <> '' OR logo_uri IS NOT NULL");
  const numbering = await tableCount(db, 'number_sequences', " WHERE name = 'quotes' AND next_number > 1");
  return {
    businessProfile,
    clients: await tableCount(db, 'clients'),
    catalogItems: await tableCount(db, 'catalog_items'),
    quotes: await tableCount(db, 'quotes'),
    issuedSnapshots: await tableCount(db, 'issued_quote_snapshots'),
    documentExports: await tableCount(db, 'document_exports'),
    shareCache: await tableCount(db, 'quote_share_links'),
    numbering,
  };
}

function hasAccountData(summary: LocalDataSummary) {
  return Object.values(summary).some((count) => count > 0);
}

async function metadataDatabase() {
  const db = await SQLite.openDatabaseAsync(localMetadataDatabaseName);
  await db.execAsync("CREATE TABLE IF NOT EXISTS legacy_data_claim (id INTEGER PRIMARY KEY CHECK (id = 1), owner_user_id TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('claiming', 'claimed')), claimed_at TEXT NOT NULL)");
  return db;
}

async function existingLegacyClaim() {
  const db = await metadataDatabase();
  return db.getFirstAsync<{ owner_user_id: string; status: 'claiming' | 'claimed' }>('SELECT owner_user_id, status FROM legacy_data_claim WHERE id = 1');
}

async function openLegacyDatabase() {
  if (!new File(databaseFileUri(legacyDatabaseName)).exists) return null;
  const legacy = await SQLite.openDatabaseAsync(legacyDatabaseName);
  await legacy.execAsync('PRAGMA foreign_keys = ON;');
  await runMigrations(legacy);
  return legacy;
}

export async function getLegacyDataClaimAvailability(ownerUserId: string): Promise<LegacyDataClaimAvailability> {
  const existingClaim = await existingLegacyClaim();
  const target = await activateAccountDatabase(ownerUserId);
  const legacy = await openLegacyDatabase();
  if (!legacy) return resolveLegacyDataClaimAvailability({ ownerUserId, existingClaim: existingClaim ? { ownerUserId: existingClaim.owner_user_id, status: existingClaim.status } : null, legacyHasData: false, accountHasData: hasAccountData(await summarizeAccountData(target)) });
  try {
    const legacyHasData = hasAccountData(await summarizeAccountData(legacy));
    const accountHasData = hasAccountData(await summarizeAccountData(target));
    const existing = existingClaim ? { ownerUserId: existingClaim.owner_user_id, status: existingClaim.status } : null;
    return resolveLegacyDataClaimAvailability({ ownerUserId, existingClaim: existing, legacyHasData, accountHasData });
  } finally {
    await legacy.closeAsync();
  }
}

export async function claimLegacyData(ownerUserId: string) {
  const existingClaim = await existingLegacyClaim();
  if (existingClaim && existingClaim.owner_user_id !== ownerUserId) throw new Error('I dati locali sono già associati a un altro account su questo dispositivo.');
  if (await getLegacyDataClaimAvailability(ownerUserId) !== 'available') throw new Error('I dati locali non sono disponibili per questa importazione.');

  const metadata = await metadataDatabase();
  const now = new Date().toISOString();
  await metadata.runAsync("INSERT INTO legacy_data_claim (id, owner_user_id, status, claimed_at) VALUES (1, ?, 'claiming', ?) ON CONFLICT(id) DO UPDATE SET owner_user_id = excluded.owner_user_id, status = excluded.status, claimed_at = excluded.claimed_at", ownerUserId, now);

  const target = await activateAccountDatabase(ownerUserId);
  const legacy = await openLegacyDatabase();
  if (!legacy) throw new Error('I dati locali da associare non sono più disponibili.');
  try {
    const snapshot = await readLegacyDataSnapshot(legacy);
    // A prior interrupted attempt may already have copied a prefix of this source.
    // Retrying must never overwrite account data; a successful merge marks the source managed.
    const mode = existingClaim ? 'merge' : 'replace';
    await transferLegacyData(target, snapshot, mode);
    const verified = mode === 'replace'
      ? await verifyLegacyDataTransfer(target, snapshot, true)
      : await verifyLegacyTargetIntegrity(target);
    if (!verified) {
      throw new Error('Verifica dei dati importati non riuscita.');
    }
    await metadata.runAsync("UPDATE legacy_data_claim SET status = 'claimed', claimed_at = ? WHERE id = 1 AND owner_user_id = ?", new Date().toISOString(), ownerUserId);
  } finally {
    await legacy.closeAsync();
  }
}

type QuoteRow = Omit<Quote, 'items' | 'status' | 'createdAt' | 'updatedAt' | 'issuedAt' | 'numberYear' | 'issuedLocalDate' | 'issuedOffsetMinutes' | 'validUntil'> & {
  status: 'draft' | 'issued'; created_at: string; updated_at: string; issued_at: string | null;
  number_year: number | null; issued_local_date: string | null; issued_offset_minutes: number | null; valid_until: string | null;
  introduction: string; global_discount_basis_points: number;
  client_address:string; client_contact_name:string; client_phone:string; client_email:string; client_tax_id:string; client_vat_number:string; site_address:string; client_id:string|null; default_vat_basis_points:number;
  revision_root_quote_id:string|null; parent_quote_id:string|null; revision_number:number;
};
type ItemRow = { id:string; quote_id:string; description:string; quantity:number; unit:string; unit_price_cents:number; position:number;
  short_description:string; price_mode:'measured'|'body'; quantity_scaled:number|null; unit_code:string|null; body_price_cents:number;
  vat_treatment:'rate'|'not_applied'; vat_rate_basis_points:number|null; vat_note:string; line_discount_basis_points:number; technical_details:string;
  inclusions:string; exclusions:string; is_optional:number; confirmed:number };

export type MeasurementUnit = { code: string; label: string; isCustom: boolean };
export type VatRate = { code: string; label: string; rateBasisPoints: number; isCustom: boolean };
export type Client = { id:string; name:string; contactName:string; phone:string; email:string; address:string; taxId:string; vatNumber:string; createdAt:string; updatedAt:string };
export type CatalogItem = { id:string; title:string; priceMode:'measured'|'body'; unitCode:string|null; unitLabel:string; priceCents:number; createdAt:string; updatedAt:string };
const legacyUnitCodes: Record<string, string> = { 'm²':'sqm', 'ml':'linear_m', 'm³':'cubic_m', 'pz':'piece', 'punti':'point', 'h':'hour', 'gg':'day' };

export async function initializeDatabase(ownerUserId: string) {
  const db = await activateAccountDatabase(ownerUserId);
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  await runMigrations(db);
  const reconciliation=await reconcileVerifiedLegacyIssuedQuote(db,ownerUserId);
  console.info('QUOTIVO_RECONCILIATION_DIAGNOSTIC',reconciliation);
  const schemaVersion=(await db.getFirstAsync<{user_version:number}>('PRAGMA user_version'))?.user_version ?? null;
  let result:unknown=null; let committed=false; let rolledBack=false; let finalStatus:string|null=null;
  try {
    await db.withExclusiveTransactionAsync(async (txn) => { result=await repairSingleLegacyIssuedDraft(txn as unknown as Parameters<typeof repairSingleLegacyIssuedDraft>[0]); });
    committed=true;
    const candidateId=(result as {candidate?:{quoteId?:string}|null})?.candidate?.quoteId;
    if(candidateId) finalStatus=(await db.getFirstAsync<{status:string}>('SELECT status FROM quotes WHERE id=?',candidateId))?.status ?? null;
  } catch(error) { rolledBack=true; result={error:error instanceof Error?error.message:String(error)}; throw error; }
  finally {
    latestLegacyRepairDiagnostic={ownerUserId,databaseName:accountDatabaseName(ownerUserId),schemaVersion,invoked:true,committed,rolledBack,finalStatus,result};
    console.info('QUOTIVO_LEGACY_REPAIR_DIAGNOSTIC',latestLegacyRepairDiagnostic);
  }
}

export async function closeAccountDatabase() {
  activeAccountOwnerId = null;
  const db = localDatabaseScope.deactivate();
  if (db) await (await db).closeAsync();
}

function hydrate(row: QuoteRow, items: ItemRow[]): Quote {
  return {
    id: row.id, number: row.number, numberYear: row.number_year, clientId:row.client_id, client: row.client, clientContactName:row.client_contact_name, clientPhone:row.client_phone, clientEmail:row.client_email, clientAddress:row.client_address, clientTaxId:row.client_tax_id, clientVatNumber:row.client_vat_number, siteAddress:row.site_address, title: row.title, revisionRootQuoteId:row.revision_root_quote_id, parentQuoteId:row.parent_quote_id, revisionNumber:row.revision_number, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at, issuedAt: row.issued_at,
    issuedLocalDate: row.issued_local_date, issuedOffsetMinutes: row.issued_offset_minutes, validUntil: row.valid_until,
    introduction: row.introduction, defaultVatBasisPoints:row.default_vat_basis_points, globalDiscountBasisPoints: row.global_discount_basis_points,
    items: items.filter((item) => item.quote_id === row.id).map((item) => ({
      id: item.id, confirmed:Boolean(item.confirmed), description: item.description, shortDescription:item.short_description,
      priceMode:item.price_mode, quantity:item.quantity, quantityScaled:item.quantity_scaled ?? Math.round(item.quantity * QUANTITY_SCALE),
      unit:item.unit, unitCode:item.unit_code ?? legacyUnitCodes[item.unit] ?? null, unitPriceCents:item.unit_price_cents, bodyPriceCents:item.body_price_cents,
      vatTreatment:item.vat_treatment, vatRateBasisPoints:item.vat_rate_basis_points, vatNote:item.vat_note, lineDiscountBasisPoints:item.line_discount_basis_points,
      technicalDetails:item.technical_details, inclusions:item.inclusions, exclusions:item.exclusions,
      isOptional:Boolean(item.is_optional), position:item.position,
    })),
  };
}

export async function listQuotes() {
  const db = await getActiveDatabase();
  const quotes = await db.getAllAsync<QuoteRow>('SELECT * FROM quotes ORDER BY COALESCE(issued_at, updated_at) DESC');
  const items = await db.getAllAsync<ItemRow>('SELECT * FROM quote_items ORDER BY position');
  return quotes.map((quote) => hydrate(quote, items));
}

/** Voci derivate dai preventivi emessi: non è una seconda tabella né un catalogo implicito. */
export async function listRecentWorkItems(): Promise<RecentWorkItem[]> {
  return deriveRecentWorkItems(await listQuotes());
}

export async function createDraft() {
  const db = await getActiveDatabase();
  const now = new Date().toISOString();
  const id = newId('quote');
  await db.runAsync('INSERT INTO quotes (id, client, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', id, '', '', now, now);
  return id;
}

export async function saveDraft(quote: Quote) {
  if (quote.status !== 'draft') throw new Error('Un preventivo emesso non può essere modificato.');
  const db = await getActiveDatabase();
  await db.withExclusiveTransactionAsync((txn) => replaceDraftData(txn as unknown as QuoteTransaction, quote, new Date().toISOString()));
}

export async function finalizeDraft(quote: Quote, canonical?:{number:number;year:number;revision?:{rootQuoteId:string;parentQuoteId:string;revisionNumber:number}}) {
  const db = await getActiveDatabase();
  const business = await profileSnapshot(db);
  if(!business.businessName.trim()) throw new Error('Completa la denominazione dell’attività prima di finalizzare.');
  const clock = captureEmissionClock();
  const validUntil = addCalendarDays(clock.localDate, business.defaultValidityDays);
  let assignedNumber: number | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    assignedNumber = await finalizeQuoteData(txn as unknown as QuoteTransaction, quote, { clock, validUntil, businessProfile: business, canonicalNumber:canonical?.number, canonicalYear:canonical?.year, revision:canonical?.revision });
  });
  if (assignedNumber === null) throw new Error('Emissione non completata.');
  return { quoteId:quote.id, number: assignedNumber, year: canonical?.year??clock.year };
}

export async function loadDraftBusinessSnapshot() { return profileSnapshot(await getActiveDatabase()); }
export async function loadIssuedSnapshot(quoteId:string) {
  const db=await getActiveDatabase(); const row=await db.getFirstAsync<{snapshot_json:string}>("SELECT snapshot_json FROM issued_quote_snapshots WHERE quote_id = ?",quoteId);
  if(!row) throw new Error('Snapshot del preventivo emesso non disponibile.');
  try { return JSON.parse(row.snapshot_json) as unknown; } catch { throw new Error('Snapshot del preventivo emesso danneggiato.'); }
}
/** @public Entry repository locale per il futuro comando UI di revisione, deliberatamente non collegato in questo scope. */
export async function createRevisionDraftFromIssuedQuote(quoteId: string) {
  const db = await getActiveDatabase();
  const useCase = new CreateRevisionUseCase({
    async loadIssuedQuote(id) {
      const row = await db.getFirstAsync<Pick<QuoteRow, 'id' | 'status' | 'revision_root_quote_id' | 'revision_number'>>('SELECT id, status, revision_root_quote_id, revision_number FROM quotes WHERE id = ?', id);
      return row ? { id: row.id, status: row.status, revisionRootQuoteId: row.revision_root_quote_id, revisionNumber: row.revision_number } : null;
    },
    loadIssuedSnapshot,
    async nextRevisionNumber(rootQuoteId) {
      const row = await db.getFirstAsync<{ revision_number: number | null }>('SELECT MAX(revision_number) AS revision_number FROM quotes WHERE revision_root_quote_id = ?', rootQuoteId);
      return (row?.revision_number ?? 0) + 1;
    },
    async saveRevisionDraft(draft) {
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.runAsync(
          'INSERT INTO quotes (id, client, title, created_at, updated_at, revision_root_quote_id, parent_quote_id, revision_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          draft.id, draft.client, draft.title, draft.createdAt, draft.updatedAt, draft.revisionRootQuoteId, draft.parentQuoteId, draft.revisionNumber,
        );
        await replaceDraftData(txn as unknown as QuoteTransaction, draft, draft.updatedAt);
      });
    },
  }, { quoteId: () => newId('quote'), itemId: () => newId('item') });
  return useCase.execute(quoteId);
}
export async function canCreateRevisionFromIssuedQuote(quoteId:string) {
  const db=await getActiveDatabase();
  const source=await db.getFirstAsync<{status:string;revision_root_quote_id:string|null;revision_number:number}>('SELECT status, revision_root_quote_id, revision_number FROM quotes WHERE id=?',quoteId);
  if(!source||source.status!=='issued') return false;
  const rootId=source.revision_number===0?quoteId:source.revision_root_quote_id;
  if(!rootId) return false;
  const row=await db.getFirstAsync<{revision_number:number|null}>('SELECT MAX(revision_number) AS revision_number FROM quotes WHERE revision_root_quote_id=?',rootId);
  return (row?.revision_number??0)===source.revision_number;
}
export type QuoteShareLinkCache={quoteId:string;issuanceId:string|null;shareId:string|null;lifecycle:string|null;commercialOutcome:string|null;commercialOutcomeSource?:string|null;commercialOutcomeDecidedAt?:string|null;openedAt:string|null;shareSyncedAt:string|null};
export async function saveQuoteShareLinkCache(value:QuoteShareLinkCache){const db=await getActiveDatabase();await db.runAsync('INSERT INTO quote_share_links(quote_id,issuance_id,share_id,share_lifecycle_cache,commercial_outcome_cache,commercial_outcome_source_cache,commercial_outcome_decided_at_cache,opened_at_cache,share_synced_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(quote_id) DO UPDATE SET issuance_id=excluded.issuance_id,share_id=excluded.share_id,share_lifecycle_cache=excluded.share_lifecycle_cache,commercial_outcome_cache=excluded.commercial_outcome_cache,commercial_outcome_source_cache=coalesce(excluded.commercial_outcome_source_cache,quote_share_links.commercial_outcome_source_cache),commercial_outcome_decided_at_cache=coalesce(excluded.commercial_outcome_decided_at_cache,quote_share_links.commercial_outcome_decided_at_cache),opened_at_cache=excluded.opened_at_cache,share_synced_at=excluded.share_synced_at',value.quoteId,value.issuanceId,value.shareId,value.lifecycle,value.commercialOutcome,value.commercialOutcomeSource??null,value.commercialOutcomeDecidedAt??null,value.openedAt,value.shareSyncedAt);}
export async function loadQuoteShareLinkCache(quoteId:string):Promise<QuoteShareLinkCache|null>{const db=await getActiveDatabase();const row=await db.getFirstAsync<{quote_id:string;issuance_id:string|null;share_id:string|null;share_lifecycle_cache:string|null;commercial_outcome_cache:string|null;commercial_outcome_source_cache:string|null;commercial_outcome_decided_at_cache:string|null;opened_at_cache:string|null;share_synced_at:string|null}>('SELECT quote_id,issuance_id,share_id,share_lifecycle_cache,commercial_outcome_cache,commercial_outcome_source_cache,commercial_outcome_decided_at_cache,opened_at_cache,share_synced_at FROM quote_share_links WHERE quote_id=?',quoteId);return row?{quoteId:row.quote_id,issuanceId:row.issuance_id,shareId:row.share_id,lifecycle:row.share_lifecycle_cache,commercialOutcome:row.commercial_outcome_cache,commercialOutcomeSource:row.commercial_outcome_source_cache,commercialOutcomeDecidedAt:row.commercial_outcome_decided_at_cache,openedAt:row.opened_at_cache,shareSyncedAt:row.share_synced_at}:null;}
export type DocumentExportRecord={quoteId:string;rendererVersion:string;fileUri:string|null;status:'ready'|'failed';errorMessage:string|null};
export async function loadDocumentExport(quoteId:string):Promise<DocumentExportRecord|null>{ const db=await getActiveDatabase(); const row=await db.getFirstAsync<{quote_id:string;renderer_version:string;file_uri:string|null;status:'ready'|'failed';error_message:string|null}>('SELECT * FROM document_exports WHERE quote_id = ?',quoteId); return row?{quoteId:row.quote_id,rendererVersion:row.renderer_version,fileUri:row.file_uri,status:row.status,errorMessage:row.error_message}:null; }
export async function saveDocumentExport(record:DocumentExportRecord){ const db=await getActiveDatabase(); const now=new Date().toISOString(); await db.runAsync(`INSERT INTO document_exports (quote_id,renderer_version,file_uri,status,error_message,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(quote_id) DO UPDATE SET renderer_version=excluded.renderer_version,file_uri=excluded.file_uri,status=excluded.status,error_message=excluded.error_message,updated_at=excluded.updated_at`,record.quoteId,record.rendererVersion,record.fileUri,record.status,record.errorMessage,now,now); }

export async function loadBusinessProfile() { return getBusinessProfile(await getActiveDatabase()); }
export async function updateBusinessProfile(profile: BusinessProfile) { return saveBusinessProfile(await getActiveDatabase(), profile); }

export async function listMeasurementUnits(): Promise<MeasurementUnit[]> {
  const db = await getActiveDatabase();
  const rows = await db.getAllAsync<{code:string;label:string;is_custom:number}>('SELECT code, label, is_custom FROM measurement_units ORDER BY is_custom, created_at, label');
  return rows.map((r) => ({ code:r.code, label:r.label, isCustom:Boolean(r.is_custom) }));
}
export async function createMeasurementUnit(label: string): Promise<MeasurementUnit> {
  const clean = label.trim(); if (!clean) throw new Error('Inserisci il nome dell\'unita.');
  const unit = { code:newId('unit'), label:clean, isCustom:true }; const db = await getActiveDatabase();
  await db.runAsync('INSERT INTO measurement_units (code, label, is_custom, created_at) VALUES (?, ?, 1, ?)', unit.code, unit.label, new Date().toISOString());
  return unit;
}
export async function listVatRates(): Promise<VatRate[]> {
  const db = await getActiveDatabase();
  const rows = await db.getAllAsync<{code:string;label:string;rate_basis_points:number;is_custom:number}>('SELECT code, label, rate_basis_points, is_custom FROM vat_rates ORDER BY is_custom, rate_basis_points');
  return rows.map((r) => ({ code:r.code, label:r.label, rateBasisPoints:r.rate_basis_points, isCustom:Boolean(r.is_custom) }));
}
export async function createVatRate(label:string, rateBasisPoints:number): Promise<VatRate> {
  if (!label.trim() || !Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 100000) throw new Error('Aliquota personalizzata non valida.');
  const value={code:newId('vat'),label:label.trim(),rateBasisPoints,isCustom:true}; const db=await getActiveDatabase();
  await db.runAsync('INSERT INTO vat_rates (code, label, rate_basis_points, is_custom, created_at) VALUES (?, ?, ?, 1, ?)',value.code,value.label,value.rateBasisPoints,new Date().toISOString());
  return value;
}

type CatalogItemInput = Omit<CatalogItem, 'id'|'createdAt'|'updatedAt'> & { id?:string };
function normalizeCatalogItem(value: CatalogItemInput): CatalogItem {
  const title=value.title.trim();
  if (!title) throw new Error('Inserisci il titolo della lavorazione.');
  if (!Number.isSafeInteger(value.priceCents) || value.priceCents < 0) throw new Error('Prezzo catalogo non valido.');
  if (value.priceMode === 'measured' && (!value.unitCode || !value.unitLabel.trim())) throw new Error('Seleziona l’unità di misura per la lavorazione a misura.');
  const now=new Date().toISOString();
  return { id:value.id??newId('catalog'), title, priceMode:value.priceMode, unitCode:value.priceMode==='measured'?value.unitCode:null, unitLabel:value.priceMode==='measured'?value.unitLabel.trim():'', priceCents:value.priceCents, createdAt:now, updatedAt:now };
}
function mapCatalogItem(row:{id:string;title:string;price_mode:'measured'|'body';unit_code:string|null;unit_label:string;price_cents:number;created_at:string;updated_at:string}): CatalogItem {
  return { id:row.id,title:row.title,priceMode:row.price_mode,unitCode:row.unit_code,unitLabel:row.unit_label,priceCents:row.price_cents,createdAt:row.created_at,updatedAt:row.updated_at };
}
export async function listCatalogItems(query = ''): Promise<CatalogItem[]> {
  const db=await getActiveDatabase(); const needle=`%${query.trim()}%`;
  const rows=await db.getAllAsync<{id:string;title:string;price_mode:'measured'|'body';unit_code:string|null;unit_label:string;price_cents:number;created_at:string;updated_at:string}>('SELECT * FROM catalog_items WHERE title LIKE ? ORDER BY title COLLATE NOCASE',needle);
  return rows.map(mapCatalogItem);
}
export async function findCatalogItemByTitle(title:string): Promise<CatalogItem|null> {
  const db=await getActiveDatabase();
  const row=await db.getFirstAsync<{id:string;title:string;price_mode:'measured'|'body';unit_code:string|null;unit_label:string;price_cents:number;created_at:string;updated_at:string}>('SELECT * FROM catalog_items WHERE title = ? COLLATE NOCASE LIMIT 1',title.trim());
  return row?mapCatalogItem(row):null;
}
export async function saveCatalogItem(value: CatalogItemInput): Promise<CatalogItem> {
  const item=normalizeCatalogItem(value); const db=await getActiveDatabase();
  await db.runAsync('INSERT INTO catalog_items (id,title,price_mode,unit_code,unit_label,price_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,price_mode=excluded.price_mode,unit_code=excluded.unit_code,unit_label=excluded.unit_label,price_cents=excluded.price_cents,updated_at=excluded.updated_at',item.id,item.title,item.priceMode,item.unitCode,item.unitLabel,item.priceCents,item.createdAt,item.updatedAt);
  return item;
}
export async function deleteCatalogItem(id:string) { const db=await getActiveDatabase(); await db.runAsync('DELETE FROM catalog_items WHERE id = ?',id); }

export async function listClients(query = ''): Promise<Client[]> {
  const db=await getActiveDatabase(); const needle=`%${query.trim()}%`;
  const rows=await db.getAllAsync<{id:string;name:string;contact_name:string;phone:string;email:string;address:string;tax_id:string;vat_number:string;created_at:string;updated_at:string}>('SELECT * FROM clients WHERE name LIKE ? OR contact_name LIKE ? ORDER BY name COLLATE NOCASE LIMIT 20',needle,needle);
  return rows.map((r)=>({id:r.id,name:r.name,contactName:r.contact_name,phone:r.phone,email:r.email,address:r.address,taxId:r.tax_id,vatNumber:r.vat_number,createdAt:r.created_at,updatedAt:r.updated_at}));
}
export async function saveClient(value: Omit<Client,'id'|'createdAt'|'updatedAt'> & {id?:string}): Promise<Client> {
  const name=value.name.trim(); if(!name) throw new Error('Inserisci il nome o la ragione sociale del cliente.');
  const now=new Date().toISOString(); const client:Client={id:value.id??newId('client'),name,contactName:value.contactName.trim(),phone:value.phone.trim(),email:value.email.trim(),address:value.address.trim(),taxId:value.taxId.trim(),vatNumber:value.vatNumber.trim(),createdAt:now,updatedAt:now}; const db=await getActiveDatabase();
  await db.runAsync('INSERT INTO clients (id,name,contact_name,phone,email,address,tax_id,vat_number,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,contact_name=excluded.contact_name,phone=excluded.phone,email=excluded.email,address=excluded.address,tax_id=excluded.tax_id,vat_number=excluded.vat_number,updated_at=excluded.updated_at',client.id,client.name,client.contactName,client.phone,client.email,client.address,client.taxId,client.vatNumber,now,now);
  return client;
}
export async function deleteClient(id:string) { const db=await getActiveDatabase(); await db.runAsync('DELETE FROM clients WHERE id = ?',id); }

export async function deleteDraft(id: string) {
  const db = await getActiveDatabase();
  await assertDraftDeletable(db, id);
  await db.runAsync("DELETE FROM quotes WHERE id = ? AND status = 'draft'", id);
}
