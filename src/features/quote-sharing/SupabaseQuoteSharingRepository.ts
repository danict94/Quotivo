import { supabase } from '../../data/remote/supabaseClient';
import { QuoteDocument, QuoteShare, QuoteSharingRepository } from './QuoteSharingRepository';
import { CanonicalCommercialOutcome, CommercialOutcomeRemoteError, ManualCommercialOutcome } from '../quote-status/recordManualCommercialOutcome';

function map(value: unknown): QuoteShare {
  const envelope = value as { share?: Record<string, unknown>; url?: unknown };
  const share = envelope.share ?? value as Record<string, unknown>;
  return { id: String(share.share_id ?? share.id), issuanceId: String(share.issuance_id ?? share.quote_issuance_id), lifecycle: share.lifecycle as QuoteShare['lifecycle'], commercialOutcome: share.commercial_outcome as QuoteShare['commercialOutcome'], commercialOutcomeSource: (share.outcome_source ?? share.source ?? null) as QuoteShare['commercialOutcomeSource'], commercialOutcomeDecidedAt: typeof (share.outcome_decided_at ?? share.decided_at) === 'string' ? String(share.outcome_decided_at ?? share.decided_at) : null, openedAt: typeof share.opened_at === 'string' ? share.opened_at : null, url: typeof envelope.url === 'string' ? envelope.url : undefined };
}

function mapCanonicalOutcome(value: unknown): CanonicalCommercialOutcome {
  const outcome = value as Record<string, unknown>;
  const status = outcome.outcome;
  if (status !== 'PENDING' && status !== 'ACCEPTED' && status !== 'REJECTED') throw new Error('Risposta esito commerciale non valida.');
  const source = outcome.source;
  if (source !== 'MANUAL' && source !== 'PUBLIC_LINK' && source !== null) throw new Error('Fonte esito commerciale non valida.');
  return { outcome: status, source, decidedAt: typeof outcome.decided_at === 'string' ? outcome.decided_at : null };
}

type FunctionFailure = { name?: string; context?: { status?: number; clone?: () => { json: () => Promise<unknown> } } };

function userErrorMessage(code: string | null, status?: number, network = false) {
  if (network) return 'Non è stato possibile raggiungere il servizio Quotivo. Verifica la connessione e riprova.';
  if (code === 'ACCOUNT_DEACTIVATED') return 'Questo account è disattivato. Riattivalo per usare le funzioni Quotivo.';
  if (code === 'PRO_REQUIRED') return 'Invia con Quotivo è disponibile con Quotivo Pro.';
  if (code === 'AUTH_REQUIRED') return 'Accedi di nuovo per usare Invia con Quotivo.';
  if (code === 'REVOKED') return 'Questo link Quotivo è stato revocato.';
  if (code === 'SUPERSEDED') return 'Questo link Quotivo è stato sostituito.';
  if (code === 'DECISION_FINAL') return 'Il preventivo ha già una risposta definitiva.';
  if (code === 'NOT_FOUND' || code === 'LINK_UNAVAILABLE' || status === 404) return 'Il link Quotivo non è disponibile.';
  if (status && status >= 500) return 'Il servizio Quotivo non è disponibile al momento. Riprova più tardi.';
  return 'Non è stato possibile creare o recuperare il link Quotivo.';
}

async function logFunctionFailure(action: string, error: unknown) {
  const failure = error as FunctionFailure & { message?: string };
  let code: string | null = null;
  try {
    const payload = await failure.context?.clone?.().json() as { error?: unknown; diagnostic_code?: unknown } | undefined;
    code = typeof payload?.diagnostic_code === 'string' ? payload.diagnostic_code : (typeof payload?.error === 'string' ? payload.error : null);
  } catch {
    // Diagnostic only: a malformed response has no safe structured code.
  }
  console.warn('Quote sharing Function failed', { action, name: failure.name, status: failure.context?.status, code, message: failure.message });
}

