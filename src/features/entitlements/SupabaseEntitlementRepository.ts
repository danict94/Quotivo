import { supabase } from '../../data/remote/supabaseClient';
import { Entitlement } from './Entitlement';
import { EntitlementRepository } from './EntitlementRepository';

type Grant = { access_level: 'FREE' | 'PRO'; starts_at: string; ends_at: string | null; revoked_at: string | null };

export class SupabaseEntitlementRepository implements EntitlementRepository {
  async getForCurrentUser(): Promise<Entitlement> {
    const { data, error } = await supabase.from('entitlement_grants').select('access_level, starts_at, ends_at, revoked_at');

    if (error) throw new Error('Entitlement non disponibile.');
    const now = Date.now();
    const activePro = (data as Grant[]).find((grant) => grant.access_level === 'PRO'
      && grant.revoked_at === null && new Date(grant.starts_at).getTime() <= now
      && (grant.ends_at === null || new Date(grant.ends_at).getTime() >= now));

    return {
      plan: activePro ? 'PRO' : 'FREE',
      status: 'ACTIVE',
      validFrom: activePro?.starts_at ?? new Date(0).toISOString(),
      validUntil: activePro?.ends_at ?? null,
    };
  }
}
