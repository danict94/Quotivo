import { Quote } from '../../domain';
import { createRevisionDraftFromIssuedQuote, getRevisionChainCapability } from '../../database';

export function getRevisionActionInEditor(quoteId:string) { return getRevisionChainCapability(quoteId); }
export async function createRevisionForEditor(quoteId:string):Promise<Quote> { return (await createRevisionDraftFromIssuedQuote(quoteId)).draft; }
