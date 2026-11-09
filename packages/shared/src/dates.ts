// SPDX-License-Identifier: AGPL-3.0-or-later

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today's date (YYYY-MM-DD) in the given IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Slot days are stored as a bitmask: Monday = 1, Tuesday = 2, … Sunday = 64. */
export const ALL_DAYS = 127;

export function dayBit(weekday: number): number {
  return 1 << (weekday - 1);
}

export function slotActiveOn(daysMask: number, isoDate: string): boolean {
  return (daysMask & dayBit(isoWeekday(isoDate))) !== 0;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** "HH:MM" → minutes since midnight. */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/** True when `now` falls inside [start, end); ranges may cross midnight (e.g. 22:00–07:00). */
export function inTimeRange(now: string, start: string | null, end: string | null): boolean {
  if (!start || !end || start === end) return false;
  const n = timeToMinutes(now);
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  return s < e ? n >= s && n < e : n >= s || n < e;
}

/** Current date ("YYYY-MM-DD") and time ("HH:MM") in an IANA time zone. */
export function nowIn(timeZone: string, now: Date = new Date()): { date: string; time: string } {
  let time: string;
  try {
    time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  } catch {
    time = now.toISOString().slice(11, 16);
  }
  return { date: todayIn(timeZone, now), time };
}
