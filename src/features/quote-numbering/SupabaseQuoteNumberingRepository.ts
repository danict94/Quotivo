import { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '../../data/remote/supabaseClient';
import { QuoteNumbering, QuoteNumberingRepository } from './QuoteNumberingRepository';

const map = (row: { year: number; last_number: number; next_number: number }): QuoteNumbering => ({
  year: row.year,
  lastNumber: row.last_number,
  nextNumber: row.next_number,
});

function logRpcError(operation: string, error: PostgrestError) {
  console.warn('Quote numbering RPC failed', {
    operation,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

function numberingErrorMessage(error: PostgrestError, fallback: string) {
  if (error.message === 'ACCOUNT_DEACTIVATED') return 'Questo account è disattivato. Riattivalo per modificare la numerazione.';
  if (error.message === 'AUTH_REQUIRED' || error.code === '28000') return 'Accedi di nuovo per modificare la numerazione.';
  return fallback;
}

export class SupabaseQuoteNumberingRepository implements QuoteNumberingRepository {
  async get(year: number) {
    const { data, error } = await supabase.rpc('get_quote_sequence', { p_year: year });
    if (error) {
      logRpcError('get_quote_sequence', error);
      throw new Error('Connettiti a Internet per leggere la numerazione.');
    }
    return data?.[0] ? map(data[0]) : null;
  }

  async initialize(year: number, lastNumber: number) {
    const { data, error } = await supabase.rpc('initialize_quote_sequence', { p_year: year, p_last_number: lastNumber });
    if (error) {
      logRpcError('initialize_quote_sequence', error);
      throw new Error(numberingErrorMessage(error, 'Non è stato possibile inizializzare la numerazione.'));
    }
    if (!data?.[0]) throw new Error('Non è stato possibile inizializzare la numerazione.');
    return map(data[0]);
  }

  async advance(year: number, lastNumber: number) {
    const { data, error } = await supabase.rpc('advance_quote_sequence', { p_year: year, p_last_number: lastNumber });
    if (error) {
      logRpcError('advance_quote_sequence', error);
      throw new Error(numberingErrorMessage(error, 'Inserisci un numero maggiore dell’ultimo già registrato.'));
    }
    if (!data?.[0]) throw new Error('Inserisci un numero maggiore dell’ultimo già registrato.');
    return map(data[0]);
  }
}
