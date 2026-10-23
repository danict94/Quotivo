import assert from 'node:assert/strict';
import test from 'node:test';
import initSqlJs from 'sql.js';
import { calculateEconomics, createEmptyQuoteItem, hasMeaningfulDraftContent, materializeNumericInputs, numericInputKey, parseDecimal, parseScaledDecimal } from '../src/domain';
import { migrations, runMigrations } from '../src/migrations';
import { assertDraftDeletable, DraftDeletionIntegrityError } from '../src/features/quotes/draftDeletionIntegrity';
import { finalizeQuoteData, replaceDraftData } from '../src/quoteTransactions';
import { validateLogoBytes } from '../src/logoValidation';
import { addCalendarDays, EmissionClock, formatQuoteNumber } from '../src/emissionClock';
import { importLogoAsset, LogoImportGateway, runStagingStrategies } from '../src/logoImport';
import { buildFinalDocumentModel, STANDARD_RENDERER_VERSION } from '../src/documents/documentModel';
import { renderStandardHtml } from '../src/documents/standardRenderer';
import { draftPdfName, finalPdfName, safeFilePart } from '../src/documents/pdfNaming';
import { generatePdfForIssuedQuote } from '../src/documents/documentWorkflow';
import { SqlJsTestAdapter } from './sqliteTestAdapter';
import { atomicFinalize, finalizationContext, insertDraft, migratedDatabase, now, quote, sqlPromise } from './reliabilityFixtures';

test('Salva acquisisce e persiste quantità e prezzo ancora attivi senza attendere blur', async () => {
  const value = quote();
  const adapter = await migratedDatabase();
  await insertDraft(adapter, value);
  const materialized = materializeNumericInputs(value, {
    [numericInputKey(value.items[0].id, 'quantity')]: '2,5',
    [numericInputKey(value.items[0].id, 'price')]: '19,90',
  });
  assert.equal(materialized.items[0].quantity, 2.5);
  assert.equal(materialized.items[0].unitPriceCents, 1990);
  await adapter.execAsync('BEGIN IMMEDIATE');
  await replaceDraftData(adapter, materialized, now);
  await adapter.execAsync('COMMIT');
  assert.deepEqual(await adapter.getFirstAsync("SELECT quantity, unit_price_cents FROM quote_items WHERE quote_id = 'q-1'"), { quantity: 2.5, unit_price_cents: 1990 });
});
test('Parsing decimali italiani accetta virgola e separatore delle migliaia', () => {
  assert.equal(parseDecimal('1,5'), 1.5);
  assert.equal(parseDecimal('1.234,56'), 1234.56);
  assert.equal(parseDecimal('0,25'), 0.25);
  assert.throws(() => parseDecimal('abc'));
  assert.throws(() => parseDecimal(''));
  assert.throws(() => parseDecimal('-1'));
});

test('Motore Standard: misura scalata, half-up e decimali italiani', () => {
  const item = { ...createEmptyQuoteItem('m', 0), description:'Posa', quantityScaled:25_000, quantity:2.5, unitPriceCents:1250, vatRateBasisPoints:1000 };
  const result = calculateEconomics([item]);
  assert.deepEqual({net:result.netCents,iva:result.vatCents,totale:result.totalCents},{net:3125,iva:313,totale:3438});
  assert.equal(parseScaledDecimal('1.234,5678', 4), 12_345_678);
});

test('Motore Standard: a corpo non somma quantità e opzioni escluse dalla base', () => {
  const body = { ...createEmptyQuoteItem('b', 0), description:'Corpo', priceMode:'body' as const, bodyPriceCents:50000, quantityScaled:999999, unitPriceCents:999999, vatTreatment:'not_applied' as const, vatRateBasisPoints:null };
  const option = { ...body, id:'o', bodyPriceCents:30000, isOptional:true };
  assert.equal(calculateEconomics([body, option]).totalCents, 50000);
});

test('Motore Standard: aliquote multiple e maggiori resti con pareggio stabile', () => {
  const a = { ...createEmptyQuoteItem('a', 0), description:'A', priceMode:'body' as const, bodyPriceCents:100000, vatRateBasisPoints:1000 };
  const b = { ...createEmptyQuoteItem('b', 1), description:'B', priceMode:'body' as const, bodyPriceCents:50000, vatRateBasisPoints:2200 };
  let result = calculateEconomics([a,b]);
  assert.deepEqual({net:result.netCents,iva:result.vatCents,totale:result.totalCents},{net:150000,iva:21000,totale:171000});
  const thirds = [0,1,2].map((position)=>({ ...a,id:String(position),position,bodyPriceCents:1,vatTreatment:'not_applied' as const,vatRateBasisPoints:null }));
  result=calculateEconomics(thirds,3333);
  assert.deepEqual(result.lines.map((line)=>line.globalDiscountCents),[1,0,0]);
});

