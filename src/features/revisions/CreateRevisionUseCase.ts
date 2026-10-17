import { Quote, QuoteItem } from '../../domain';

type IssuedRevisionQuote = Pick<Quote, 'id' | 'status' | 'revisionRootQuoteId' | 'revisionNumber'>;

export interface CreateRevisionRepository {
  loadIssuedQuote(quoteId: string): Promise<IssuedRevisionQuote | null>;
  loadIssuedSnapshot(quoteId: string): Promise<unknown>;
  nextRevisionNumber(rootQuoteId: string): Promise<number>;
  saveRevisionDraft(draft: Quote): Promise<void>;
}

export type CreateRevisionIds = { quoteId(): string; itemId(): string };
export type CreateRevisionResult = { draft: Quote; historicalBusinessProfile: unknown };

type IssuedSnapshot = {
  schemaVersion: number; status: string; id: string; clientId?: string | null; client?: string;
  clientContactName?: string; clientPhone?: string; clientEmail?: string; clientAddress?: string;
  clientTaxId?: string; clientVatNumber?: string; siteAddress?: string; title?: string; introduction?: string;
  defaultVatBasisPoints?: number; globalDiscountBasisPoints?: number; createdAt?: string; validUntil?: string | null;
  items?: QuoteItem[]; businessProfile?: unknown;
};

function text(value: unknown) { return typeof value === 'string' ? value : ''; }
function integer(value: unknown, fallback = 0) { return typeof value === 'number' && Number.isInteger(value) ? value : fallback; }

function draftFromSnapshot(snapshot: IssuedSnapshot, source: IssuedRevisionQuote, rootQuoteId: string, revisionNumber: number, ids: CreateRevisionIds, now: string): Quote {
  if (snapshot.schemaVersion !== 3 || snapshot.status !== 'issued' || snapshot.id !== source.id || !Array.isArray(snapshot.items)) {
    throw new Error('Lo snapshot emesso non è compatibile con una revisione.');
  }
  return {
    id: ids.quoteId(), number: null, numberYear: null,
    // Lo snapshot conserva il testo storico; il collegamento alla rubrica non viene riusato perché può non esistere più.
    clientId: null, client: text(snapshot.client), clientContactName: text(snapshot.clientContactName), clientPhone: text(snapshot.clientPhone), clientEmail: text(snapshot.clientEmail), clientAddress: text(snapshot.clientAddress), clientTaxId: text(snapshot.clientTaxId), clientVatNumber: text(snapshot.clientVatNumber), siteAddress: text(snapshot.siteAddress),
    title: text(snapshot.title), introduction: text(snapshot.introduction), defaultVatBasisPoints: integer(snapshot.defaultVatBasisPoints, 1000),
    revisionRootQuoteId: rootQuoteId, parentQuoteId: source.id, revisionNumber,
    globalDiscountBasisPoints: integer(snapshot.globalDiscountBasisPoints), status: 'draft', createdAt: now, updatedAt: now, issuedAt: null,
    issuedLocalDate: null, issuedOffsetMinutes: null, validUntil: typeof snapshot.validUntil === 'string' ? snapshot.validUntil : null,
    items: snapshot.items.map((item, position) => ({ ...item, id: ids.itemId(), position })),
  };
}

export class CreateRevisionUseCase {
  constructor(private readonly repository: CreateRevisionRepository, private readonly ids: CreateRevisionIds, private readonly now: () => string = () => new Date().toISOString()) {}

  async execute(issuedQuoteId: string): Promise<CreateRevisionResult> {
    const source = await this.repository.loadIssuedQuote(issuedQuoteId);
    if (!source || source.status !== 'issued') throw new Error('Puoi revisionare soltanto un preventivo emesso.');
    const rootQuoteId = source.revisionNumber === 0 ? source.id : source.revisionRootQuoteId;
    if (!rootQuoteId) throw new Error('La catena revisioni del preventivo emesso non è valida.');
    const nextRevisionNumber = await this.repository.nextRevisionNumber(rootQuoteId);
    if (nextRevisionNumber !== source.revisionNumber + 1) throw new Error('Esiste già una revisione più recente: riparti dall’ultima emissione.');

    const snapshot = await this.repository.loadIssuedSnapshot(source.id) as IssuedSnapshot;
    const draft = draftFromSnapshot(snapshot, source, rootQuoteId, nextRevisionNumber, this.ids, this.now());
    try {
      await this.repository.saveRevisionDraft(draft);
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed: quotes\.revision_root_quote_id, quotes\.revision_number/.test(error.message)) {
        throw new Error('La revisione è stata creata da un’altra operazione. Riapri l’ultima emissione.');
      }
      throw error;
    }
    return { draft, historicalBusinessProfile: snapshot.businessProfile };
  }
}
