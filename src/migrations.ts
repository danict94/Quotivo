export type Migration = { version: number; sql: string };

export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS quotes (
        id TEXT PRIMARY KEY NOT NULL,
        number INTEGER UNIQUE,
        client TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        issued_at TEXT,
        CHECK ((status = 'draft' AND number IS NULL AND issued_at IS NULL) OR
               (status = 'issued' AND number IS NOT NULL AND issued_at IS NOT NULL))
      );
      CREATE TABLE IF NOT EXISTS quote_items (
        id TEXT PRIMARY KEY NOT NULL,
        quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        description TEXT NOT NULL DEFAULT '',
        quantity REAL NOT NULL DEFAULT 1 CHECK (quantity >= 0),
        unit TEXT NOT NULL DEFAULT 'pz',
        unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
        position INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS quote_items_quote_position ON quote_items(quote_id, position);
      CREATE TRIGGER IF NOT EXISTS prevent_issued_quote_update BEFORE UPDATE ON quotes WHEN OLD.status = 'issued'
        BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_issued_quote_delete BEFORE DELETE ON quotes WHEN OLD.status = 'issued'
        BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_issued_item_insert BEFORE INSERT ON quote_items WHEN (SELECT status FROM quotes WHERE id = NEW.quote_id) = 'issued'
        BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_issued_item_update BEFORE UPDATE ON quote_items WHEN (SELECT status FROM quotes WHERE id = OLD.quote_id) = 'issued'
        BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_issued_item_delete BEFORE DELETE ON quote_items WHEN (SELECT status FROM quotes WHERE id = OLD.quote_id) = 'issued'
        BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS number_sequences (
        name TEXT PRIMARY KEY NOT NULL,
        next_number INTEGER NOT NULL CHECK (next_number > 0)
      );
      INSERT OR IGNORE INTO number_sequences (name, next_number)
        SELECT 'quotes', COALESCE(MAX(number), 0) + 1 FROM quotes;
      CREATE TABLE IF NOT EXISTS issued_quote_snapshots (
        quote_id TEXT PRIMARY KEY NOT NULL REFERENCES quotes(id),
        schema_version INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS prevent_issued_snapshot_update BEFORE UPDATE ON issued_quote_snapshots
        BEGIN SELECT RAISE(ABORT, 'Gli snapshot emessi sono immutabili'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_issued_snapshot_delete BEFORE DELETE ON issued_quote_snapshots
        BEGIN SELECT RAISE(ABORT, 'Gli snapshot emessi sono immutabili'); END;
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS business_profiles (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        business_name TEXT NOT NULL DEFAULT '',
        tax_id TEXT NOT NULL DEFAULT '',
        vat_number TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        postal_code TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        province TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        website TEXT NOT NULL DEFAULT '',
        default_conditions TEXT NOT NULL DEFAULT '',
        default_validity_days INTEGER NOT NULL DEFAULT 30 CHECK (default_validity_days BETWEEN 1 AND 3650),
        default_payment_terms TEXT NOT NULL DEFAULT '',
        logo_uri TEXT,
        logo_mime_type TEXT,
        logo_original_name TEXT,
        updated_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO business_profiles (id, updated_at) VALUES (1, '1970-01-01T00:00:00.000Z');
    `,
  },
  {
    version: 4,
    sql: `
      DROP TRIGGER IF EXISTS prevent_issued_quote_update;
      DROP TRIGGER IF EXISTS prevent_issued_quote_delete;
      DROP TRIGGER IF EXISTS prevent_issued_item_insert;
      DROP TRIGGER IF EXISTS prevent_issued_item_update;
      DROP TRIGGER IF EXISTS prevent_issued_item_delete;
      DROP TRIGGER IF EXISTS prevent_issued_snapshot_update;
      DROP TRIGGER IF EXISTS prevent_issued_snapshot_delete;

      CREATE TABLE quotes_v4 (
        id TEXT PRIMARY KEY NOT NULL,
        number INTEGER,
        number_year INTEGER,
        client TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        issued_at TEXT,
        issued_local_date TEXT,
        issued_offset_minutes INTEGER,
        valid_until TEXT,
        UNIQUE(number_year, number),
        CHECK ((status = 'draft' AND number IS NULL AND number_year IS NULL AND issued_at IS NULL) OR
               (status = 'issued' AND number IS NOT NULL AND issued_at IS NOT NULL))
      );
      INSERT INTO quotes_v4 (id, number, number_year, client, title, status, created_at, updated_at, issued_at)
        SELECT id, number, NULL, client, title, status, created_at, updated_at, issued_at FROM quotes;

      CREATE TABLE quote_items_v4 (
        id TEXT PRIMARY KEY NOT NULL,
        quote_id TEXT NOT NULL REFERENCES quotes_v4(id) ON DELETE CASCADE,
        description TEXT NOT NULL DEFAULT '', quantity REAL NOT NULL DEFAULT 1 CHECK (quantity >= 0),
        unit TEXT NOT NULL DEFAULT 'pz', unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
        position INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO quote_items_v4 SELECT id, quote_id, description, quantity, unit, unit_price_cents, position FROM quote_items;

      CREATE TABLE issued_quote_snapshots_v4 (
        quote_id TEXT PRIMARY KEY NOT NULL REFERENCES quotes_v4(id), schema_version INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      INSERT INTO issued_quote_snapshots_v4 SELECT quote_id, schema_version, snapshot_json, created_at FROM issued_quote_snapshots;

      DROP TABLE issued_quote_snapshots;
      DROP TABLE quote_items;
      DROP TABLE quotes;
      ALTER TABLE quotes_v4 RENAME TO quotes;
      ALTER TABLE quote_items_v4 RENAME TO quote_items;
      ALTER TABLE issued_quote_snapshots_v4 RENAME TO issued_quote_snapshots;
      CREATE INDEX quote_items_quote_position ON quote_items(quote_id, position);

      CREATE TRIGGER prevent_issued_quote_update BEFORE UPDATE ON quotes WHEN OLD.status = 'issued'
        BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER prevent_issued_quote_delete BEFORE DELETE ON quotes WHEN OLD.status = 'issued'
        BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER prevent_issued_item_insert BEFORE INSERT ON quote_items WHEN (SELECT status FROM quotes WHERE id = NEW.quote_id) = 'issued'
        BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER prevent_issued_item_update BEFORE UPDATE ON quote_items WHEN (SELECT status FROM quotes WHERE id = OLD.quote_id) = 'issued'
        BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER prevent_issued_item_delete BEFORE DELETE ON quote_items WHEN (SELECT status FROM quotes WHERE id = OLD.quote_id) = 'issued'
        BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER prevent_issued_snapshot_update BEFORE UPDATE ON issued_quote_snapshots
        BEGIN SELECT RAISE(ABORT, 'Gli snapshot emessi sono immutabili'); END;
      CREATE TRIGGER prevent_issued_snapshot_delete BEFORE DELETE ON issued_quote_snapshots
        BEGIN SELECT RAISE(ABORT, 'Gli snapshot emessi sono immutabili'); END;

      DELETE FROM number_sequences WHERE name = 'quotes';
    `,
  },
  {
    version: 5,
    sql: `
      ALTER TABLE quotes ADD COLUMN introduction TEXT NOT NULL DEFAULT '';
      ALTER TABLE quotes ADD COLUMN global_discount_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (global_discount_basis_points BETWEEN 0 AND 10000);

      ALTER TABLE quote_items ADD COLUMN short_description TEXT NOT NULL DEFAULT '';
      ALTER TABLE quote_items ADD COLUMN price_mode TEXT NOT NULL DEFAULT 'measured' CHECK (price_mode IN ('measured', 'body'));
      ALTER TABLE quote_items ADD COLUMN quantity_scaled INTEGER;
      ALTER TABLE quote_items ADD COLUMN unit_code TEXT;
      ALTER TABLE quote_items ADD COLUMN body_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (body_price_cents >= 0);
      ALTER TABLE quote_items ADD COLUMN vat_treatment TEXT NOT NULL DEFAULT 'not_applied' CHECK (vat_treatment IN ('rate', 'not_applied'));
      ALTER TABLE quote_items ADD COLUMN vat_rate_basis_points INTEGER;
      ALTER TABLE quote_items ADD COLUMN vat_note TEXT NOT NULL DEFAULT '';
      ALTER TABLE quote_items ADD COLUMN line_discount_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (line_discount_basis_points BETWEEN 0 AND 10000);
      ALTER TABLE quote_items ADD COLUMN technical_details TEXT NOT NULL DEFAULT '';
      ALTER TABLE quote_items ADD COLUMN inclusions TEXT NOT NULL DEFAULT '';
      ALTER TABLE quote_items ADD COLUMN exclusions TEXT NOT NULL DEFAULT '';
      ALTER TABLE quote_items ADD COLUMN is_optional INTEGER NOT NULL DEFAULT 0 CHECK (is_optional IN (0, 1));

      CREATE TABLE measurement_units (
        code TEXT PRIMARY KEY NOT NULL,
        label TEXT NOT NULL,
        is_custom INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
        created_at TEXT NOT NULL
      );
      INSERT INTO measurement_units (code, label, created_at) VALUES
        ('sqm', 'm²', '1970-01-01T00:00:00.000Z'), ('linear_m', 'ml', '1970-01-01T00:00:00.000Z'),
        ('cubic_m', 'm³', '1970-01-01T00:00:00.000Z'), ('piece', 'pz', '1970-01-01T00:00:00.000Z'),
        ('point', 'punti', '1970-01-01T00:00:00.000Z'), ('hour', 'h', '1970-01-01T00:00:00.000Z'),
        ('day', 'gg', '1970-01-01T00:00:00.000Z');

      CREATE TABLE vat_rates (
        code TEXT PRIMARY KEY NOT NULL,
        label TEXT NOT NULL,
        rate_basis_points INTEGER NOT NULL CHECK (rate_basis_points BETWEEN 0 AND 100000),
        is_custom INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
        created_at TEXT NOT NULL
      );
      INSERT INTO vat_rates (code, label, rate_basis_points, created_at) VALUES
        ('vat-4', '4%', 400, '1970-01-01T00:00:00.000Z'), ('vat-5', '5%', 500, '1970-01-01T00:00:00.000Z'),
        ('vat-10', '10%', 1000, '1970-01-01T00:00:00.000Z'), ('vat-22', '22%', 2200, '1970-01-01T00:00:00.000Z');
    `,
  },
  {
    version: 6,
    sql: `
      ALTER TABLE quotes ADD COLUMN client_address TEXT NOT NULL DEFAULT '';
      ALTER TABLE quotes ADD COLUMN site_address TEXT NOT NULL DEFAULT '';
      CREATE TABLE document_exports (
        quote_id TEXT PRIMARY KEY NOT NULL REFERENCES quotes(id),
        renderer_version TEXT NOT NULL,
        file_uri TEXT,
        status TEXT NOT NULL CHECK (status IN ('ready', 'failed')),
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TRIGGER prevent_document_export_delete BEFORE DELETE ON document_exports
        WHEN (SELECT status FROM quotes WHERE id = OLD.quote_id) = 'issued'
        BEGIN SELECT RAISE(ABORT, 'I PDF definitivi emessi non possono essere rimossi dal database'); END;
    `,
  },
  {
    version: 7,
    sql: `
      CREATE TABLE clients (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        contact_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        tax_id TEXT NOT NULL DEFAULT '',
        vat_number TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX clients_name ON clients(name COLLATE NOCASE);
      ALTER TABLE quotes ADD COLUMN client_id TEXT REFERENCES clients(id);
      ALTER TABLE quotes ADD COLUMN default_vat_basis_points INTEGER NOT NULL DEFAULT 1000 CHECK (default_vat_basis_points BETWEEN 0 AND 100000);
      ALTER TABLE quote_items ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 1 CHECK (confirmed IN (0, 1));
    `,
  },
  {
    version: 8,
    sql: `
      ALTER TABLE quotes ADD COLUMN client_contact_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE quotes ADD COLUMN client_phone TEXT NOT NULL DEFAULT '';
      ALTER TABLE quotes ADD COLUMN client_email TEXT NOT NULL DEFAULT '';
      ALTER TABLE quotes ADD COLUMN client_tax_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE quotes ADD COLUMN client_vat_number TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 9,
    sql: `
      CREATE TABLE catalog_items (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL COLLATE NOCASE UNIQUE,
        price_mode TEXT NOT NULL CHECK (price_mode IN ('measured', 'body')),
        unit_code TEXT,
        unit_label TEXT NOT NULL DEFAULT '',
        price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (
          (price_mode = 'measured' AND unit_code IS NOT NULL AND trim(unit_label) <> '') OR
          (price_mode = 'body' AND unit_code IS NULL AND unit_label = '')
        )
      );
      CREATE INDEX catalog_items_title ON catalog_items(title COLLATE NOCASE);
    `,
  },
  {
    version: 10,
    sql: `
      DROP TRIGGER IF EXISTS prevent_issued_quote_update;
      DROP TRIGGER IF EXISTS prevent_issued_quote_delete;
      DROP TRIGGER IF EXISTS prevent_issued_item_insert;
      DROP TRIGGER IF EXISTS prevent_issued_item_update;
      DROP TRIGGER IF EXISTS prevent_issued_item_delete;
      DROP TRIGGER IF EXISTS prevent_issued_snapshot_update;
      DROP TRIGGER IF EXISTS prevent_issued_snapshot_delete;
      DROP TRIGGER IF EXISTS prevent_document_export_delete;

      CREATE TABLE quotes_v10 (
        id TEXT PRIMARY KEY NOT NULL, number INTEGER, number_year INTEGER, client TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        issued_at TEXT, issued_local_date TEXT, issued_offset_minutes INTEGER, valid_until TEXT,
        introduction TEXT NOT NULL DEFAULT '', global_discount_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (global_discount_basis_points BETWEEN 0 AND 10000),
        client_address TEXT NOT NULL DEFAULT '', site_address TEXT NOT NULL DEFAULT '', client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
        default_vat_basis_points INTEGER NOT NULL DEFAULT 1000 CHECK (default_vat_basis_points BETWEEN 0 AND 100000),
        client_contact_name TEXT NOT NULL DEFAULT '', client_phone TEXT NOT NULL DEFAULT '', client_email TEXT NOT NULL DEFAULT '', client_tax_id TEXT NOT NULL DEFAULT '', client_vat_number TEXT NOT NULL DEFAULT '',
        UNIQUE(number_year, number), CHECK ((status = 'draft' AND number IS NULL AND number_year IS NULL AND issued_at IS NULL) OR (status = 'issued' AND number IS NOT NULL AND issued_at IS NOT NULL))
      );
      INSERT INTO quotes_v10 SELECT id,number,number_year,client,title,status,created_at,updated_at,issued_at,issued_local_date,issued_offset_minutes,valid_until,introduction,global_discount_basis_points,client_address,site_address,client_id,default_vat_basis_points,client_contact_name,client_phone,client_email,client_tax_id,client_vat_number FROM quotes;
      CREATE TABLE quote_items_v10 (
        id TEXT PRIMARY KEY NOT NULL, quote_id TEXT NOT NULL REFERENCES quotes_v10(id) ON DELETE CASCADE, description TEXT NOT NULL DEFAULT '', quantity REAL NOT NULL DEFAULT 1 CHECK (quantity >= 0), unit TEXT NOT NULL DEFAULT 'pz', unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0), position INTEGER NOT NULL DEFAULT 0,
        short_description TEXT NOT NULL DEFAULT '', price_mode TEXT NOT NULL DEFAULT 'measured' CHECK (price_mode IN ('measured','body')), quantity_scaled INTEGER, unit_code TEXT, body_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (body_price_cents >= 0), vat_treatment TEXT NOT NULL DEFAULT 'not_applied' CHECK (vat_treatment IN ('rate','not_applied')), vat_rate_basis_points INTEGER, vat_note TEXT NOT NULL DEFAULT '', line_discount_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (line_discount_basis_points BETWEEN 0 AND 10000), technical_details TEXT NOT NULL DEFAULT '', inclusions TEXT NOT NULL DEFAULT '', exclusions TEXT NOT NULL DEFAULT '', is_optional INTEGER NOT NULL DEFAULT 0 CHECK (is_optional IN (0,1)), confirmed INTEGER NOT NULL DEFAULT 1 CHECK (confirmed IN (0,1))
      );
      INSERT INTO quote_items_v10 SELECT id,quote_id,description,quantity,unit,unit_price_cents,position,short_description,price_mode,quantity_scaled,unit_code,body_price_cents,vat_treatment,vat_rate_basis_points,vat_note,line_discount_basis_points,technical_details,inclusions,exclusions,is_optional,confirmed FROM quote_items;
      CREATE TABLE issued_quote_snapshots_v10 (quote_id TEXT PRIMARY KEY NOT NULL REFERENCES quotes_v10(id), schema_version INTEGER NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO issued_quote_snapshots_v10 SELECT quote_id,schema_version,snapshot_json,created_at FROM issued_quote_snapshots;
      CREATE TABLE document_exports_v10 (quote_id TEXT PRIMARY KEY NOT NULL REFERENCES quotes_v10(id), renderer_version TEXT NOT NULL, file_uri TEXT, status TEXT NOT NULL CHECK (status IN ('ready','failed')), error_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO document_exports_v10 SELECT quote_id,renderer_version,file_uri,status,error_message,created_at,updated_at FROM document_exports;
      DROP TABLE document_exports; DROP TABLE issued_quote_snapshots; DROP TABLE quote_items; DROP TABLE quotes;
      ALTER TABLE quotes_v10 RENAME TO quotes; ALTER TABLE quote_items_v10 RENAME TO quote_items; ALTER TABLE issued_quote_snapshots_v10 RENAME TO issued_quote_snapshots; ALTER TABLE document_exports_v10 RENAME TO document_exports;
      CREATE INDEX quote_items_quote_position ON quote_items(quote_id, position);
      CREATE TRIGGER prevent_issued_quote_update BEFORE UPDATE ON quotes WHEN OLD.status = 'issued' BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER prevent_issued_quote_delete BEFORE DELETE ON quotes WHEN OLD.status = 'issued' BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER prevent_issued_item_insert BEFORE INSERT ON quote_items WHEN (SELECT status FROM quotes WHERE id = NEW.quote_id) = 'issued' BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER prevent_issued_item_update BEFORE UPDATE ON quote_items WHEN (SELECT status FROM quotes WHERE id = OLD.quote_id) = 'issued' BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER prevent_issued_item_delete BEFORE DELETE ON quote_items WHEN (SELECT status FROM quotes WHERE id = OLD.quote_id) = 'issued' BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
      CREATE TRIGGER prevent_issued_snapshot_update BEFORE UPDATE ON issued_quote_snapshots BEGIN SELECT RAISE(ABORT, 'Gli snapshot emessi sono immutabili'); END;
      CREATE TRIGGER prevent_issued_snapshot_delete BEFORE DELETE ON issued_quote_snapshots BEGIN SELECT RAISE(ABORT, 'Gli snapshot emessi sono immutabili'); END;
      CREATE TRIGGER prevent_document_export_delete BEFORE DELETE ON document_exports WHEN (SELECT status FROM quotes WHERE id = OLD.quote_id) = 'issued' BEGIN SELECT RAISE(ABORT, 'I PDF definitivi emessi non possono essere rimossi dal database'); END;
    `,
  },
  {
    version: 11,
    sql: `
      DROP TRIGGER IF EXISTS prevent_issued_quote_update;
      CREATE TRIGGER prevent_issued_quote_update BEFORE UPDATE ON quotes
      WHEN OLD.status = 'issued' AND NOT (
        NEW.client_id IS NULL AND OLD.client_id IS NOT NULL AND
        NEW.id IS OLD.id AND NEW.number IS OLD.number AND NEW.number_year IS OLD.number_year AND NEW.client IS OLD.client AND NEW.title IS OLD.title AND NEW.status IS OLD.status AND
        NEW.created_at IS OLD.created_at AND NEW.updated_at IS OLD.updated_at AND NEW.issued_at IS OLD.issued_at AND NEW.issued_local_date IS OLD.issued_local_date AND NEW.issued_offset_minutes IS OLD.issued_offset_minutes AND NEW.valid_until IS OLD.valid_until AND
        NEW.introduction IS OLD.introduction AND NEW.global_discount_basis_points IS OLD.global_discount_basis_points AND NEW.client_address IS OLD.client_address AND NEW.site_address IS OLD.site_address AND NEW.default_vat_basis_points IS OLD.default_vat_basis_points AND
        NEW.client_contact_name IS OLD.client_contact_name AND NEW.client_phone IS OLD.client_phone AND NEW.client_email IS OLD.client_email AND NEW.client_tax_id IS OLD.client_tax_id AND NEW.client_vat_number IS OLD.client_vat_number
      )
      BEGIN SELECT RAISE(ABORT, 'I preventivi emessi sono immutabili'); END;
    `,
  },
];

export interface MigrationDatabase {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
}

export async function runMigrations(db: MigrationDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  const latest = migrations.at(-1)?.version ?? 0;
  if (current > latest) throw new Error(`Database versione ${current} più recente dell'app (${latest}).`);
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    await db.execAsync('BEGIN IMMEDIATE');
    try {
      await db.execAsync(migration.sql);
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
      await db.execAsync('COMMIT');
      current = migration.version;
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  }
}
