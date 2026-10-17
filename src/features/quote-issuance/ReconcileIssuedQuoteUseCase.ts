export type CanonicalIssuance={ownerUserId:string;clientQuoteId:string;revisionNumber:number;number:number;year:number;issuedAt:string;documentPresent:boolean};
export type LocalIssuedCandidate={id:string;ownerUserId:string;status:'draft'|'issued';revisionNumber:number;snapshotCount:number;exportCount:number;number:number|null;year:number|null};
export interface ReconcileIssuedQuoteLocalRepository { load(quoteId:string):Promise<LocalIssuedCandidate|null>; transact<T>(work:()=>Promise<T>):Promise<T>; apply(quoteId:string,issuance:CanonicalIssuance):Promise<void>; verify(quoteId:string,issuance:CanonicalIssuance):Promise<boolean>; foreignKeyCheck():Promise<boolean>; }
export interface ReconcileIssuedQuoteRemoteRepository { findByClientQuoteId(quoteId:string,revisionNumber:number):Promise<CanonicalIssuance[]>; }
export class ReconcileIssuedQuoteUseCase {
  constructor(private readonly local:ReconcileIssuedQuoteLocalRepository,private readonly remote:ReconcileIssuedQuoteRemoteRepository){}
  async execute(ownerUserId:string,quoteId:string){
    const local=await this.local.load(quoteId); if(!local)throw new Error('RECONCILIATION_LOCAL_QUOTE_NOT_FOUND');
    if(local.ownerUserId!==ownerUserId)throw new Error('RECONCILIATION_LOCAL_OWNER_MISMATCH');
    if(local.status==='issued') return {repaired:false,idempotent:true};
    if(local.snapshotCount!==1||local.exportCount!==1)throw new Error('RECONCILIATION_LOCAL_ARTIFACTS_INVALID');
    const found=await this.remote.findByClientQuoteId(quoteId,local.revisionNumber); if(found.length!==1)throw new Error(found.length?'RECONCILIATION_REMOTE_MULTIPLE_ISSUANCES':'RECONCILIATION_REMOTE_ISSUANCE_NOT_FOUND');
    const remote=found[0]; if(remote.ownerUserId!==ownerUserId)throw new Error('RECONCILIATION_REMOTE_OWNER_MISMATCH');
    if(remote.clientQuoteId!==quoteId||remote.revisionNumber!==local.revisionNumber)throw new Error('RECONCILIATION_REMOTE_CONTEXT_MISMATCH');
    if(!remote.documentPresent||!Number.isInteger(remote.number)||remote.number<1||!Number.isInteger(remote.year)||!remote.issuedAt)throw new Error('RECONCILIATION_REMOTE_ISSUANCE_INVALID');
    await this.local.transact(async()=>{await this.local.apply(quoteId,remote);if(!await this.local.verify(quoteId,remote)||!await this.local.foreignKeyCheck())throw new Error('RECONCILIATION_POSTCHECK_FAILED');});
    return {repaired:true,idempotent:false};
  }
}
