import { QuoteIssueAuthorization, QuoteIssuanceRepository, RevisionIssueRequest } from './QuoteIssuanceRepository';

export function authorizeQuoteRevisionIssue(repository: QuoteIssuanceRepository, request: RevisionIssueRequest): Promise<QuoteIssueAuthorization> {
  return repository.authorizeRevision(request);
}
