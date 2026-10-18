export type RevisionEditorQuote = {
  id: string;
  status: 'draft' | 'issued';
  revisionRootQuoteId: string | null;
  parentQuoteId: string | null;
  revisionNumber: number;
};

export type RevisionEditorAction =
  | { kind: 'CREATE' }
  | { kind: 'RESUME'; draftQuoteId: string }
  | { kind: 'NONE' };

export function resolveRevisionEditorAction(
  source: RevisionEditorQuote | null,
  latestRevisionNumber: number | null,
  nextDraft: RevisionEditorQuote | null,
): RevisionEditorAction {
  if (!source || source.status !== 'issued') return { kind: 'NONE' };
  const rootQuoteId = source.revisionNumber === 0 ? source.id : source.revisionRootQuoteId;
  if (!rootQuoteId) return { kind: 'NONE' };

  if (
    nextDraft?.status === 'draft'
    && nextDraft.parentQuoteId === source.id
    && nextDraft.revisionRootQuoteId === rootQuoteId
    && nextDraft.revisionNumber === source.revisionNumber + 1
  ) return { kind: 'RESUME', draftQuoteId: nextDraft.id };

  return latestRevisionNumber === source.revisionNumber ? { kind: 'CREATE' } : { kind: 'NONE' };
}
