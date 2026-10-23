import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';
import { newId, Quote, QUANTITY_SCALE } from '../domain';
import { runMigrations } from '../migrations';
import { QuoteTransaction, replaceDraftData } from '../quoteTransactions';
import { createAccountDatabaseScope, legacyDatabaseName } from '../data/local/accountDatabaseScope';
import { LegacyDataClaimAvailability, resolveLegacyDataClaimAvailability } from '../features/local-data/legacyClaimPolicy';
import { readLegacyDataSnapshot, transferLegacyData, verifyLegacyDataTransfer, verifyLegacyTargetIntegrity } from '../features/local-data/legacyClaimTransfer';
import { repairSingleLegacyIssuedDraft } from '../features/local-data/repairLegacyIssuedDraft';
import { reconcileVerifiedLegacyIssuedQuote } from '../features/quote-issuance/reconcileIssuedQuoteBootstrap';
import { SQLiteOperationalRestoreRepository } from '../features/operational-restore/SQLiteOperationalRestoreRepository';
import { OperationalRestoreLocalRepository } from '../features/operational-restore/OperationalRestoreContracts';
import { SQLiteFileDurabilityLocalRepository } from '../features/file-durability/SQLiteFileDurabilityLocalRepository';
import { FileDurabilityLocalRepository } from '../features/file-durability/FileDurabilityContracts';
import { DurabilityEntityRecord, DurabilityEntityType, DurabilityLocalRepository, DurabilityOutboxOperation } from '../features/durability/DurabilityContracts';
import { IssuedQuoteRestoreRecord, QuoteDraftRemoteRecord, QuoteDurabilityLocalRepository, QuoteDurabilityOutboxOperation } from '../features/quote-durability/QuoteDurabilityContracts';

const localDatabaseScope = createAccountDatabaseScope((databaseName) => SQLite.openDatabaseAsync(databaseName));
export function getActiveDatabase() { return localDatabaseScope.current(); } let activeAccountOwnerId: string | null = null;
async function activateAccountDatabase(ownerUserId: string) {
  if (activeAccountOwnerId && activeAccountOwnerId !== ownerUserId) await closeAccountDatabase();
  const db = await localDatabaseScope.activate(ownerUserId);
  activeAccountOwnerId = ownerUserId;
  return db;
}
const localMetadataDatabaseName = 'quotivo-local-account-metadata-v1.db';
export type { LegacyDataClaimAvailability } from '../features/local-data/legacyClaimPolicy';
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
  if (existingClaim && existingClaim.owner_user_id !== ownerUserId) throw new Error('I dati locali sono giÃ  associati a un altro account su questo dispositivo.');
  if (await getLegacyDataClaimAvailability(ownerUserId) !== 'available') throw new Error('I dati locali non sono disponibili per questa importazione.');

  const metadata = await metadataDatabase();
  const now = new Date().toISOString();
  await metadata.runAsync("INSERT INTO legacy_data_claim (id, owner_user_id, status, claimed_at) VALUES (1, ?, 'claiming', ?) ON CONFLICT(id) DO UPDATE SET owner_user_id = excluded.owner_user_id, status = excluded.status, claimed_at = excluded.claimed_at", ownerUserId, now);

  const target = await activateAccountDatabase(ownerUserId);
  const legacy = await openLegacyDatabase();
  if (!legacy) throw new Error('I dati locali da associare non sono piÃ¹ disponibili.');
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
export type QuoteRow = Omit<Quote, 'items' | 'status' | 'createdAt' | 'updatedAt' | 'issuedAt' | 'numberYear' | 'issuedLocalDate' | 'issuedOffsetMinutes' | 'validUntil'> & {
  status: 'draft' | 'issued'; created_at: string; updated_at: string; issued_at: string | null;
  number_year: number | null; issued_local_date: string | null; issued_offset_minutes: number | null; valid_until: string | null;
  introduction: string; global_discount_basis_points: number;
  client_address:string; client_contact_name:string; client_phone:string; client_email:string; client_tax_id:string; client_vat_number:string; site_address:string; client_id:string|null; default_vat_basis_points:number;
  revision_root_quote_id:string|null; parent_quote_id:string|null; revision_number:number;
};
export type ItemRow = { id:string; quote_id:string; description:string; quantity:number; unit:string; unit_price_cents:number; position:number;
  short_description:string; price_mode:'measured'|'body'; quantity_scaled:number|null; unit_code:string|null; body_price_cents:number;
  vat_treatment:'rate'|'not_applied'; vat_rate_basis_points:number|null; vat_note:string; line_discount_basis_points:number; technical_details:string;
  inclusions:string; exclusions:string; is_optional:number; confirmed:number };

