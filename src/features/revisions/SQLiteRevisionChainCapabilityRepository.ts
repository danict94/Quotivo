import { RevisionChainCapability, RevisionChainQuote, resolveRevisionChainCapability } from './revisionChainCapability';
import { SQLiteQueryDatabase as Database } from '../../data/local/SQLiteQueryDatabase';

type QuoteRow = {
  id: string;
  status: 'draft' | 'issued';
  revision_root_quote_id: string | null;
  parent_quote_id: string | null;
  revision_number: number;
};

function map(row: QuoteRow): RevisionChainQuote {
  return {
    id: row.id,
    status: row.status,
    revisionRootQuoteId: row.revision_root_quote_id,
    parentQuoteId: row.parent_quote_id,
    revisionNumber: row.revision_number,
  };
}

/** SQLite adapter for the canonical validated revision-chain capability. */
export class SQLiteRevisionChainCapabilityRepository {
  constructor(private readonly db: Database) {}

  async resolve(quoteId: string): Promise<RevisionChainCapability> {
    const sourceRow = await this.db.getFirstAsync<QuoteRow>(
      'SELECT id, status, revision_root_quote_id, parent_quote_id, revision_number FROM quotes WHERE id = ?',
      quoteId,
    );
    if (!sourceRow) return { kind: 'ERROR_NOT_FOUND' };
    const source = map(sourceRow);
    const rootId = source.revisionNumber === 0 ? source.id : source.revisionRootQuoteId;
    if (!rootId) return { kind: 'ERROR_INVALID_LINEAGE' };

    const [rootRow, chainRows] = await Promise.all([
      this.db.getFirstAsync<QuoteRow>(
        'SELECT id, status, revision_root_quote_id, parent_quote_id, revision_number FROM quotes WHERE id = ?',
        rootId,
      ),
      this.db.getAllAsync<QuoteRow>(
        'SELECT id, status, revision_root_quote_id, parent_quote_id, revision_number FROM quotes WHERE id = ? OR revision_root_quote_id = ? ORDER BY revision_number ASC, id ASC',
        rootId,
        rootId,
      ),
    ]);

    return resolveRevisionChainCapability({
      source,
      root: rootRow ? map(rootRow) : undefined,
      chain: chainRows.map(map),
    });
  }
}
