// Demo date D (REQ §5.2). Every date in the prototype is relative to it.
export const D = '2026-10-02';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 864e5;
const utc = (iso) => Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
const pad = (n) => String(n).padStart(2, '0');

export const addDays = (iso, n) => new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);

// Whole UTC days from a to b (dates or datetimes; time of day is ignored).
export const daysBetween = (a, b) => Math.round((utc(b.slice(0, 10)) - utc(a.slice(0, 10))) / DAY);

export function fmtDate(iso) {
  const d = new Date(utc(iso));
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtDateTime(iso) {
  const d = new Date(utc(iso));
  return `${fmtDate(iso)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export const fmtMoney = (minor, currency) =>
  `${currency} ${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Demo clock: the date is pinned to D, the time is real.
export function now() {
  const d = new Date();
  return `${fmtDate(D)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
