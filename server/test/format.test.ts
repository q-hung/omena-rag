import { describe, expect, it } from 'vitest';
import { addDays, addHours, daysBetween, fmtDate, fmtDateTime, isoDate, utcToday } from '../src/lib/format.ts';

describe('UTC date helpers', () => {
  it('keeps the existing outputs', () => {
    expect(addDays('2026-10-02', 30)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addHours('2026-10-02', 36)).toBe('2026-10-03T12:00:00.000Z');
    expect(addHours('2026-10-02T23:30:00.000Z', 1)).toBe('2026-10-03T00:30:00.000Z');
    expect(daysBetween('2026-10-02', '2026-10-09T23:59:00Z')).toBe(7);
    expect(daysBetween('2026-10-09', '2026-10-02')).toBe(-7);
    expect(fmtDate('2026-10-02')).toBe('2 Oct 2026');
    expect(fmtDateTime('2026-10-02T09:05:00Z')).toBe('2 Oct 2026, 09:05 UTC');
    expect(fmtDate('2026-10-02T23:30:00-05:00')).toBe('3 Oct 2026');
    expect(isoDate(new Date('2026-10-02T23:59:59Z'))).toBe('2026-10-02');
    expect(isoDate('2026-10-02T10:00:00Z')).toBe('2026-10-02');
    expect(utcToday()).toBe(new Date().toISOString().slice(0, 10));
  });

  it('throws on invalid input instead of returning NaN text', () => {
    expect(() => fmtDate('not a date')).toThrow(/Invalid date/);
    expect(() => addDays('2026-13-45', 1)).toThrow(/Invalid date/);
    expect(() => isoDate(new Date('x'))).toThrow(/Invalid date/);
  });
});