export type MeasurementUnit = { code: string; label: string; isCustom: boolean };
export type VatRate = { code: string; label: string; rateBasisPoints: number; isCustom: boolean };
export type Client = { id:string; name:string; contactName:string; phone:string; email:string; address:string; taxId:string; vatNumber:string; createdAt:string; updatedAt:string };
export type CatalogItem = { id:string; title:string; priceMode:'measured'|'body'; unitCode:string|null; unitLabel:string; priceCents:number; createdAt:string; updatedAt:string };
export const legacyUnitCodes: Record<string, string> = { 'mÂ²':'sqm', 'ml':'linear_m', 'mÂ³':'cubic_m', 'pz':'piece', 'punti':'point', 'h':'hour', 'gg':'day' };

const durabilityListeners = new Set<() => void>();
export function subscribeDurabilityChanges(listener: () => void) { durabilityListeners.add(listener); return () => { durabilityListeners.delete(listener); }; }
export function notifyDurabilityChange() { for (const listener of durabilityListeners) listener(); }

type DurabilityRow = { entityType: DurabilityEntityType; entityId: string; deletedAt: string | null; payload: Record<string, unknown> };
function json(value: unknown) { return JSON.stringify(value); }
function sameJson(a: unknown, b: unknown) { return json(a) === json(b); }
function durabilityString(payload: Readonly<Record<string, unknown>>, key: string) { const value = payload[key]; if (typeof value !== 'string') throw new Error('DURABILITY_REMOTE_RESPONSE_INVALID'); return value; }
function durabilityInteger(payload: Readonly<Record<string, unknown>>, key: string) { const value = payload[key]; if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('DURABILITY_REMOTE_RESPONSE_INVALID'); return value; }
function durabilityBoolean(payload: Readonly<Record<string, unknown>>, key: string) { const value = payload[key]; if (typeof value !== 'boolean') throw new Error('DURABILITY_REMOTE_RESPONSE_INVALID'); return value; }
function durabilityNullableString(payload: Readonly<Record<string, unknown>>, key: string) { const value = payload[key]; if (value !== null && typeof value !== 'string') throw new Error('DURABILITY_REMOTE_RESPONSE_INVALID'); return value; }

