import { newId, Quote } from '../domain';
import { assertDraftDeletable } from '../features/quotes/draftDeletionIntegrity';
import { finalizeQuoteData, QuoteTransaction, replaceDraftData } from '../quoteTransactions';
import { BusinessProfile, getBusinessProfile, profileSnapshot, saveBusinessProfile } from '../businessProfile';
import { addCalendarDays, captureEmissionClock } from '../emissionClock';
import { CreateRevisionUseCase } from '../features/revisions/CreateRevisionUseCase';
import { SQLiteRevisionChainCapabilityRepository } from '../features/revisions/SQLiteRevisionChainCapabilityRepository';
import { deriveRecentWorkItems, RecentWorkItem } from '../features/recent-work-items/recentWorkItems';
import { Job } from '../features/jobs/JobRepository';
import { SQLiteJobCacheRepository } from '../features/jobs/SQLiteJobCacheRepository';
import { SQLiteJobInputsCacheRepository } from '../features/jobs/SQLiteJobInputsCacheRepository';
import { JobCostEntry, JobInputs, JobWorkEntry } from '../features/jobs/JobInputsRepository';
import {
  getActiveDatabase,
  hydrate,
  legacyUnitCodes,
  notifyDurabilityChange,
  queueDurabilityEntity,
  queueQuoteDurabilityPayload,
  quoteById,
  type CatalogItem,
  type Client,
  type ItemRow,
  type MeasurementUnit,
  type QuoteRow,
  type VatRate,
} from './core';

export async function listQuotes() {
  const db = await getActiveDatabase();
  const quotes = await db.getAllAsync<QuoteRow>('SELECT * FROM quotes ORDER BY COALESCE(issued_at, updated_at) DESC');
  const items = await db.getAllAsync<ItemRow>('SELECT * FROM quote_items ORDER BY position');
  return quotes.map((quote) => hydrate(quote, items));
}
/** Local read model for remote-authoritative Jobs. UI reaches it only through the Jobs feature. */
function jobCache(db: Awaited<ReturnType<typeof getActiveDatabase>>) { return new SQLiteJobCacheRepository(db); }
export async function listCachedJobs(): Promise<readonly Job[]> { return jobCache(await getActiveDatabase()).list(); }
export async function loadCachedJobBySourceRootIssuanceId(sourceRootIssuanceId: string): Promise<Job | null> { return jobCache(await getActiveDatabase()).getBySourceRootIssuanceId(sourceRootIssuanceId); }
export async function saveCachedJob(job: Job): Promise<void> { await jobCache(await getActiveDatabase()).save(job); }
function jobInputsCache(db: Awaited<ReturnType<typeof getActiveDatabase>>) { return new SQLiteJobInputsCacheRepository(db); }
export async function listCachedJobInputs(jobId: string): Promise<JobInputs> { return jobInputsCache(await getActiveDatabase()).list(jobId); }
export async function saveCachedJobCost(entry: JobCostEntry): Promise<void> { await jobInputsCache(await getActiveDatabase()).saveCost(entry); }
export async function removeCachedJobCost(entryId: string): Promise<void> { await jobInputsCache(await getActiveDatabase()).removeCost(entryId); }
export async function saveCachedJobWork(entry: JobWorkEntry): Promise<void> { await jobInputsCache(await getActiveDatabase()).saveWork(entry); }
export async function removeCachedJobWork(entryId: string): Promise<void> { await jobInputsCache(await getActiveDatabase()).removeWork(entryId); }
export async function loadQuoteReferenceByIssuanceId(issuanceId: string): Promise<{ number: number; year: number } | null> {
  const db = await getActiveDatabase();
  const row = await db.getFirstAsync<{ number: number | null; number_year: number | null }>('SELECT q.number, q.number_year FROM quotes q INNER JOIN quote_share_links link ON link.quote_id = q.id WHERE link.issuance_id = ?', issuanceId);
  return row && row.number !== null && row.number_year !== null ? { number: row.number, year: row.number_year } : null;
}

