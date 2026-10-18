import { Quote } from '../../domain';

export type EditorPrerequisite = 'business-profile' | 'numbering';

export type EditorReturnIntent = {
  quoteId: string;
  prerequisite: EditorPrerequisite;
};

export async function saveDraftBeforePrerequisite(
  quote: Quote,
  prerequisite: EditorPrerequisite,
  saveDraft: (quote: Quote) => Promise<void>,
): Promise<EditorReturnIntent> {
  await saveDraft(quote);
  return { quoteId: quote.id, prerequisite };
}

export function restoreEditorDraft(intent: EditorReturnIntent, quotes: readonly Quote[]): Quote {
  const quote = quotes.find((candidate) => candidate.id === intent.quoteId);
  if (!quote || quote.status !== 'draft') throw new Error('La bozza da riprendere non è disponibile.');
  return quote;
}