test('Numero annuale e scadenza usano data locale e giorni di calendario', () => {
  assert.equal(formatQuoteNumber(3, 2026), '3/2026');
  assert.equal(formatQuoteNumber(3, null), '3');
  assert.equal(addCalendarDays('2026-12-20', 30), '2027-01-19');
});

test('Logo riconosce il contenuto reale e rifiuta SVG attivi o esterni', () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  assert.equal(validateLogoBytes(new Uint8Array([137,80,78,71,13,10,26,10]), 'image/png'), 'image/png');
  assert.equal(validateLogoBytes(encode('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'), 'image/svg+xml'), 'image/svg+xml');
  assert.throws(() => validateLogoBytes(encode('<svg onload="alert(1)"></svg>'), 'image/svg+xml'), /non sicuro/);
  assert.throws(() => validateLogoBytes(encode('<svg><image href="https://example.test/a.png"/></svg>'), 'image/svg+xml'), /non sicuro/);
  assert.throws(() => validateLogoBytes(new Uint8Array([137,80,78,71,13,10,26,10]), 'image/jpeg'), /non corrisponde/);
});

test('Import logo copia content URI in cache privata prima di leggere e pulisce il temporaneo', async () => {
  const events: string[] = [];
  const png = new Uint8Array([137,80,78,71,13,10,26,10]);
  const gateway: LogoImportGateway = {
    createTemporaryUri: () => { events.push('temp'); return 'file:///private-cache/logo.tmp'; },
    copyIntoPrivateCache: async (source, target) => { events.push(`copy:${source}->${target}`); },
    readPrivateBytes: async (uri) => { events.push(`read:${uri}`); return png; },
    copyIntoPersistentStorage: async (uri, mime) => { events.push(`persist:${uri}:${mime}`); return 'file:///documents/logos/logo.png'; },
    removeTemporaryFile: async (uri) => { events.push(`remove:${uri}`); },
  };
  const result = await importLogoAsset({ uri: 'content://provider/logo', mimeType: 'image/png', name: 'logo.png' }, gateway);
  assert.deepEqual(result, { uri: 'file:///documents/logos/logo.png', mimeType: 'image/png', originalName: 'logo.png' });
  assert.deepEqual(events, ['temp', 'copy:content://provider/logo->file:///private-cache/logo.tmp', 'read:file:///private-cache/logo.tmp', 'persist:file:///private-cache/logo.tmp:image/png', 'remove:file:///private-cache/logo.tmp']);
});

test('Import logo pulisce il temporaneo dopo copia, lettura o validazione fallita', async () => {
  for (const failure of ['copy', 'read', 'validation'] as const) {
    const events: string[] = [];
    const gateway: LogoImportGateway = {
      createTemporaryUri: () => 'file:///private-cache/logo.tmp',
      copyIntoPrivateCache: async () => { events.push('copy'); if (failure === 'copy') throw new Error('denied'); },
      readPrivateBytes: async () => { events.push('read'); if (failure === 'read') throw new Error('unreadable'); return new Uint8Array([1,2,3]); },
      copyIntoPersistentStorage: async () => { events.push('persist'); return 'never'; },
      removeTemporaryFile: async () => { events.push('remove'); },
    };
    await assert.rejects(() => importLogoAsset({ uri: 'content://provider/logo', mimeType: 'image/png', name: 'logo.png' }, gateway));
    assert.equal(events.at(-1), 'remove');
    assert.equal(events.includes('persist'), false);
  }
});

test('Staging Android usa il fallback successivo e pulisce ogni tentativo fallito', async () => {
  const events: string[] = [];
  await runStagingStrategies([
    { label: 'copyAsync', run: async () => { events.push('copyAsync'); throw new Error('READ negato'); } },
    { label: 'expoFetch', run: async () => { events.push('expoFetch'); } },
    { label: 'base64', run: async () => { events.push('base64'); } },
  ], async () => { events.push('cleanup'); });
  assert.deepEqual(events, ['copyAsync', 'cleanup', 'expoFetch']);
});

