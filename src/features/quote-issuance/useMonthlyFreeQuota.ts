import { useEffect, useState } from 'react';

import { MonthlyFreeQuotaRepository } from './MonthlyFreeQuotaRepository';
import type { MonthlyFreeQuota } from './monthlyFreeQuota';

const repository = new MonthlyFreeQuotaRepository();

/** Shared client state for the server-authoritative monthly quota projection. */
export function useMonthlyFreeQuota() {
  const [quota, setQuota] = useState<MonthlyFreeQuota | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    repository.getForCurrentUser()
      .then((value) => { if (!cancelled) setQuota(value); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Quota Free non disponibile.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { quota, error, loading } as const;
}
