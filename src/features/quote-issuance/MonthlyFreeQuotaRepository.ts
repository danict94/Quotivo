import { supabase } from '../../data/remote/supabaseClient';
import { monthlyFreeQuotaFromServerResponse, type MonthlyFreeQuota } from './monthlyFreeQuota';

export type { MonthlyFreeQuota } from './monthlyFreeQuota';

type QuotaRpcResponse = Readonly<{ data: unknown; error: unknown }>;
type ReadMonthlyQuota = () => Promise<QuotaRpcResponse>;

/** Server-authoritative projection shared with quote issuance authorization. */
export class MonthlyFreeQuotaRepository {
  constructor(private readonly readMonthlyQuota: ReadMonthlyQuota = async () => supabase.rpc('get_quote_monthly_quota')) {}

  async getForCurrentUser(): Promise<MonthlyFreeQuota> {
    const { data, error } = await this.readMonthlyQuota();
    const row = Array.isArray(data) ? data[0] : null;
    const quota = monthlyFreeQuotaFromServerResponse(row);
    if (error || !quota) throw new Error('Quota Free non disponibile.');
    return quota;
  }
}
