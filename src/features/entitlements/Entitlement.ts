export type EntitlementPlan = 'FREE' | 'PRO';

export type Entitlement = {
  plan: EntitlementPlan;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  validFrom: string;
  validUntil: string | null;
};

export function isEntitlementActive(entitlement: Entitlement, now = new Date()): boolean {
  if (entitlement.status !== 'ACTIVE') return false;
  return new Date(entitlement.validFrom).getTime() <= now.getTime()
    && (entitlement.validUntil === null || new Date(entitlement.validUntil).getTime() >= now.getTime());
}