async function shareFunctionErrorMessage(error: unknown) {
  const failure = error as FunctionFailure;
  let code: string | null = null;
  try {
    const payload = await failure.context?.clone?.().json() as { error?: unknown } | undefined;
    code = typeof payload?.error === 'string' ? payload.error : null;
  } catch {
    // The HTTP status below remains sufficient for a safe user-facing message.
  }
  return userErrorMessage(code, failure.context?.status, failure.name === 'FunctionsFetchError');
}

async function functionErrorCode(error: unknown): Promise<'ALREADY_DECIDED' | 'OFFLINE' | 'AUTH' | 'RLS' | 'REMOTE_ERROR'> {
  const failure = error as FunctionFailure;
  if (failure.name === 'FunctionsFetchError') return 'OFFLINE';
  try {
    const payload = await failure.context?.clone?.().json() as { error?: unknown } | undefined;
    if (payload?.error === 'ALREADY_DECIDED') return 'ALREADY_DECIDED';
    if (payload?.error === 'AUTH_REQUIRED') return 'AUTH';
    if (payload?.error === 'RLS') return 'RLS';
  } catch { /* fall through to an explicit remote failure */ }
  return 'REMOTE_ERROR';
}

export class SupabaseQuoteSharingRepository implements QuoteSharingRepository {
  private async invoke(action: string, payload: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke('quote-share-owner', { body: { action, ...payload } });
    if (error) {
      if (__DEV__) await logFunctionFailure(action, error);
      throw new Error(await shareFunctionErrorMessage(error));
    }
    if (typeof data?.error === 'string') throw new Error(userErrorMessage(data.error));
    return data;
  }

  private async invokeOutcome(action: string, payload: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke('quote-share-owner', { body: { action, ...payload } });
    if (error) throw new CommercialOutcomeRemoteError(await functionErrorCode(error));
    if (typeof data?.error === 'string') {
      const code = data.error === 'ALREADY_DECIDED' ? 'ALREADY_DECIDED' : data.error === 'AUTH_REQUIRED' ? 'AUTH' : data.error === 'RLS' ? 'RLS' : 'REMOTE_ERROR';
      throw new CommercialOutcomeRemoteError(code);
    }
    return data;
  }

  async create(issuanceId: string, snapshotPayload: unknown) { return map(await this.invoke('create', { issuanceId, snapshotPayload })); }
  async recover(shareId: string) { return map(await this.invoke('recover', { shareId })); }
  async status(shareId: string) { return map(await this.invoke('status', { shareId })); }
  async revoke(shareId: string) { await this.invoke('revoke', { shareId }); }
  async supersedeParentForRevision(parentIssuanceId:string,revisionIssuanceId:string) { await this.invoke('supersede-revision-parent', { parentIssuanceId, revisionIssuanceId }); }
  async documentStatus(issuanceId:string) { const data=await this.invoke('document-status',{issuanceId}); return data.document?{id:data.document.id,issuanceId:data.document.issuance_id,sha256:data.document.sha256,sizeBytes:data.document.size_bytes,mimeType:data.document.mime_type,storagePath:data.document.storage_path,createdAt:data.document.created_at} as QuoteDocument:null; }
  async uploadDocument(input:{issuanceId:string;pdfBase64:string;sizeBytes:number}) { const data=await this.invoke('upload-document',input); const d=data.document; return {id:d.id,issuanceId:d.issuance_id,sha256:d.sha256,sizeBytes:d.size_bytes,mimeType:d.mime_type,storagePath:d.storage_path,createdAt:d.created_at} as QuoteDocument; }
  async recordManualOutcome(issuanceId:string,outcome:ManualCommercialOutcome) { return mapCanonicalOutcome((await this.invokeOutcome('record-manual-outcome',{issuanceId,outcome})).outcome); }
  async getCommercialOutcome(issuanceId:string) { return mapCanonicalOutcome((await this.invokeOutcome('commercial-outcome-status',{issuanceId})).outcome); }
}
