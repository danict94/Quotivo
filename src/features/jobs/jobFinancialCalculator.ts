/** A work day is a domain policy, never a presentation concern. */
const JOB_WORK_DAY_MINUTES = 8 * 60;
const BASIS_POINTS_SCALE = 10_000;

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} deve essere un intero non negativo.`);
}

function divideRoundedHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) throw new Error('Divisione economica non valida.');
  return Number((BigInt(numerator) + BigInt(Math.floor(denominator / 2))) / BigInt(denominator));
}

function divideSignedRoundedHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) throw new Error('Divisione economica non valida.');
  const result = numerator < 0 ? -divideRoundedHalfUp(-numerator, denominator) : divideRoundedHalfUp(numerator, denominator);
  return result === 0 ? 0 : result;
}

export function ratioBasisPoints(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  const value = BigInt(numerator) * BigInt(BASIS_POINTS_SCALE);
  const divisor = BigInt(denominator);
  const rounded = value < 0n ? -((-value + divisor / 2n) / divisor) : (value + divisor / 2n) / divisor;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new Error('Percentuale economica troppo grande.');
  return result;
}

export function centsPerOwnerHour(cents: number, ownerWorkMinutes: number): number | null {
  return ownerWorkMinutes === 0 ? null : divideSignedRoundedHalfUp(cents * 60, ownerWorkMinutes);
}

export function centsPerOwnerDay(cents: number, ownerWorkMinutes: number): number | null {
  return ownerWorkMinutes === 0 ? null : divideSignedRoundedHalfUp(cents * JOB_WORK_DAY_MINUTES, ownerWorkMinutes);
}

/** Rounded to four decimals from integer minutes, for deterministic display and future trends. */
export function workDaysFromMinutes(minutes: number): number {
  assertNonNegativeSafeInteger(minutes, 'Minuti lavorati');
  return divideRoundedHalfUp(minutes * BASIS_POINTS_SCALE, JOB_WORK_DAY_MINUTES) / BASIS_POINTS_SCALE;
}
