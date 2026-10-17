import { QuoteIssueAuthorization, QuoteIssuanceRepository } from './QuoteIssuanceRepository';
export async function authorizeQuoteIssue(repository:QuoteIssuanceRepository,stableQuoteId:string):Promise<QuoteIssueAuthorization>{return repository.authorize(stableQuoteId);}
