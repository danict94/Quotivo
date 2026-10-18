import { Quote } from '../../domain';
import { createRevisionDraftFromIssuedQuote, getRevisionEditorAction } from '../../database';

export function getRevisionActionInEditor(quoteId:string) { return getRevisionEditorAction(quoteId); }
export async function createRevisionForEditor(quoteId:string):Promise<Quote> { return (await createRevisionDraftFromIssuedQuote(quoteId)).draft; }
