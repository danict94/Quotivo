import { Quote } from '../../domain';
import { canCreateRevisionFromIssuedQuote, createRevisionDraftFromIssuedQuote } from '../../database';

export function canCreateRevisionInEditor(quoteId:string) { return canCreateRevisionFromIssuedQuote(quoteId); }
export async function createRevisionForEditor(quoteId:string):Promise<Quote> { return (await createRevisionDraftFromIssuedQuote(quoteId)).draft; }