/** Voci derivate dai preventivi emessi: non Ã¨ una seconda tabella nÃ© un catalogo implicito. */
export async function listRecentWorkItems(): Promise<RecentWorkItem[]> {
  return deriveRecentWorkItems(await listQuotes());
}

export async function createDraft() {
  const db = await getActiveDatabase();
  const now = new Date().toISOString();
  const id = newId('quote');
  await db.runAsync('INSERT INTO quotes (id, client, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', id, '', '', now, now);
  const draft = await quoteById(db, id);
  if (!draft) throw new Error('Bozza appena creata non disponibile.');
  await queueQuoteDurabilityPayload(db, draft, false);
  notifyDurabilityChange();
  return id;
}

export async function saveDraft(quote: Quote) {
  if (quote.status !== 'draft') throw new Error('Un preventivo emesso non puÃ² essere modificato.');
  const db = await getActiveDatabase();
  await db.withExclusiveTransactionAsync((txn) => replaceDraftData(txn as unknown as QuoteTransaction, quote, new Date().toISOString()));
  const persisted = await quoteById(db, quote.id);
  if (!persisted || persisted.status !== 'draft') throw new Error('Bozza aggiornata non disponibile.');
  await queueQuoteDurabilityPayload(db, persisted, false);
  notifyDurabilityChange();
}

