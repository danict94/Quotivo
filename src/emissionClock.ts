export type EmissionClock = {
  instant: string;
  localDate: string;
  year: number;
  offsetMinutes: number;
};

function pad(value: number) { return String(value).padStart(2, '0'); }

export function captureEmissionClock(date = new Date()): EmissionClock {
  if (!Number.isFinite(date.getTime())) throw new Error('Data di emissione non valida.');
  const year = date.getFullYear();
  if (year < 2000 || year > 9999) throw new Error('Anno di emissione fuori intervallo.');
  return {
    instant: date.toISOString(),
    localDate: `${year}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    year,
    offsetMinutes: -date.getTimezoneOffset(),
  };
}

export function addCalendarDays(localDate: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !Number.isSafeInteger(days) || days < 1 || days > 3650) throw new Error('Validità non valida.');
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function formatQuoteNumber(number: number | null, year: number | null) {
  if (number === null) return '—';
  return year === null ? String(number) : `${number}/${year}`;
}
