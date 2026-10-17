const databasePrefix = 'quotivo-user-';

export function accountDatabaseName(ownerUserId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(ownerUserId)) throw new Error('Identità account locale non valida.');
  return `${databasePrefix}${ownerUserId.toLowerCase()}.db`;
}

export const legacyDatabaseName = 'quotivo-dev-v2.db';

export function createAccountDatabaseScope<T>(open: (databaseName: string) => T) {
  let active: { ownerUserId: string; database: T } | null = null;

  return {
    activate(ownerUserId: string) {
      if (!active || active.ownerUserId !== ownerUserId) active = { ownerUserId, database: open(accountDatabaseName(ownerUserId)) };
      return active.database;
    },
    current() {
      if (!active) throw new Error('Archivio locale non inizializzato per questo account.');
      return active.database;
    },
    deactivate() {
      const database = active?.database ?? null;
      active = null;
      return database;
    },
  };
}
