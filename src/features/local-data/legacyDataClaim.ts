import { claimLegacyData, getLegacyDataClaimAvailability } from '../../database';
import { LegacyDataClaimAvailability } from './legacyClaimPolicy';

export type { LegacyDataClaimAvailability };

export async function inspectLegacyDataClaim(ownerUserId: string): Promise<LegacyDataClaimAvailability> {
  return getLegacyDataClaimAvailability(ownerUserId);
}

export async function claimLegacyDataForCurrentAccount(ownerUserId: string) {
  await claimLegacyData(ownerUserId);
}