export async function finalizeDraft(quote: Quote, canonical?:{number:number;year:number;revision?:{rootQuoteId:string;parentQuoteId:string;revisionNumber:number}}) {
  const db = await getActiveDatabase();
  const business = await profileSnapshot(db);
  if(!business.businessName.trim()) throw new Error('Completa la denominazione dellâ€™attivitÃ  prima di finalizzare.');
  const clock = captureEmissionClock();
  const validUntil = addCalendarDays(clock.localDate, business.defaultValidityDays);
  let assignedNumber: number | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    assignedNumber = await finalizeQuoteData(txn as unknown as QuoteTransaction, quote, { clock, validUntil, businessProfile: business, canonicalNumber:canonical?.number, canonicalYear:canonical?.year, revision:canonical?.revision });
  });
  await queueQuoteDurabilityPayload(db, quote, true);
  notifyDurabilityChange();
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
  const result = await useCase.execute(quoteId);
  await queueQuoteDurabilityPayload(db, result.draft, false);
  notifyDurabilityChange();
  return result;
}
export async function getRevisionChainCapability(quoteId:string) {
  const db=await getActiveDatabase();
  return new SQLiteRevisionChainCapabilityRepository(db).resolve(quoteId);
}
export type QuoteShareLinkCache={quoteId:string;issuanceId:string|null;shareId:string|null;lifecycle:string|null;commercialOutcome:string|null;commercialOutcomeSource?:string|null;commercialOutcomeDecidedAt?:string|null;openedAt:string|null;shareSyncedAt:string|null;issuanceSnapshotSyncState?:'PENDING'|'SYNCED'|null};
export async function saveQuoteShareLinkCache(value:QuoteShareLinkCache){const db=await getActiveDatabase();await db.runAsync('INSERT INTO quote_share_links(quote_id,issuance_id,share_id,share_lifecycle_cache,commercial_outcome_cache,commercial_outcome_source_cache,commercial_outcome_decided_at_cache,opened_at_cache,share_synced_at,issuance_snapshot_sync_state) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(quote_id) DO UPDATE SET issuance_id=excluded.issuance_id,share_id=excluded.share_id,share_lifecycle_cache=excluded.share_lifecycle_cache,commercial_outcome_cache=excluded.commercial_outcome_cache,commercial_outcome_source_cache=coalesce(excluded.commercial_outcome_source_cache,quote_share_links.commercial_outcome_source_cache),commercial_outcome_decided_at_cache=coalesce(excluded.commercial_outcome_decided_at_cache,quote_share_links.commercial_outcome_decided_at_cache),opened_at_cache=excluded.opened_at_cache,share_synced_at=excluded.share_synced_at,issuance_snapshot_sync_state=coalesce(excluded.issuance_snapshot_sync_state,quote_share_links.issuance_snapshot_sync_state)',value.quoteId,value.issuanceId,value.shareId,value.lifecycle,value.commercialOutcome,value.commercialOutcomeSource??null,value.commercialOutcomeDecidedAt??null,value.openedAt,value.shareSyncedAt,value.issuanceSnapshotSyncState??null);}
export async function loadQuoteShareLinkCache(quoteId:string):Promise<QuoteShareLinkCache|null>{const db=await getActiveDatabase();const row=await db.getFirstAsync<{quote_id:string;issuance_id:string|null;share_id:string|null;share_lifecycle_cache:string|null;commercial_outcome_cache:string|null;commercial_outcome_source_cache:string|null;commercial_outcome_decided_at_cache:string|null;opened_at_cache:string|null;share_synced_at:string|null;issuance_snapshot_sync_state:'PENDING'|'SYNCED'|null}>('SELECT quote_id,issuance_id,share_id,share_lifecycle_cache,commercial_outcome_cache,commercial_outcome_source_cache,commercial_outcome_decided_at_cache,opened_at_cache,share_synced_at,issuance_snapshot_sync_state FROM quote_share_links WHERE quote_id=?',quoteId);return row?{quoteId:row.quote_id,issuanceId:row.issuance_id,shareId:row.share_id,lifecycle:row.share_lifecycle_cache,commercialOutcome:row.commercial_outcome_cache,commercialOutcomeSource:row.commercial_outcome_source_cache,commercialOutcomeDecidedAt:row.commercial_outcome_decided_at_cache,openedAt:row.opened_at_cache,shareSyncedAt:row.share_synced_at,issuanceSnapshotSyncState:row.issuance_snapshot_sync_state}:null;}
export type DocumentExportRecord={quoteId:string;rendererVersion:string;fileUri:string|null;status:'ready'|'failed';errorMessage:string|null}; export async function loadDocumentExport(quoteId:string):Promise<DocumentExportRecord|null>{ const db=await getActiveDatabase(); const row=await db.getFirstAsync<{quote_id:string;renderer_version:string;file_uri:string|null;status:'ready'|'failed';error_message:string|null}>('SELECT * FROM document_exports WHERE quote_id = ?',quoteId); return row?{quoteId:row.quote_id,rendererVersion:row.renderer_version,fileUri:row.file_uri,status:row.status,errorMessage:row.error_message}:null; }
export async function saveDocumentExport(record:DocumentExportRecord){ const db=await getActiveDatabase(); const now=new Date().toISOString(); await db.runAsync(`INSERT INTO document_exports (quote_id,renderer_version,file_uri,status,error_message,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(quote_id) DO UPDATE SET renderer_version=excluded.renderer_version,file_uri=excluded.file_uri,status=excluded.status,error_message=excluded.error_message,updated_at=excluded.updated_at`,record.quoteId,record.rendererVersion,record.fileUri,record.status,record.errorMessage,now,now); notifyDurabilityChange(); }
export async function saveIssuedDocxExport(record:DocumentExportRecord){const db=await getActiveDatabase();const now=new Date().toISOString();await db.runAsync("INSERT INTO issued_docx_exports(quote_id,file_uri,status,error_message,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(quote_id) DO UPDATE SET file_uri=excluded.file_uri,status=excluded.status,error_message=excluded.error_message,updated_at=excluded.updated_at",record.quoteId,record.fileUri,record.status,record.errorMessage,now,now);notifyDurabilityChange();}

export async function loadBusinessProfile() { return getBusinessProfile(await getActiveDatabase()); }
export async function updateBusinessProfile(profile: BusinessProfile) {
  const db = await getActiveDatabase();
  await saveBusinessProfile(db, profile);
  await queueDurabilityEntity(db, 'BUSINESS_PROFILE', 'profile');
  notifyDurabilityChange();
}

