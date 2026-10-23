import { Database } from 'sql.js';

/** Shared sql.js adapter for migration and persistence characterization tests. */
export class SqlJsTestAdapter {
  constructor(readonly db: Database) {}
  async execAsync(sql: string) { this.db.run(sql); }
  async runAsync(sql: string, ...params: any[]) { this.db.run(sql, params); return { changes: this.db.getRowsModified() }; }
  async getAllAsync<T>(sql: string, ...params: any[]) {
    const statement = this.db.prepare(sql);
    try { statement.bind(params); const rows: T[] = []; while (statement.step()) rows.push(statement.getAsObject() as T); return rows; } finally { statement.free(); }
  }
  async getFirstAsync<T>(sql: string, ...params: any[]) {
    const statement = this.db.prepare(sql);
    try { statement.bind(params); return statement.step() ? statement.getAsObject() as T : null; } finally { statement.free(); }
  }
}
