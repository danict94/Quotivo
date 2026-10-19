import { QuoteStatus } from '../../domain';

export type RevisionChainQuote = Readonly<{
  id: string;
  status: QuoteStatus;
  revisionRootQuoteId: string | null;
  parentQuoteId: string | null;
  revisionNumber: number;
}>;

export type RevisionChainCapability =
  | { kind: 'CREATE' }
  | { kind: 'RESUME'; draftQuoteId: string }
  | { kind: 'NONE_HISTORICAL' }
  | { kind: 'ERROR_NOT_FOUND' }
  | { kind: 'ERROR_INVALID_LINEAGE' };

function isRevisionNumber(value: number) {
  return Number.isInteger(value) && value >= 0;
}

function invalid(): RevisionChainCapability {
  return { kind: 'ERROR_INVALID_LINEAGE' };
}

function sameQuote(left: RevisionChainQuote, right: RevisionChainQuote) {
  return left.id === right.id
    && left.status === right.status
    && left.revisionRootQuoteId === right.revisionRootQuoteId
    && left.parentQuoteId === right.parentQuoteId
    && left.revisionNumber === right.revisionNumber;
}

/**
 * Validates the complete local revision lineage before exposing an editor action.
 * A Rev.0 is represented in the chain even though it has no stored root id.
 */
export function resolveRevisionChainCapability(input: {
  source: RevisionChainQuote | undefined;
  root: RevisionChainQuote | undefined;
  chain: readonly RevisionChainQuote[];
}): RevisionChainCapability {
  const { source, root, chain } = input;
  if (!source) return { kind: 'ERROR_NOT_FOUND' };
  if (source.status !== 'issued' || !isRevisionNumber(source.revisionNumber)) return invalid();
  if (!root || root.status !== 'issued' || root.revisionNumber !== 0 || root.revisionRootQuoteId !== null || root.parentQuoteId !== null) return invalid();

  const records = new Map<string, RevisionChainQuote>();
  for (const quote of chain) {
    if (records.has(quote.id) || !isRevisionNumber(quote.revisionNumber)) return invalid();
    records.set(quote.id, quote);
  }
  const chainRoot = records.get(root.id);
  const chainSource = records.get(source.id);
  if (!chainRoot || !chainSource || !sameQuote(chainRoot, root) || !sameQuote(chainSource, source)) return invalid();

  const byRevision = new Map<number, RevisionChainQuote>();
  for (const quote of chain) {
    if (byRevision.has(quote.revisionNumber)) return invalid();
    byRevision.set(quote.revisionNumber, quote);

    if (quote.revisionNumber === 0) {
      if (quote.id !== root.id || quote.revisionRootQuoteId !== null || quote.parentQuoteId !== null || quote.status !== 'issued') return invalid();
      continue;
    }
    if (quote.revisionRootQuoteId !== root.id || !quote.parentQuoteId) return invalid();
    const parent = records.get(quote.parentQuoteId);
    if (!parent || parent.revisionNumber !== quote.revisionNumber - 1) return invalid();
    if (quote.status === 'issued' && parent.status !== 'issued') return invalid();
  }

  for (let revision = 0; revision <= byRevision.size - 1; revision += 1) {
    if (!byRevision.has(revision)) return invalid();
  }

  const drafts = chain.filter((quote) => quote.status === 'draft');
  if (drafts.length > 1) return invalid();
  const draft = drafts[0];
  if (draft) {
    const latestNumber = byRevision.size - 1;
    if (draft.revisionNumber !== latestNumber || !draft.parentQuoteId) return invalid();
    const parent = records.get(draft.parentQuoteId);
    if (!parent || parent.status !== 'issued' || parent.revisionNumber !== draft.revisionNumber - 1) return invalid();
  }

  const issued = chain.filter((quote) => quote.status === 'issued');
  const latestIssued = issued.reduce((latest, quote) => quote.revisionNumber > latest.revisionNumber ? quote : latest, root);
  if (source.id !== latestIssued.id) return { kind: 'NONE_HISTORICAL' };
  if (draft) return { kind: 'RESUME', draftQuoteId: draft.id };
  return { kind: 'CREATE' };
}
