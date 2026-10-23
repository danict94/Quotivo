import initSqlJs from 'sql.js';
import { createEmptyQuoteItem, Quote } from '../src/domain';
import { runMigrations } from '../src/migrations';
import { EmissionClock } from '../src/emissionClock';
import { finalizeQuoteData } from '../src/quoteTransactions';
import { SqlJsTestAdapter } from './sqliteTestAdapter';

export const sqlPromise = initSqlJs();

export const now = '2026-09-11T12:00:00.000Z';
export const clock: EmissionClock = { instant: now, localDate: '2026-09-11', year: 2026, offsetMinutes: 120 };
export const finalizationContext = { clock, validUntil: '2026-10-11', businessProfile: null };

export function quote(id = 'q-1'): Quote {
  return {
    id, number: null, numberYear: null, clientId:null, client: 'Cliente', clientContactName:'', clientPhone:'', clientEmail:'', clientAddress:'', clientTaxId:'', clientVatNumber:'', siteAddress:'', title: 'Lavori', introduction: '', defaultVatBasisPoints:1000, revisionRootQuoteId:null, parentQuoteId:null, revisionNumber:0, globalDiscountBasisPoints: 0, status: 'draft',
    createdAt: now, updatedAt: now, issuedAt: null,
    issuedLocalDate: null, issuedOffsetMinutes: null, validUntil: null,
    items: [{ ...createEmptyQuoteItem(`${id}-item`, 0), description: 'Posa', unit: 'm²', unitCode: 'sqm', unitPriceCents: 1000 }],
  };
}
export async function migratedDatabase() {
  const SQL = await sqlPromise;
  const adapter = new SqlJsTestAdapter(new SQL.Database());
  await adapter.execAsync('PRAGMA foreign_keys = ON');
  await runMigrations(adapter);
  return adapter;
}

export async function insertDraft(adapter: SqlJsTestAdapter, value: Quote) {
  await adapter.runAsync('INSERT INTO quotes (id, client, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', value.id, 'Vecchio cliente', 'Vecchio titolo', now, now);
  await adapter.runAsync('INSERT INTO quote_items (id, quote_id, description, quantity, unit, unit_price_cents, position) VALUES (?, ?, ?, ?, ?, ?, ?)', `${value.id}-old`, value.id, 'Vecchia voce', 1, 'pz', 100, 0);
}

export async function atomicFinalize(adapter: SqlJsTestAdapter, value: Quote) {
  await adapter.execAsync('BEGIN IMMEDIATE');
  try {
    const number = await finalizeQuoteData(adapter, value, finalizationContext);
    await adapter.execAsync('COMMIT');
    return number;
  } catch (error) {
    await adapter.execAsync('ROLLBACK');
    throw error;
  }
}
