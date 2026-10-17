import { CanonicalCommercialOutcome, CommercialOutcomeRepository } from '../quote-status/recordManualCommercialOutcome';

export type QuoteShareLifecycle='ACTIVE'|'REVOKED'|'SUPERSEDED';
export type QuoteShareCommercialOutcome=CanonicalCommercialOutcome['outcome'];
export type QuoteShare={id:string;issuanceId:string;lifecycle:QuoteShareLifecycle;commercialOutcome:QuoteShareCommercialOutcome;commercialOutcomeSource?:CanonicalCommercialOutcome['source'];commercialOutcomeDecidedAt?:string|null;openedAt?:string|null;url?:string};
export type QuoteDocument={id:string;issuanceId:string;sha256:string;sizeBytes:number;mimeType:'application/pdf';storagePath:string;createdAt:string};
export interface QuoteSharingRepository extends CommercialOutcomeRepository { create(issuanceId:string,snapshotPayload:unknown):Promise<QuoteShare>; recover(shareId:string):Promise<QuoteShare>; status(shareId:string):Promise<QuoteShare>; revoke(shareId:string):Promise<void>; supersedeParentForRevision(parentIssuanceId:string,revisionIssuanceId:string):Promise<void>; documentStatus(issuanceId:string):Promise<QuoteDocument|null>; uploadDocument(input:{issuanceId:string;pdfBase64:string;sizeBytes:number}):Promise<QuoteDocument>; }