async function localDurabilityRow(db: SQLite.SQLiteDatabase, entityType: DurabilityEntityType, entityId: string): Promise<DurabilityRow | null> {
  if (entityType === 'BUSINESS_PROFILE') {
    const row = await db.getFirstAsync<{business_name:string;tax_id:string;vat_number:string;address:string;postal_code:string;city:string;province:string;email:string;phone:string;website:string;default_conditions:string;default_validity_days:number;default_payment_terms:string}>('SELECT * FROM business_profiles WHERE id=1');
    return row ? { entityType, entityId: 'profile', deletedAt: null, payload: { businessName:row.business_name, taxId:row.tax_id, vatNumber:row.vat_number, address:row.address, postalCode:row.postal_code, city:row.city, province:row.province, email:row.email, phone:row.phone, website:row.website, defaultConditions:row.default_conditions, defaultValidityDays:row.default_validity_days, defaultPaymentTerms:row.default_payment_terms } } : null;
  }
  if (entityType === 'CLIENT') {
    const row = await db.getFirstAsync<{id:string;name:string;contact_name:string;phone:string;email:string;address:string;tax_id:string;vat_number:string;deleted_at:string|null}>('SELECT * FROM clients WHERE id=?', entityId);
    return row ? { entityType, entityId:row.id, deletedAt:row.deleted_at, payload:{name:row.name,contactName:row.contact_name,phone:row.phone,email:row.email,address:row.address,taxId:row.tax_id,vatNumber:row.vat_number} } : null;
  }
  if (entityType === 'CATALOG_ITEM') {
    const row = await db.getFirstAsync<{id:string;title:string;price_mode:'measured'|'body';unit_code:string|null;unit_label:string;price_cents:number;deleted_at:string|null}>('SELECT * FROM catalog_items WHERE id=?', entityId);
    return row ? { entityType, entityId:row.id, deletedAt:row.deleted_at, payload:{title:row.title,priceMode:row.price_mode,unitCode:row.unit_code,unitLabel:row.unit_label,priceCents:row.price_cents} } : null;
  }
  if (entityType === 'MEASUREMENT_UNIT') {
    const row = await db.getFirstAsync<{code:string;label:string;is_custom:number;deleted_at:string|null}>('SELECT * FROM measurement_units WHERE code=?', entityId);
    return row ? { entityType, entityId:row.code, deletedAt:row.deleted_at, payload:{label:row.label,isCustom:Boolean(row.is_custom)} } : null;
  }
  const row = await db.getFirstAsync<{code:string;label:string;rate_basis_points:number;is_custom:number;deleted_at:string|null}>('SELECT * FROM vat_rates WHERE code=?', entityId);
  return row ? { entityType, entityId:row.code, deletedAt:row.deleted_at, payload:{label:row.label,rateBasisPoints:row.rate_basis_points,isCustom:Boolean(row.is_custom)} } : null;
}

async function localDurabilityRows(db: SQLite.SQLiteDatabase, entityType: DurabilityEntityType): Promise<DurabilityRow[]> {
  if (entityType === 'BUSINESS_PROFILE') { const row = await localDurabilityRow(db, entityType, 'profile'); return row ? [row] : []; }
  const ids = entityType === 'CLIENT' ? await db.getAllAsync<{id:string}>('SELECT id FROM clients')
    : entityType === 'CATALOG_ITEM' ? await db.getAllAsync<{id:string}>('SELECT id FROM catalog_items')
      : await db.getAllAsync<{code:string}>(entityType === 'MEASUREMENT_UNIT' ? 'SELECT code FROM measurement_units' : 'SELECT code FROM vat_rates');
  return (await Promise.all(ids.map((row) => localDurabilityRow(db, entityType, 'id' in row ? row.id : row.code)))).filter((row): row is DurabilityRow => row !== null);
}

function profileHasDurableContent(row: DurabilityRow) {
  return Object.entries(row.payload).some(([key, value]) => key !== 'defaultValidityDays' && value !== '');
}

export async function queueDurabilityEntity(db: SQLite.SQLiteDatabase, entityType: DurabilityEntityType, entityId: string) {
  const local = await localDurabilityRow(db, entityType, entityId);
  if (!local) return;
  const state = await db.getFirstAsync<{remote_version:number}>('SELECT remote_version FROM durability_entity_state WHERE entity_type=? AND entity_id=?', entityType, local.entityId);
  const payload = { ...local.payload, deleted: local.deletedAt !== null };
  await db.runAsync('INSERT INTO durability_sync_outbox(operation_id,entity_type,entity_id,expected_version,payload_json,state,created_at) VALUES(?,?,?,?,?,?,?)', newId('durability'), entityType, local.entityId, state?.remote_version ?? null, json(payload), 'PENDING', new Date().toISOString());
}

