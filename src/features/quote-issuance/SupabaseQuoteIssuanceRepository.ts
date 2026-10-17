import { PostgrestError } from '@supabase/supabase-js';
import Constants from 'expo-constants';

import { supabase } from '../../data/remote/supabaseClient';
import { QuoteIssueAuthorization, QuoteIssuanceRepository, RevisionIssueRequest } from './QuoteIssuanceRepository';

const isDevVariant = Constants.expoConfig?.extra?.buildVariant === 'dev';

type RpcDiagnosticError = PostgrestError & { status?: number };
type DevSessionDiagnostic = {
  sessionPresent: boolean;
  userPresent: boolean;
  sessionReadError: { category: string; message: string } | null;
};

async function collectDevSessionDiagnostic(): Promise<DevSessionDiagnostic | null> {
  if (!isDevVariant) return null;

  try {
    const { data, error } = await supabase.auth.getSession();
    return {
      sessionPresent: Boolean(data.session),
      userPresent: Boolean(data.session?.user),
      sessionReadError: error ? { category: error.name ?? 'auth_error', message: error.message } : null,
    };
  } catch (error) {
    return {
      sessionPresent: false,
      userPresent: false,
      sessionReadError: { category: error instanceof Error ? error.name : 'unknown', message: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

function logAuthorizationError(error: RpcDiagnosticError, sessionDiagnostic: DevSessionDiagnostic | null) {
  if (isDevVariant) {
    console.warn('DEV quote issuance diagnostic', {
      phase: 'rpc_error',
      rpc: 'authorize_quote_issue',
      rpcCalled: true,
      ...sessionDiagnostic,
      category: error.name ?? 'PostgrestError',
      status: error.status ?? null,
      code: error.code ?? null,
      message: error.message,
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
  }

  console.warn('Quote issuance RPC failed', {
    operation: 'authorize_quote_issue',
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

function authorizationErrorMessage(error: RpcDiagnosticError, revision = false) {
  if (error.message === 'AUTH_REQUIRED' || error.code === '28000') return 'Accedi di nuovo per emettere il preventivo.';
  if (error.message === 'ACCOUNT_DEACTIVATED') return 'Questo account è disattivato. Riattivalo per emettere preventivi.';
  return revision ? 'Connettiti a Internet per emettere la revisione.' : 'Connettiti a Internet per emettere il preventivo.';
}

export class SupabaseQuoteIssuanceRepository implements QuoteIssuanceRepository {
  async authorize(stableQuoteId: string): Promise<QuoteIssueAuthorization> {
    const sessionDiagnostic = await collectDevSessionDiagnostic();
    const { data, error } = await supabase.rpc('authorize_quote_issue', { stable_quote_id: stableQuoteId });
    if (error) {
      logAuthorizationError(error, sessionDiagnostic);
      throw new Error(authorizationErrorMessage(error));
    }
    const row = data?.[0];
    if (!row) {
      console.warn('Quote issuance RPC returned no authorization row', { operation: 'authorize_quote_issue' });
      throw new Error('Non è stato possibile autorizzare l’emissione.');
    }
    if (row.authorized && (row.sequence_number == null || row.year == null)) {
      console.warn('Quote issuance RPC returned incomplete canonical number', {
        operation: 'authorize_quote_issue',
        authorized: row.authorized,
        reason: row.reason,
        issuanceId: row.issuance_id,
        sequenceNumber: row.sequence_number,
        year: row.year,
        displayNumber: row.display_number,
      });
    }
    return {
      authorized: row.authorized,
      reason: row.reason,
      issuanceId: row.issuance_id,
      usedThisMonth: row.used_this_month,
      monthlyLimit: row.monthly_limit,
      sequenceNumber: row.sequence_number,
      year: row.year,
      displayNumber: row.display_number,
    };
  }

  async authorizeRevision(request: RevisionIssueRequest): Promise<QuoteIssueAuthorization> {
    const { data, error } = await supabase.rpc('authorize_quote_revision_issue', {
      stable_quote_id: request.stableQuoteId,
      root_issuance_id: request.rootIssuanceId,
      parent_issuance_id: request.parentIssuanceId,
      root_client_quote_id: request.rootQuoteId,
      parent_client_quote_id: request.parentQuoteId,
      requested_revision_number: request.revisionNumber,
    });
    if (error) {
      logAuthorizationError(error, null);
      throw new Error(authorizationErrorMessage(error, true));
    }
    const row = data?.[0];
    if (!row) throw new Error('Non è stato possibile autorizzare l’emissione della revisione.');
    if (row.authorized && (row.sequence_number == null || row.year == null)) throw new Error('Numero server non disponibile.');
    return { authorized:row.authorized, reason:row.reason, issuanceId:row.issuance_id, usedThisMonth:row.used_this_month, monthlyLimit:row.monthly_limit, sequenceNumber:row.sequence_number, year:row.year, displayNumber:row.display_number };
  }
}
