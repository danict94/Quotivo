import { Entitlement, EntitlementPlan, isEntitlementActive } from '../entitlements/Entitlement';
import { AppConfig, VersionStatus, versionStatus } from '../versioning/AppConfig';

export type CachedBootstrap = { entitlement: Entitlement; config: AppConfig; validatedAt: string };
/** @public Stato esposto dalla feature bootstrap ai suoi consumer. */
export type ValidationState = 'ONLINE' | 'OFFLINE_GRACE' | 'OFFLINE_EXPIRED' | 'UNAVAILABLE';

export type BootstrapState = {
  status: 'bootstrapping' | 'ready';
  validation: ValidationState;
  entitlement: Entitlement | null;
  effectivePlan: EntitlementPlan;
  config: AppConfig | null;
  version: VersionStatus;
  lastValidatedAt: string | null;
  capabilities: {
    hasPremiumAccess: boolean;
    canUseServerValidatedActions: boolean;
  };
};

export function resolveBootstrap(snapshot: CachedBootstrap | null, appVersion: string, now = new Date(), online = false): BootstrapState {
  if (!snapshot) return {
    status: 'ready', validation: 'UNAVAILABLE', entitlement: null, effectivePlan: 'FREE', config: null,
    version: 'OK', lastValidatedAt: null, capabilities: { hasPremiumAccess: false, canUseServerValidatedActions: false },
  };

  const graceEndsAt = new Date(snapshot.validatedAt).getTime() + snapshot.config.offlineGraceDays * 86_400_000;
  const validation: ValidationState = online ? 'ONLINE' : now.getTime() <= graceEndsAt ? 'OFFLINE_GRACE' : 'OFFLINE_EXPIRED';
  const version = versionStatus(snapshot.config, appVersion);
  const entitlementActive = isEntitlementActive(snapshot.entitlement, now);
  const effectivePlan = entitlementActive ? snapshot.entitlement.plan : 'FREE';
  const serverValidationAllowed = validation !== 'OFFLINE_EXPIRED' && version !== 'UPDATE_REQUIRED' && version !== 'MAINTENANCE';

  return {
    status: 'ready', validation, entitlement: snapshot.entitlement, effectivePlan, config: snapshot.config, version,
    lastValidatedAt: snapshot.validatedAt,
    capabilities: { hasPremiumAccess: effectivePlan !== 'FREE' && online && serverValidationAllowed, canUseServerValidatedActions: serverValidationAllowed },
  };
}
