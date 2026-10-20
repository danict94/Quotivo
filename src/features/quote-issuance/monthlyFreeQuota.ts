export type MonthlyFreeQuota = Readonly<{ usedThisMonth: number; monthlyLimit: number | null; remaining: number | null }>;

export function monthlyFreeQuotaFromServerResponse(value: unknown): MonthlyFreeQuota | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!Number.isInteger(row.used_this_month) || (row.monthly_limit !== null && !Number.isInteger(row.monthly_limit)) || (row.remaining !== null && !Number.isInteger(row.remaining))) return null;
  return { usedThisMonth: row.used_this_month as number, monthlyLimit: row.monthly_limit as number | null, remaining: row.remaining as number | null };
}

export function freeQuotaPresentation(quota: MonthlyFreeQuota) {
  if (quota.monthlyLimit === null || quota.remaining === null) return null;
  return { used: `${quota.usedThisMonth} di ${quota.monthlyLimit} utilizzati`, remaining: `${quota.remaining} disponibili` };
}