export async function listMeasurementUnits(): Promise<MeasurementUnit[]> {
  const db = await getActiveDatabase();
  const rows = await db.getAllAsync<{code:string;label:string;is_custom:number}>('SELECT code, label, is_custom FROM measurement_units WHERE deleted_at IS NULL ORDER BY is_custom, created_at, label');
  return rows.map((r) => ({ code:r.code, label:r.label, isCustom:Boolean(r.is_custom) }));
}
export async function createMeasurementUnit(label: string): Promise<MeasurementUnit> {
  const clean = label.trim(); if (!clean) throw new Error('Inserisci il nome dell\'unita.');
  const unit = { code:newId('unit'), label:clean, isCustom:true }; const db = await getActiveDatabase();
  const now = new Date().toISOString();
  await db.runAsync('INSERT INTO measurement_units (code, label, is_custom, created_at, updated_at) VALUES (?, ?, 1, ?, ?)', unit.code, unit.label, now, now);
  await queueDurabilityEntity(db, 'MEASUREMENT_UNIT', unit.code);
  notifyDurabilityChange();
  return unit;
}
export async function listVatRates(): Promise<VatRate[]> {
  const db = await getActiveDatabase();
  const rows = await db.getAllAsync<{code:string;label:string;rate_basis_points:number;is_custom:number}>('SELECT code, label, rate_basis_points, is_custom FROM vat_rates WHERE deleted_at IS NULL ORDER BY is_custom, rate_basis_points');
  return rows.map((r) => ({ code:r.code, label:r.label, rateBasisPoints:r.rate_basis_points, isCustom:Boolean(r.is_custom) }));
}
export async function createVatRate(label:string, rateBasisPoints:number): Promise<VatRate> {
  if (!label.trim() || !Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 100000) throw new Error('Aliquota personalizzata non valida.');
  const value={code:newId('vat'),label:label.trim(),rateBasisPoints,isCustom:true}; const db=await getActiveDatabase();
  const now = new Date().toISOString();
  await db.runAsync('INSERT INTO vat_rates (code, label, rate_basis_points, is_custom, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)',value.code,value.label,value.rateBasisPoints,now,now);
  await queueDurabilityEntity(db, 'VAT_RATE', value.code);
  notifyDurabilityChange();
  return value;
}

type CatalogItemInput = Omit<CatalogItem, 'id'|'createdAt'|'updatedAt'> & { id?:string };
function normalizeCatalogItem(value: CatalogItemInput): CatalogItem {
  const title=value.title.trim();
  if (!title) throw new Error('Inserisci il titolo della lavorazione.');
  if (!Number.isSafeInteger(value.priceCents) || value.priceCents < 0) throw new Error('Prezzo catalogo non valido.');
  if (value.priceMode === 'measured' && (!value.unitCode || !value.unitLabel.trim())) throw new Error('Seleziona lâ€™unitÃ  di misura per la lavorazione a misura.');
  const now=new Date().toISOString();
  return { id:value.id??newId('catalog'), title, priceMode:value.priceMode, unitCode:value.priceMode==='measured'?value.unitCode:null, unitLabel:value.priceMode==='measured'?value.unitLabel.trim():'', priceCents:value.priceCents, createdAt:now, updatedAt:now };
}
function mapCatalogItem(row:{id:string;title:string;price_mode:'measured'|'body';unit_code:string|null;unit_label:string;price_cents:number;created_at:string;updated_at:string}): CatalogItem {
  return { id:row.id,title:row.title,priceMode:row.price_mode,unitCode:row.unit_code,unitLabel:row.unit_label,priceCents:row.price_cents,createdAt:row.created_at,updatedAt:row.updated_at };
}
export async function listCatalogItems(query = ''): Promise<CatalogItem[]> {
  const db=await getActiveDatabase(); const needle=`%${query.trim()}%`;
  const rows=await db.getAllAsync<{id:string;title:string;price_mode:'measured'|'body';unit_code:string|null;unit_label:string;price_cents:number;created_at:string;updated_at:string}>('SELECT * FROM catalog_items WHERE deleted_at IS NULL AND title LIKE ? ORDER BY title COLLATE NOCASE',needle);
  return rows.map(mapCatalogItem);
}
export async function findCatalogItemByTitle(title:string): Promise<CatalogItem|null> {
  const db=await getActiveDatabase();
  const row=await db.getFirstAsync<{id:string;title:string;price_mode:'measured'|'body';unit_code:string|null;unit_label:string;price_cents:number;created_at:string;updated_at:string}>('SELECT * FROM catalog_items WHERE deleted_at IS NULL AND title = ? COLLATE NOCASE LIMIT 1',title.trim());
  return row?mapCatalogItem(row):null;
}
export async function saveCatalogItem(value: CatalogItemInput): Promise<CatalogItem> {
  const item=normalizeCatalogItem(value); const db=await getActiveDatabase();
  await db.runAsync('INSERT INTO catalog_items (id,title,price_mode,unit_code,unit_label,price_cents,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET title=excluded.title,price_mode=excluded.price_mode,unit_code=excluded.unit_code,unit_label=excluded.unit_label,price_cents=excluded.price_cents,updated_at=excluded.updated_at,deleted_at=NULL',item.id,item.title,item.priceMode,item.unitCode,item.unitLabel,item.priceCents,item.createdAt,item.updatedAt);
  await queueDurabilityEntity(db, 'CATALOG_ITEM', item.id);
  notifyDurabilityChange();
  return item;
}
export async function deleteCatalogItem(id:string) { const db=await getActiveDatabase(); const now = new Date().toISOString(); await db.runAsync('UPDATE catalog_items SET deleted_at=?,updated_at=? WHERE id = ?',now,now,id); await queueDurabilityEntity(db, 'CATALOG_ITEM', id); notifyDurabilityChange(); }

