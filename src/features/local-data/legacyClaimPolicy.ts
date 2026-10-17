export type LegacyClaimRecord = { ownerUserId: string; status: 'claiming' | 'claimed' } | null;
export type LegacyDataClaimAvailability = 'available' | 'claimed' | 'unavailable';

export function resolveLegacyDataClaimAvailability(input: {
  ownerUserId: string;
  existingClaim: LegacyClaimRecord;
  legacyHasData: boolean;
  accountHasData: boolean;
}): LegacyDataClaimAvailability {
  if (input.existingClaim) {
    return input.existingClaim.ownerUserId === input.ownerUserId && input.existingClaim.status === 'claiming'
      ? 'available'
      : 'claimed';
  }
  return input.legacyHasData && !input.accountHasData ? 'available' : 'unavailable';
}