async function applyRemoteDurabilityRecord(db: SQLite.SQLiteDatabase, record: DurabilityEntityRecord, force = false) {
  const blocked = await db.getFirstAsync<{operation_id:string}>('SELECT operation_id FROM durability_sync_outbox WHERE entity_type=? AND entity_id=? LIMIT 1', record.entityType, record.entityId);
  const current = await localDurabilityRow(db, record.entityType, record.entityId);
  const state = await db.getFirstAsync<{remote_version:number}>('SELECT remote_version FROM durability_entity_state WHERE entity_type=? AND entity_id=?', record.entityType, record.entityId);
  if (!force && blocked) return;
  if (!force && !state && current && !(record.entityType === 'BUSINESS_PROFILE' && !profileHasDurableContent(current)) && !sameJson(current.payload, record.payload)) return;
  if (!force && state && state.remote_version >= record.version) return;
  const p = record.payload;
  if (record.entityType === 'BUSINESS_PROFILE') {
    await db.runAsync('UPDATE business_profiles SET business_name=?,tax_id=?,vat_number=?,address=?,postal_code=?,city=?,province=?,email=?,phone=?,website=?,default_conditions=?,default_validity_days=?,default_payment_terms=?,updated_at=? WHERE id=1', durabilityString(p,'businessName'), durabilityString(p,'taxId'), durabilityString(p,'vatNumber'), durabilityString(p,'address'), durabilityString(p,'postalCode'), durabilityString(p,'city'), durabilityString(p,'province'), durabilityString(p,'email'), durabilityString(p,'phone'), durabilityString(p,'website'), durabilityString(p,'defaultConditions'), durabilityInteger(p,'defaultValidityDays'), durabilityString(p,'defaultPaymentTerms'), record.updatedAt);
  } else if (record.entityType === 'CLIENT') {
    await db.runAsync('INSERT INTO clients(id,name,contact_name,phone,email,address,tax_id,vat_number,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,contact_name=excluded.contact_name,phone=excluded.phone,email=excluded.email,address=excluded.address,tax_id=excluded.tax_id,vat_number=excluded.vat_number,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at', record.entityId, durabilityString(p,'name'), durabilityString(p,'contactName'), durabilityString(p,'phone'), durabilityString(p,'email'), durabilityString(p,'address'), durabilityString(p,'taxId'), durabilityString(p,'vatNumber'), record.createdAt, record.updatedAt, record.deletedAt);
  } else if (record.entityType === 'CATALOG_ITEM') {
    await db.runAsync('INSERT INTO catalog_items(id,title,price_mode,unit_code,unit_label,price_cents,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,price_mode=excluded.price_mode,unit_code=excluded.unit_code,unit_label=excluded.unit_label,price_cents=excluded.price_cents,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at', record.entityId, durabilityString(p,'title'), durabilityString(p,'priceMode'), durabilityNullableString(p,'unitCode'), durabilityString(p,'unitLabel'), durabilityInteger(p,'priceCents'), record.createdAt, record.updatedAt, record.deletedAt);
  } else if (record.entityType === 'MEASUREMENT_UNIT') {
    await db.runAsync('INSERT INTO measurement_units(code,label,is_custom,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET label=excluded.label,is_custom=excluded.is_custom,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at', record.entityId, durabilityString(p,'label'), durabilityBoolean(p,'isCustom') ? 1 : 0, record.createdAt, record.updatedAt, record.deletedAt);
  } else {
    await db.runAsync('INSERT INTO vat_rates(code,label,rate_basis_points,is_custom,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET label=excluded.label,rate_basis_points=excluded.rate_basis_points,is_custom=excluded.is_custom,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at', record.entityId, durabilityString(p,'label'), durabilityInteger(p,'rateBasisPoints'), durabilityBoolean(p,'isCustom') ? 1 : 0, record.createdAt, record.updatedAt, record.deletedAt);
  }
  await db.runAsync('INSERT INTO durability_entity_state(entity_type,entity_id,remote_version,synced_at) VALUES(?,?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET remote_version=excluded.remote_version,synced_at=excluded.synced_at', record.entityType, record.entityId, record.version, new Date().toISOString());
}

