/** Minimal local-query contract shared by SQLite-backed feature repositories. */
export type SQLiteQueryDatabase = {
  getFirstAsync<T>(sql: string, ...params: string[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: string[]): Promise<T[]>;
};
