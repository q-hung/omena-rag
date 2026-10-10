// Date and money formatting (CTX-03). Everything is UTC; the model receives
// these as finished values and is told not to recompute them.

import { DateTime } from 'luxon';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The one place a string or Date becomes a UTC DateTime. Throws on anything unparseable. */
function utc(value: Date | string): DateTime {
  const dt = typeof value === 'string' ? DateTime.fromISO(value, { zone: 'utc' }) : DateTime.fromJSDate(value, { zone: 'utc' });
  if (!dt.isValid) {
    throw new Error(`Invalid date: ${String(value)}`);
  }
  return dt;
}
const pad = (n: number): string => String(n).padStart(2, '0');

export const isoDate = (value: Date | string): string => utc(value).toISODate()!;

export const addDays = (iso: string, days: number): string => utc(iso).plus({ days }).toISODate()!;

export const addHours = (iso: string, hours: number): string => utc(iso).plus({ hours }).toISO()!;

/** Whole UTC days from `a` to `b`; the time of day is ignored. */
export const daysBetween = (a: string, b: string): number =>
  Math.round(utc(b.slice(0, 10)).diff(utc(a.slice(0, 10)), 'days').days);

export function fmtDate(iso: string): string {
  const d = utc(iso);
  return `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
}

export function fmtDateTime(iso: string): string {
  const d = utc(iso);
  return `${fmtDate(iso)}, ${pad(d.hour)}:${pad(d.minute)} UTC`;
}

export const fmtMoney = (amountMinor: number, currency: string): string =>
  `${currency} ${(amountMinor / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const utcToday = (): string => DateTime.utc().toISODate()!;