/** Local adapter for the remote durability protocol. */
export function durabilityLocalRepository(): DurabilityLocalRepository {
  return {
    async prepareLegacyUpload() {
      const db = await getActiveDatabase();
      for (const entityType of ['BUSINESS_PROFILE','CLIENT','CATALOG_ITEM','MEASUREMENT_UNIT','VAT_RATE'] as const) {
        for (const row of await localDurabilityRows(db, entityType)) {
          if (entityType === 'BUSINESS_PROFILE' && !profileHasDurableContent(row)) continue;
          const state = await db.getFirstAsync<{remote_version:number}>('SELECT remote_version FROM durability_entity_state WHERE entity_type=? AND entity_id=?', entityType, row.entityId);
          const queued = await db.getFirstAsync<{operation_id:string}>('SELECT operation_id FROM durability_sync_outbox WHERE entity_type=? AND entity_id=? LIMIT 1', entityType, row.entityId);
          if (!state && !queued) await queueDurabilityEntity(db, entityType, row.entityId);
        }
      }
    },
    async listPending() {
      const db = await getActiveDatabase();
      const rows = await db.getAllAsync<{operation_id:string;entity_type:DurabilityEntityType;entity_id:string;expected_version:number|null;payload_json:string}>('SELECT operation_id,entity_type,entity_id,expected_version,payload_json FROM durability_sync_outbox WHERE state=\'PENDING\' ORDER BY created_at');
      return rows.map((row) => ({ operationId:row.operation_id, entityType:row.entity_type, entityId:row.entity_id, expectedVersion:row.expected_version, payload:JSON.parse(row.payload_json) as Record<string, unknown> }));
    },
    async applyRemote(record) { const db = await getActiveDatabase(); await db.withExclusiveTransactionAsync(async () => applyRemoteDurabilityRecord(db, record)); },
    async markApplied(operationId, record) {
      const db = await getActiveDatabase();
      await db.withExclusiveTransactionAsync(async () => {
        await applyRemoteDurabilityRecord(db, record, true);
        await db.runAsync('DELETE FROM durability_sync_outbox WHERE operation_id=?', operationId);
        await db.runAsync('UPDATE durability_sync_outbox SET expected_version=? WHERE entity_type=? AND entity_id=? AND state=\'PENDING\'', record.version, record.entityType, record.entityId);
      });
    },
    async markConflict(operation, remote) {
      const db = await getActiveDatabase();
      await db.withExclusiveTransactionAsync(async () => {
        await db.runAsync('UPDATE durability_sync_outbox SET state=\'CONFLICT\' WHERE operation_id=?', operation.operationId);
        await db.runAsync('INSERT INTO durability_sync_conflicts(entity_type,entity_id,operation_id,local_payload_json,remote_record_json,detected_at) VALUES(?,?,?,?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET operation_id=excluded.operation_id,local_payload_json=excluded.local_payload_json,remote_record_json=excluded.remote_record_json,detected_at=excluded.detected_at', operation.entityType, operation.entityId, operation.operationId, json(operation.payload), json(remote), new Date().toISOString());
      });
    },
  };
}

export async function initializeDatabase(ownerUserId: string) {
  const db = await activateAccountDatabase(ownerUserId);
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  await runMigrations(db);
  const reconciliation=await reconcileVerifiedLegacyIssuedQuote(db,ownerUserId);
  console.info('QUOTIVO_RECONCILIATION_DIAGNOSTIC',reconciliation);
  await db.withExclusiveTransactionAsync(async (txn) => {
    await repairSingleLegacyIssuedDraft(txn as unknown as Parameters<typeof repairSingleLegacyIssuedDraft>[0]);
  });
}

export async function closeAccountDatabase() {
  activeAccountOwnerId = null;
  const db = localDatabaseScope.deactivate();
  if (db) await (await db).closeAsync();
}

