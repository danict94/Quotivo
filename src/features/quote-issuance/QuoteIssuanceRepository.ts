export type QuoteIssueAuthorization = { authorized:boolean; reason:string; issuanceId:string|null; usedThisMonth:number; monthlyLimit:number|null; sequenceNumber:number|null; year:number|null; displayNumber:string|null };
export type RevisionIssueRequest = { stableQuoteId:string; rootIssuanceId:string; parentIssuanceId:string; rootQuoteId:string; parentQuoteId:string; revisionNumber:number };
export interface QuoteIssuanceRepository { authorize(stableQuoteId:string):Promise<QuoteIssueAuthorization>; authorizeRevision(request:RevisionIssueRequest):Promise<QuoteIssueAuthorization>; }
