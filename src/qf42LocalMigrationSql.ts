export const qf42OperationalRestoreSql = `
  CREATE TABLE quote_share_restore_cache (share_id TEXT PRIMARY KEY NOT NULL, issuance_id TEXT NOT NULL, lifecycle TEXT NOT NULL CHECK (lifecycle IN ('ACTIVE','SUPERSEDED','REVOKED')), opened_at TEXT, created_at TEXT NOT NULL);
  CREATE INDEX quote_share_restore_cache_issuance ON quote_share_restore_cache(issuance_id, created_at DESC);
  CREATE TABLE operational_restore_issues (kind TEXT NOT NULL CHECK (kind = 'ISSUANCE_MISSING_SNAPSHOT'), issuance_id TEXT PRIMARY KEY NOT NULL, detected_at TEXT NOT NULL);
`;
export const qf42FileDurabilitySql = `
  CREATE TABLE remote_file_assets (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('LOGO','PDF','DOCX')), asset_key TEXT NOT NULL UNIQUE, issuance_id TEXT, quote_id TEXT, storage_path TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK (size_bytes > 0), sha256 TEXT NOT NULL, created_at TEXT NOT NULL, local_uri TEXT, sync_state TEXT NOT NULL CHECK (sync_state IN ('SYNCED','MISSING_LOCAL','PENDING_UPLOAD')), UNIQUE(kind, quote_id));
  CREATE TABLE issued_docx_exports (quote_id TEXT PRIMARY KEY NOT NULL REFERENCES quotes(id) ON DELETE CASCADE, file_uri TEXT, status TEXT NOT NULL CHECK (status IN ('ready','failed')), error_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE file_durability_issues (asset_key TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL CHECK (code IN ('LEGACY_FILE_MISSING','REMOTE_FILE_UNAVAILABLE')), detected_at TEXT NOT NULL);
`;