export async function listClients(query = ''): Promise<Client[]> {
  const db=await getActiveDatabase(); const needle=`%${query.trim()}%`;
  const rows=await db.getAllAsync<{id:string;name:string;contact_name:string;phone:string;email:string;address:string;tax_id:string;vat_number:string;created_at:string;updated_at:string}>('SELECT * FROM clients WHERE deleted_at IS NULL AND (name LIKE ? OR contact_name LIKE ?) ORDER BY name COLLATE NOCASE LIMIT 20',needle,needle);
  return rows.map((r)=>({id:r.id,name:r.name,contactName:r.contact_name,phone:r.phone,email:r.email,address:r.address,taxId:r.tax_id,vatNumber:r.vat_number,createdAt:r.created_at,updatedAt:r.updated_at}));
}
export async function saveClient(value: Omit<Client,'id'|'createdAt'|'updatedAt'> & {id?:string}): Promise<Client> {
  const name=value.name.trim(); if(!name) throw new Error('Inserisci il nome o la ragione sociale del cliente.');
  const now=new Date().toISOString(); const client:Client={id:value.id??newId('client'),name,contactName:value.contactName.trim(),phone:value.phone.trim(),email:value.email.trim(),address:value.address.trim(),taxId:value.taxId.trim(),vatNumber:value.vatNumber.trim(),createdAt:now,updatedAt:now}; const db=await getActiveDatabase();
  await db.runAsync('INSERT INTO clients (id,name,contact_name,phone,email,address,tax_id,vat_number,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET name=excluded.name,contact_name=excluded.contact_name,phone=excluded.phone,email=excluded.email,address=excluded.address,tax_id=excluded.tax_id,vat_number=excluded.vat_number,updated_at=excluded.updated_at,deleted_at=NULL',client.id,client.name,client.contactName,client.phone,client.email,client.address,client.taxId,client.vatNumber,now,now);
  await queueDurabilityEntity(db, 'CLIENT', client.id);
  notifyDurabilityChange();
  return client;
}
export async function deleteClient(id:string) { const db=await getActiveDatabase(); const now = new Date().toISOString(); await db.runAsync('UPDATE clients SET deleted_at=?,updated_at=? WHERE id = ?',now,now,id); await queueDurabilityEntity(db, 'CLIENT', id); notifyDurabilityChange(); }

export async function deleteDraft(id: string) {
  const db = await getActiveDatabase();
  await assertDraftDeletable(db, id);
  const draft = await quoteById(db, id);
  if (!draft || draft.status !== 'draft') throw new Error('Bozza non disponibile.');
  await db.runAsync("DELETE FROM quotes WHERE id = ? AND status = 'draft'", id);
  await queueQuoteDurabilityPayload(db, draft, true);
  notifyDurabilityChange();
}
