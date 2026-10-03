// Date and money formatting (CTX-03). Everything is UTC; the model receives
// these as finished values and is told not to recompute them.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

const utc = (iso: string): number => Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
const pad = (n: number): string => String(n).padStart(2, '0');

export const isoDate = (value: Date | string): string =>
  (typeof value === 'string' ? new Date(utc(value)) : value).toISOString().slice(0, 10);

export const addDays = (iso: string, days: number): string =>
  new Date(utc(iso) + days * DAY_MS).toISOString().slice(0, 10);

export const addHours = (iso: string, hours: number): string =>
  new Date(utc(iso) + hours * 3_600_000).toISOString();

/** Whole UTC days from `a` to `b`; the time of day is ignored. */
export const daysBetween = (a: string, b: string): number =>
  Math.round((utc(b.slice(0, 10)) - utc(a.slice(0, 10))) / DAY_MS);

export function fmtDate(iso: string): string {
  const d = new Date(utc(iso));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(utc(iso));
  return `${fmtDate(iso)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export const fmtMoney = (amountMinor: number, currency: string): string =>
  `${currency} ${(amountMinor / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const utcToday = (): string => new Date().toISOString().slice(0, 10);