test('Staging Android riporta tutti gli errori quando nessun percorso è leggibile', async () => {
  let cleanups = 0;
  await assert.rejects(() => runStagingStrategies([
    { label: 'copyAsync', run: async () => { throw new Error('uno'); } },
    { label: 'expoFetch', run: async () => { throw new Error('due'); } },
  ], async () => { cleanups += 1; }), /copyAsync: uno.*expoFetch: due/);
  assert.equal(cleanups, 2);
});

test('Migrazione annuale conserva dati legacy senza attribuire un anno non attendibile', async () => {
  const SQL = await sqlPromise;
  const adapter = new SqlJsTestAdapter(new SQL.Database());
  await adapter.execAsync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE quotes (id TEXT PRIMARY KEY NOT NULL, number INTEGER UNIQUE, client TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, issued_at TEXT);
    CREATE TABLE quote_items (id TEXT PRIMARY KEY NOT NULL, quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE, description TEXT NOT NULL DEFAULT '', quantity REAL NOT NULL DEFAULT 1, unit TEXT NOT NULL DEFAULT 'pz', unit_price_cents INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO quotes VALUES ('issued-7', 7, 'Cliente storico', 'Titolo storico', 'issued', '${now}', '${now}', '${now}');
    INSERT INTO quote_items VALUES ('old-item', 'issued-7', 'Voce storica', 2.5, 'ml', 1234, 0);
    PRAGMA user_version = 1;
  `);
  await runMigrations(adapter);
  const oldQuote = await adapter.getFirstAsync<{ client: string; number: number }>("SELECT client, number FROM quotes WHERE id = 'issued-7'");
  const oldItem = await adapter.getFirstAsync<{ unit: string; quantity: number }>("SELECT unit, quantity FROM quote_items WHERE id = 'old-item'");
  assert.deepEqual(oldQuote, { client: 'Cliente storico', number: 7 });
  assert.deepEqual(oldItem, { unit: 'ml', quantity: 2.5 });
  assert.deepEqual(await adapter.getFirstAsync("SELECT client_address, site_address FROM quotes WHERE id='issued-7'"),{client_address:'',site_address:''});
  assert.equal((await adapter.getFirstAsync<{ next_number: number }>("SELECT next_number FROM number_sequences WHERE name = 'quotes'"))?.next_number, undefined);
  assert.deepEqual(await adapter.getFirstAsync("SELECT business_name, default_validity_days FROM business_profiles WHERE id = 1"), { business_name: '', default_validity_days: 30 });
  await runMigrations(adapter);
  assert.equal((await adapter.getFirstAsync<{ next_number: number }>("SELECT next_number FROM number_sequences WHERE name = 'quotes'"))?.next_number, undefined);
  const nextQuote = quote('q-after-migration');
  await insertDraft(adapter, nextQuote);
  assert.equal(await atomicFinalize(adapter, nextQuote), 1);
  assert.equal((await adapter.getFirstAsync<{ next_number: number }>("SELECT next_number FROM number_sequences WHERE name = 'quotes:2026'"))?.next_number, 2);
});

test('Migrazione Standard conserva righe legacy e inizializza unità e aliquote riusabili', async () => {
  const adapter = await migratedDatabase();
  await adapter.runAsync('INSERT INTO measurement_units (code, label, is_custom, created_at) VALUES (?, ?, 1, ?)', 'custom-sacchi', 'sacchi', now);
  await adapter.runAsync('INSERT INTO vat_rates (code, label, rate_basis_points, is_custom, created_at) VALUES (?, ?, ?, 1, ?)', 'vat-6-legacy', '6%', 600, now);
  assert.deepEqual(await adapter.getFirstAsync("SELECT label, is_custom FROM measurement_units WHERE code = 'custom-sacchi'"), {label:'sacchi',is_custom:1});
  assert.deepEqual(await adapter.getFirstAsync("SELECT rate_basis_points, is_custom FROM vat_rates WHERE code = 'vat-6-legacy'"), {rate_basis_points:600,is_custom:1});
  assert.equal((await adapter.getFirstAsync<{count:number}>('SELECT COUNT(*) AS count FROM measurement_units'))?.count, 8);
  assert.equal((await adapter.getFirstAsync<{count:number}>('SELECT COUNT(*) AS count FROM vat_rates'))?.count, 5);
  assert.equal((await adapter.getFirstAsync<{user_version:number}>('PRAGMA user_version'))?.user_version, migrations.at(-1)?.version);
  assert.deepEqual(await adapter.getFirstAsync("SELECT client_address, site_address FROM quotes LIMIT 1"),null);
});

test('Migrazione rubrica conserva bozze e aggiunge conferma, IVA e copia cliente', async () => {
  const adapter=await migratedDatabase(); const value=quote('ux-migration'); await insertDraft(adapter,value);
  const row=await adapter.getFirstAsync<{client_id:string|null;default_vat_basis_points:number;client_email:string;client_phone:string}>('SELECT client_id, default_vat_basis_points, client_email, client_phone FROM quotes WHERE id = ?',value.id);
  const item=await adapter.getFirstAsync<{confirmed:number}>('SELECT confirmed FROM quote_items WHERE quote_id = ?',value.id);
  assert.deepEqual(row,{client_id:null,default_vat_basis_points:1000,client_email:'',client_phone:''}); assert.deepEqual(item,{confirmed:1});
  await adapter.runAsync('INSERT INTO clients (id,name,created_at,updated_at) VALUES (?,?,?,?)','client-1','Cliente salvato',now,now);
  assert.equal((await adapter.getFirstAsync<{name:string}>('SELECT name FROM clients WHERE id = ?','client-1'))?.name,'Cliente salvato');
});

test('Eliminare un cliente conserva la bozza e il preventivo emesso', async () => {
  const adapter=await migratedDatabase(); const draft=quote('client-delete'); await insertDraft(adapter,draft);
  await adapter.runAsync('INSERT INTO clients (id,name,created_at,updated_at) VALUES (?,?,?,?)','client-delete-id','Cliente eliminabile',now,now);
  await adapter.runAsync('UPDATE quotes SET client_id = ? WHERE id = ?','client-delete-id',draft.id);
  await adapter.execAsync('BEGIN IMMEDIATE'); await finalizeQuoteData(adapter,{...draft,clientId:'client-delete-id'},finalizationContext); await adapter.execAsync('COMMIT');
  await adapter.runAsync('DELETE FROM clients WHERE id = ?','client-delete-id');
  assert.deepEqual(await adapter.getFirstAsync('SELECT id, client, client_id, status FROM quotes WHERE id = ?',draft.id),{id:draft.id,client:'Cliente',client_id:null,status:'issued'});
  assert.equal((await adapter.getFirstAsync<{count:number}>('SELECT COUNT(*) AS count FROM issued_quote_snapshots WHERE quote_id = ?',draft.id))?.count,1);
});

test('Catalogo conserva i preventivi ed ammette solo i dati minimi richiesti', async () => {
  const adapter=await migratedDatabase(); const value=quote('catalog-safe'); await insertDraft(adapter,value);
  await adapter.runAsync('INSERT INTO catalog_items (id,title,price_mode,unit_code,unit_label,price_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)','catalog-1','Posa piastrelle','measured','sqm','m²',2490,now,now);
  assert.deepEqual(await adapter.getFirstAsync('SELECT title, price_mode, unit_code, unit_label, price_cents FROM catalog_items WHERE id = ?', 'catalog-1'),{title:'Posa piastrelle',price_mode:'measured',unit_code:'sqm',unit_label:'m²',price_cents:2490});
  assert.equal((await adapter.getFirstAsync<{title:string}>('SELECT title FROM quotes WHERE id = ?',value.id))?.title,'Vecchio titolo');
  await assert.rejects(()=>adapter.runAsync('INSERT INTO catalog_items (id,title,price_mode,unit_code,unit_label,price_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)','catalog-2','posa PIASTRELLE','body',null,'',2490,now,now),/UNIQUE/);
  await assert.rejects(()=>adapter.runAsync('INSERT INTO catalog_items (id,title,price_mode,unit_code,unit_label,price_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)','catalog-3','Senza unità','measured',null,'',100,now,now),/CHECK/);
});

test('Una voce non confermata non altera totale né snapshot emesso', async () => {
  const value=quote('unconfirmed'); value.items.push({...createEmptyQuoteItem('empty',1),confirmed:false,description:'Da completare',unitPriceCents:99999});
  assert.equal(calculateEconomics(value.items,0).subtotalCents,1000);
});

test('Finalizzazione ripetuta emette una volta sola e conserva snapshot immutabile', async () => {
  const adapter = await migratedDatabase();
  const value = quote();
  await insertDraft(adapter, value);
  await adapter.execAsync('BEGIN IMMEDIATE');
  const number = await finalizeQuoteData(adapter, value, { ...finalizationContext, businessProfile: { businessName: 'Impresa prova', logoDataBase64: 'AA==' } });
  await adapter.execAsync('COMMIT');
  assert.equal(number, 1);
  await assert.rejects(() => atomicFinalize(adapter, value), /già stato emesso/);
  assert.deepEqual(await adapter.getFirstAsync("SELECT number, status FROM quotes WHERE id = 'q-1'"), { number: 1, status: 'issued' });
  assert.equal((await adapter.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM issued_quote_snapshots'))?.count, 1);
  const savedSnapshot = await adapter.getFirstAsync<{ snapshot_json: string }>("SELECT snapshot_json FROM issued_quote_snapshots WHERE quote_id = 'q-1'");
  const parsedSnapshot = JSON.parse(savedSnapshot!.snapshot_json);
  assert.equal(parsedSnapshot.schemaVersion, 3);
  assert.equal(parsedSnapshot.documentModel, 'standard-v1');
  assert.equal(parsedSnapshot.businessProfile.businessName, 'Impresa prova');
  assert.equal(parsedSnapshot.items[0].quantityScaled, 10000);
  assert.equal(parsedSnapshot.economics.totalCents, 1220);
  assert.equal((await adapter.getFirstAsync<{ next_number: number }>("SELECT next_number FROM number_sequences WHERE name = 'quotes:2026'"))?.next_number, 2);
  await assert.rejects(() => adapter.runAsync("UPDATE quotes SET title = 'Alterato' WHERE id = 'q-1'"), /immutabili/);
  await assert.rejects(() => adapter.runAsync("UPDATE issued_quote_snapshots SET snapshot_json = '{}' WHERE quote_id = 'q-1'"), /immutabili/);
});

test('Snapshot emesso congela tutti i dati cliente della bozza', async () => {
  const adapter=await migratedDatabase(); const value=quote('client-snapshot'); Object.assign(value,{clientContactName:'Anna',clientPhone:'3331234567',clientEmail:'anna@example.test',clientAddress:'Via Roma 1',clientTaxId:'RSSMRA',clientVatNumber:'IT123'}); await insertDraft(adapter,value);
  await adapter.execAsync('BEGIN IMMEDIATE'); await finalizeQuoteData(adapter,value,finalizationContext); await adapter.execAsync('COMMIT');
  const row=await adapter.getFirstAsync<{snapshot_json:string}>('SELECT snapshot_json FROM issued_quote_snapshots WHERE quote_id = ?',value.id); const snapshot=JSON.parse(row!.snapshot_json);
  assert.deepEqual({client:snapshot.client,contact:snapshot.clientContactName,phone:snapshot.clientPhone,email:snapshot.clientEmail,address:snapshot.clientAddress,tax:snapshot.clientTaxId,vat:snapshot.clientVatNumber},{client:'Cliente',contact:'Anna',phone:'3331234567',email:'anna@example.test',address:'Via Roma 1',tax:'RSSMRA',vat:'IT123'});
});

test('Sequenze annuali ripartono da uno senza rinumerare gli anni precedenti', async () => {
  const adapter = await migratedDatabase();
  const first = quote('q-2026');
  const second = quote('q-2027');
  await insertDraft(adapter, first);
  await insertDraft(adapter, second);
  assert.equal(await atomicFinalize(adapter, first), 1);
  await adapter.execAsync('BEGIN IMMEDIATE');
  const number2027 = await finalizeQuoteData(adapter, second, { ...finalizationContext, clock: { instant: '2027-01-02T09:00:00.000Z', localDate: '2027-01-02', year: 2027, offsetMinutes: 60 }, validUntil: '2027-02-01' });
  await adapter.execAsync('COMMIT');
  assert.equal(number2027, 1);
  assert.deepEqual(await adapter.getFirstAsync("SELECT number, number_year FROM quotes WHERE id = 'q-2026'"), { number: 1, number_year: 2026 });
  assert.deepEqual(await adapter.getFirstAsync("SELECT number, number_year FROM quotes WHERE id = 'q-2027'"), { number: 1, number_year: 2027 });
});

test('Una revisione emessa riusa il numero della root senza avanzare la sequenza locale', async () => {
  const adapter=await migratedDatabase();
  await adapter.runAsync("INSERT INTO number_sequences (name, next_number) VALUES ('quotes:2026', 45)");
  const root=quote('root-revision'); await insertDraft(adapter,root); assert.equal(await atomicFinalize(adapter,root),45);
  const revision={...quote('revision-1'),revisionRootQuoteId:root.id,parentQuoteId:root.id,revisionNumber:1}; await insertDraft(adapter,revision); await adapter.runAsync('UPDATE quotes SET revision_root_quote_id=?, parent_quote_id=?, revision_number=? WHERE id=?',root.id,root.id,1,revision.id);
  await adapter.execAsync('BEGIN IMMEDIATE');
  const revisionClock: EmissionClock={instant:'2026-10-01T08:00:00.000Z',localDate:'2026-10-01',year:2026,offsetMinutes:120};
  const revisionNumber=await finalizeQuoteData(adapter,revision,{...finalizationContext,clock:revisionClock,validUntil:'2026-10-31',businessProfile:{businessName:'Impresa Storica',defaultConditions:'',defaultPaymentTerms:''},canonicalNumber:45,canonicalYear:2026,revision:{rootQuoteId:root.id,parentQuoteId:root.id,revisionNumber:1}});
  await adapter.execAsync('COMMIT');
  assert.equal(revisionNumber,45);
  assert.equal((await adapter.getFirstAsync<{next_number:number}>("SELECT next_number FROM number_sequences WHERE name='quotes:2026'"))?.next_number,46);
  const snapshot=await adapter.getFirstAsync<{snapshot_json:string}>("SELECT snapshot_json FROM issued_quote_snapshots WHERE quote_id='revision-1'");
  const revisionSnapshot=JSON.parse(snapshot!.snapshot_json);
  assert.deepEqual(revisionSnapshot.revisionNumber,1);
  assert.equal(revisionSnapshot.originalIssuedLocalDate,'2026-09-11');
  assert.equal(revisionSnapshot.revisionIssuedLocalDate,'2026-10-01');
  assert.equal(revisionSnapshot.replacedRevisionNumber,0);
  assert.equal(revisionSnapshot.replacedIssuedLocalDate,'2026-09-11');
  assert.equal(revisionSnapshot.validUntil,'2026-10-31');
  assert.equal('documentSignature' in revisionSnapshot,false);
  const revisionHtml=renderStandardHtml(buildFinalDocumentModel(revisionSnapshot));
  assert.match(revisionHtml,/Preventivo 45\/2026 — Revisione 1/);
  assert.match(revisionHtml,/Data emissione originale 2026-09-11/);
  assert.match(revisionHtml,/Data revisione 2026-10-01/);
  assert.match(revisionHtml,/Documento revisionato: Rev\. 0 del 2026-09-11/);
  assert.doesNotMatch(revisionHtml,/Firma dell'impresa/);
  const normal=quote('normal-after-revision'); await insertDraft(adapter,normal); assert.equal(await atomicFinalize(adapter,normal),46);
  assert.equal((await adapter.getFirstAsync<{count:number}>('SELECT COUNT(*) AS count FROM issued_quote_snapshots'))?.count,3);
});

test('Errore durante lo snapshot annulla dati, numero e contatore', async () => {
  const adapter = await migratedDatabase();
  const value = quote();
  await insertDraft(adapter, value);
  await adapter.execAsync("CREATE TRIGGER fail_snapshot BEFORE INSERT ON issued_quote_snapshots BEGIN SELECT RAISE(ABORT, 'errore simulato'); END;");
  await assert.rejects(() => atomicFinalize(adapter, value), /errore simulato/);
  assert.deepEqual(await adapter.getFirstAsync("SELECT number, status, client, title FROM quotes WHERE id = 'q-1'"), { number: null, status: 'draft', client: 'Vecchio cliente', title: 'Vecchio titolo' });
  assert.deepEqual(await adapter.getFirstAsync("SELECT description, unit_price_cents FROM quote_items WHERE quote_id = 'q-1'"), { description: 'Vecchia voce', unit_price_cents: 100 });
  assert.equal((await adapter.getFirstAsync<{ next_number: number }>("SELECT next_number FROM number_sequences WHERE name = 'quotes:2026'"))?.next_number, undefined);
  assert.equal((await adapter.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM issued_quote_snapshots'))?.count, 0);
});

test('Naming PDF è stabile, collision-safe e non accetta caratteri di percorso', () => {
  assert.equal(safeFilePart('../Preventivo: Mario Rossi'),'Preventivo-Mario-Rossi');
  assert.equal(draftPdfName('q/1'),'bozza-q-1.pdf');
  assert.equal(finalPdfName('q/1',7,2026),`preventivo-2026-7-q-1-${STANDARD_RENDERER_VERSION}.pdf`);
});

test('Fallimento PDF post-emissione registra retry senza nuova emissione', async () => {
  const records:unknown[]=[]; let snapshots=0; let renders=0;
  const snapshot={schemaVersion:3,documentModel:'standard-v1',status:'issued',id:'q',number:4,numberYear:2026,issuedLocalDate:'2026-09-12',validUntil:'2026-10-12',client:'Cliente',title:'Titolo',introduction:'',globalDiscountBasisPoints:0,businessProfile:{businessName:'Impresa',defaultConditions:'',defaultPaymentTerms:''},items:[{...createEmptyQuoteItem('i',0),description:'Voce'}],economics:calculateEconomics([{...createEmptyQuoteItem('i',0),description:'Voce'}])};
  const gateway={loadSnapshot:async()=>{snapshots++;return snapshot;},generate:async()=>{renders++;throw new Error('renderer KO');},save:async(record:unknown)=>{records.push(record);}};
  await assert.rejects(()=>generatePdfForIssuedQuote('q',gateway),/renderer KO/);
  await assert.rejects(()=>generatePdfForIssuedQuote('q',gateway),/renderer KO/);
  assert.equal(snapshots,2); assert.equal(renders,2); assert.equal(records.length,2); assert.equal((records[1] as {status:string}).status,'failed');
});

test('Una bozza nuova e vuota può essere scartata, ma non una bozza con dati reali', () => {
  const empty = quote('empty');
  Object.assign(empty, { client:'', clientContactName:'', clientPhone:'', clientEmail:'', clientAddress:'', clientTaxId:'', clientVatNumber:'', siteAddress:'', title:'', introduction:'', globalDiscountBasisPoints:0 });
  empty.items = [{ ...createEmptyQuoteItem('empty-item', 0), confirmed:false }];
  assert.equal(hasMeaningfulDraftContent(empty), false);
  assert.equal(hasMeaningfulDraftContent({ ...empty, title:'Rifacimento bagno' }), true);
  assert.equal(hasMeaningfulDraftContent({ ...empty, introduction:'Intervento da concordare' }), true);
  assert.equal(hasMeaningfulDraftContent({ ...empty, items:[{ ...empty.items[0], description:'Posa rivestimento' }] }), true);
  assert.equal(hasMeaningfulDraftContent({ ...empty, items:[{ ...empty.items[0], unitPriceCents:1250 }] }), true);
});

test('Eliminare una bozza rimuove soltanto la bozza e le sue lavorazioni', async () => {
  const adapter = await migratedDatabase();
  const value = quote('delete-draft');
  await insertDraft(adapter, value);
  await adapter.runAsync("DELETE FROM quotes WHERE id = ? AND status = 'draft'", value.id);
  assert.equal(await adapter.getFirstAsync('SELECT id FROM quotes WHERE id = ?', value.id), null);
  assert.equal(await adapter.getFirstAsync('SELECT id FROM quote_items WHERE quote_id = ?', value.id), null);
});

test('Una bozza con snapshot o export emesso viene rifiutata prima della DELETE con diagnostica di integrità', async () => {
  const adapter = await migratedDatabase();
  const value = quote('corrupt-draft');
  await insertDraft(adapter, value);
  await adapter.runAsync("INSERT INTO issued_quote_snapshots (quote_id, schema_version, snapshot_json, created_at) VALUES (?, 3, '{}', ?)", value.id, now);
  await adapter.runAsync("INSERT INTO document_exports (quote_id, renderer_version, file_uri, status, error_message, created_at, updated_at) VALUES (?, 'standard-v1', NULL, 'failed', NULL, ?, ?)", value.id, now, now);
  await assert.rejects(
    () => assertDraftDeletable(adapter, value.id),
    (error: unknown) => error instanceof DraftDeletionIntegrityError && error.code === 'INTEGRITY_DRAFT_HAS_ISSUED_ARTIFACTS' && error.diagnostic.snapshotCount === 1 && error.diagnostic.documentExportCount === 1,
  );
  assert.notEqual(await adapter.getFirstAsync('SELECT id FROM quotes WHERE id = ?', value.id), null);
});