export function hydrate(row: QuoteRow, items: ItemRow[]): Quote {
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

type QuoteDurabilityRow = { quoteId:string; deleted:boolean; quote:Quote };
function quoteDurabilityPayload(quote: Quote, deleted = false) { return { ...quote, deleted }; }
function remoteQuoteRecord(value: IssuedQuoteRestoreRecord['snapshot']): Quote {
  const raw = value as Partial<Quote>;
  if (raw.status !== 'issued' || typeof raw.id !== 'string' || typeof raw.number !== 'number' || typeof raw.numberYear !== 'number'
    || typeof raw.revisionNumber !== 'number' || !Array.isArray(raw.items) || typeof raw.client !== 'string' || typeof raw.title !== 'string'
    || typeof raw.createdAt !== 'string' || typeof raw.updatedAt !== 'string' || typeof raw.issuedAt !== 'string') throw new Error('QUOTE_RESTORE_SNAPSHOT_INVALID');
  return raw as Quote;
}
export async function quoteById(db: SQLite.SQLiteDatabase, quoteId: string): Promise<Quote | null> {
  const row = await db.getFirstAsync<QuoteRow>('SELECT * FROM quotes WHERE id=?', quoteId);
  if (!row) return null;
  return hydrate(row, await db.getAllAsync<ItemRow>('SELECT * FROM quote_items WHERE quote_id=? ORDER BY position', quoteId));
}
async function localDraftDurabilityRow(db: SQLite.SQLiteDatabase, quoteId: string): Promise<QuoteDurabilityRow | null> {
  const quote = await quoteById(db, quoteId);
  return quote?.status === 'draft' ? { quoteId, deleted:false, quote } : null;
}
export async function queueQuoteDurabilityPayload(db: SQLite.SQLiteDatabase, quote: Quote, deleted: boolean) {
  const state = await db.getFirstAsync<{remote_version:number}>('SELECT remote_version FROM quote_durability_state WHERE quote_id=?', quote.id);
  // Coalesce queued editor autosaves. A request already in flight is protected by
  // its server operation id and any divergence remains an explicit conflict.
  await db.runAsync("DELETE FROM quote_durability_outbox WHERE quote_id=? AND state='PENDING'", quote.id);
  await db.runAsync('INSERT INTO quote_durability_outbox(operation_id,quote_id,expected_version,payload_json,state,created_at) VALUES(?,?,?,?,?,?)', newId('quote-sync'), quote.id, state?.remote_version ?? null, json(quoteDurabilityPayload(quote, deleted)), 'PENDING', new Date().toISOString());
}
async function insertRestoredQuote(txn: SQLite.SQLiteDatabase, quote: Quote) {
  const existing = await txn.getFirstAsync<{status:'draft'|'issued'}>('SELECT status FROM quotes WHERE id=?', quote.id);
  if (existing?.status === 'issued') return;
  if (existing?.status === 'draft') {
    const pending = await txn.getFirstAsync<{operation_id:string}>('SELECT operation_id FROM quote_durability_outbox WHERE quote_id=? AND state=\'PENDING\'', quote.id);
    if (pending) throw new Error('QUOTE_RESTORE_CONFLICT_LOCAL_DRAFT');
    await txn.runAsync('DELETE FROM quotes WHERE id=?', quote.id);
  }
  await txn.runAsync(`INSERT INTO quotes (id,number,number_year,client,title,status,created_at,updated_at,issued_at,issued_local_date,issued_offset_minutes,valid_until,introduction,global_discount_basis_points,client_address,site_address,client_id,default_vat_basis_points,client_contact_name,client_phone,client_email,client_tax_id,client_vat_number,revision_root_quote_id,parent_quote_id,revision_number) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, quote.id, quote.number, quote.numberYear, quote.client, quote.title, 'issued', quote.createdAt, quote.updatedAt, quote.issuedAt, quote.issuedLocalDate, quote.issuedOffsetMinutes, quote.validUntil, quote.introduction, quote.globalDiscountBasisPoints, quote.clientAddress, quote.siteAddress, quote.clientId, quote.defaultVatBasisPoints, quote.clientContactName, quote.clientPhone, quote.clientEmail, quote.clientTaxId, quote.clientVatNumber, quote.revisionRootQuoteId, quote.parentQuoteId, quote.revisionNumber);
  for (const item of quote.items) await txn.runAsync(`INSERT INTO quote_items (id,quote_id,description,quantity,unit,unit_price_cents,position,short_description,price_mode,quantity_scaled,unit_code,body_price_cents,vat_treatment,vat_rate_basis_points,vat_note,line_discount_basis_points,technical_details,inclusions,exclusions,is_optional,confirmed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, item.id, quote.id, item.description, item.quantity, item.unit, item.unitPriceCents, item.position, item.shortDescription, item.priceMode, item.quantityScaled, item.unitCode, item.bodyPriceCents, item.vatTreatment, item.vatRateBasisPoints, item.vatNote, item.lineDiscountBasisPoints, item.technicalDetails, item.inclusions, item.exclusions, item.isOptional ? 1 : 0, item.confirmed ? 1 : 0);
}
async function applyRemoteQuoteDraft(db: SQLite.SQLiteDatabase, record: QuoteDraftRemoteRecord, force = false) {
  const pending = await db.getFirstAsync<{operation_id:string}>('SELECT operation_id FROM quote_durability_outbox WHERE quote_id=? AND state=\'PENDING\'', record.quoteId);
  const state = await db.getFirstAsync<{remote_version:number}>('SELECT remote_version FROM quote_durability_state WHERE quote_id=?', record.quoteId);
  if (!force && pending) return;
  if (!force && state && state.remote_version >= record.version) return;
  if (record.deletedAt !== null) {
    const local = await quoteById(db, record.quoteId);
    if (local?.status === 'draft') await db.runAsync('DELETE FROM quotes WHERE id=?', record.quoteId);
  } else {
    if (record.quote.status !== 'draft' || record.quote.id !== record.quoteId) throw new Error('QUOTE_DURABILITY_REMOTE_RESPONSE_INVALID');
    const existing = await db.getFirstAsync<{status:'draft'|'issued'}>('SELECT status FROM quotes WHERE id=?', record.quoteId);
    if (existing?.status === 'issued') throw new Error('QUOTE_RESTORE_CONFLICT_ISSUED');
    if (!existing) await db.runAsync('INSERT INTO quotes(id,client,title,created_at,updated_at,revision_root_quote_id,parent_quote_id,revision_number) VALUES(?,?,?,?,?,?,?,?)', record.quote.id, record.quote.client, record.quote.title, record.quote.createdAt, record.quote.updatedAt, record.quote.revisionRootQuoteId, record.quote.parentQuoteId, record.quote.revisionNumber);
    await replaceDraftData(db as unknown as QuoteTransaction, record.quote, record.updatedAt);
  }
  await db.runAsync('INSERT INTO quote_durability_state(quote_id,remote_version,synced_at) VALUES(?,?,?) ON CONFLICT(quote_id) DO UPDATE SET remote_version=excluded.remote_version,synced_at=excluded.synced_at', record.quoteId, record.version, new Date().toISOString());
}

/** Local projection adapter for remote-authoritative editable quote drafts. */
export function quoteDurabilityLocalRepository(): QuoteDurabilityLocalRepository {
  return {
    async applyIssued(record) {
      const db = await getActiveDatabase();
      const quote = remoteQuoteRecord(record.snapshot);
      await db.withExclusiveTransactionAsync(async (txn) => {
        await insertRestoredQuote(txn as unknown as SQLite.SQLiteDatabase, quote);
        await txn.runAsync('INSERT OR IGNORE INTO issued_quote_snapshots(quote_id,schema_version,snapshot_json,created_at) VALUES(?,?,?,?)', quote.id, 3, json(record.snapshot), quote.issuedAt ?? new Date().toISOString());
        await txn.runAsync('INSERT INTO quote_share_links(quote_id,issuance_id,commercial_outcome_cache,commercial_outcome_source_cache,commercial_outcome_decided_at_cache) VALUES(?,?,?,?,?) ON CONFLICT(quote_id) DO UPDATE SET issuance_id=excluded.issuance_id,commercial_outcome_cache=excluded.commercial_outcome_cache,commercial_outcome_source_cache=excluded.commercial_outcome_source_cache,commercial_outcome_decided_at_cache=excluded.commercial_outcome_decided_at_cache', quote.id, record.issuanceId, record.commercialOutcome, record.commercialOutcomeSource, record.commercialOutcomeDecidedAt);
      });
    },
    async applyDraft(record) { const db = await getActiveDatabase(); await applyRemoteQuoteDraft(db, record); },
    async prepareLegacyUpload() {
      const db = await getActiveDatabase();
      const rows = await db.getAllAsync<{id:string}>('SELECT id FROM quotes WHERE status=\'draft\'');
      for (const row of rows) {
        const state = await db.getFirstAsync<{remote_version:number}>('SELECT remote_version FROM quote_durability_state WHERE quote_id=?', row.id);
        const queued = await db.getFirstAsync<{operation_id:string}>('SELECT operation_id FROM quote_durability_outbox WHERE quote_id=? AND state=\'PENDING\'', row.id);
        const draft = await localDraftDurabilityRow(db, row.id);
        if (draft && !state && !queued) await queueQuoteDurabilityPayload(db, draft.quote, false);
      }
    },
    async listPending() {
      const db = await getActiveDatabase();
      const rows = await db.getAllAsync<{operation_id:string;quote_id:string;expected_version:number|null;payload_json:string}>('SELECT operation_id,quote_id,expected_version,payload_json FROM quote_durability_outbox WHERE state=\'PENDING\' ORDER BY created_at');
      return rows.map((row) => { const payload = JSON.parse(row.payload_json) as Quote & {deleted:boolean}; return { operationId:row.operation_id, quoteId:row.quote_id, expectedVersion:row.expected_version, quote:payload, deleted:payload.deleted }; });
    },
    async markApplied(operationId, record) {
      const db = await getActiveDatabase();
      await db.withExclusiveTransactionAsync(async () => {
        await applyRemoteQuoteDraft(db, record, true);
        await db.runAsync('DELETE FROM quote_durability_outbox WHERE operation_id=?', operationId);
        await db.runAsync("UPDATE quote_durability_outbox SET expected_version=? WHERE quote_id=? AND state='PENDING'", record.version, record.quoteId);
      });
    },
    async markConflict(operation, remote) {
      const db = await getActiveDatabase();
      await db.withExclusiveTransactionAsync(async () => {
        await db.runAsync("UPDATE quote_durability_outbox SET state='CONFLICT' WHERE operation_id=?", operation.operationId);
        await db.runAsync('INSERT INTO quote_durability_conflicts(quote_id,operation_id,local_payload_json,remote_record_json,detected_at) VALUES(?,?,?,?,?) ON CONFLICT(quote_id) DO UPDATE SET operation_id=excluded.operation_id,local_payload_json=excluded.local_payload_json,remote_record_json=excluded.remote_record_json,detected_at=excluded.detected_at', operation.quoteId, operation.operationId, json(quoteDurabilityPayload(operation.quote, operation.deleted)), json(remote), new Date().toISOString());
      });
    },
  };
}

export function operationalRestoreLocalRepository(): OperationalRestoreLocalRepository { return new SQLiteOperationalRestoreRepository(getActiveDatabase); } export function fileDurabilityLocalRepository(): FileDurabilityLocalRepository { return new SQLiteFileDurabilityLocalRepository(getActiveDatabase); }
