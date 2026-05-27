/**
 * Date/Time Utilities
 *
 * Pure helper functions for date formatting, manipulation, and comparison.
 * Zero external dependencies.
 */

export interface Duration {
  milliseconds?: number;
  seconds?: number;
  minutes?: number;
  hours?: number;
  days?: number;
  weeks?: number;
  months?: number;
  years?: number;
}

export type DateDiffUnit =
  | "millisecond"
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year";

export function formatISO(date?: Date | string | number): string {
  const d = toDate(date);
  return d.toISOString();
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelative(
  date: Date | string | number,
  base?: Date | string | number,
): string {
  const d = toDate(date);
  const b = toDate(base);

  const diffSeconds = Math.floor((d.getTime() - b.getTime()) / 1000);
  const absDiff = Math.abs(diffSeconds);
  const isPast = diffSeconds <= 0;

  if (absDiff < 10) return "just now";
  if (absDiff < MINUTE)
    return isPast ? `${absDiff} seconds ago` : `in ${absDiff} seconds`;
  if (absDiff < HOUR) {
    const n = Math.floor(absDiff / MINUTE);
    return isPast
      ? `${n} minute${n > 1 ? "s" : ""} ago`
      : `in ${n} minute${n > 1 ? "s" : ""}`;
  }
  if (absDiff < DAY) {
    const n = Math.floor(absDiff / HOUR);
    return isPast
      ? `${n} hour${n > 1 ? "s" : ""} ago`
      : `in ${n} hour${n > 1 ? "s" : ""}`;
  }
  if (absDiff < WEEK) {
    const n = Math.floor(absDiff / DAY);
    return isPast
      ? `${n} day${n > 1 ? "s" : ""} ago`
      : `in ${n} day${n > 1 ? "s" : ""}`;
  }
  if (absDiff < MONTH) {
    const n = Math.floor(absDiff / WEEK);
    return isPast
      ? `${n} week${n > 1 ? "s" : ""} ago`
      : `in ${n} week${n > 1 ? "s" : ""}`;
  }
  if (absDiff < YEAR) {
    const n = Math.floor(absDiff / MONTH);
    return isPast
      ? `${n} month${n > 1 ? "s" : ""} ago`
      : `in ${n} month${n > 1 ? "s" : ""}`;
  }

  const n = Math.floor(absDiff / YEAR);
  return isPast
    ? `${n} year${n > 1 ? "s" : ""} ago`
    : `in ${n} year${n > 1 ? "s" : ""}`;
}

export function addDuration(
  date: Date | string | number,
  duration: Duration,
): Date {
  const d = new Date(toDate(date));

  const ms =
    (duration.milliseconds ?? 0) +
    (duration.seconds ?? 0) * 1000 +
    (duration.minutes ?? 0) * 60 * 1000 +
    (duration.hours ?? 0) * 60 * 60 * 1000 +
    (duration.days ?? 0) * 24 * 60 * 60 * 1000 +
    (duration.weeks ?? 0) * 7 * 24 * 60 * 60 * 1000;

  d.setTime(d.getTime() + ms);

  if (duration.months) {
    d.setMonth(d.getMonth() + duration.months);
  }

  if (duration.years) {
    d.setFullYear(d.getFullYear() + duration.years);
  }

  return d;
}

const UNIT_MS: Record<DateDiffUnit, number> = {
  millisecond: 1,
  second: 1000,
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

export function dateDiff(
  a: Date | string | number,
  b: Date | string | number,
  unit: DateDiffUnit = "millisecond",
): number {
  const da = toDate(a);
  const db = toDate(b);
  const diff = da.getTime() - db.getTime();
  return Math.floor(diff / UNIT_MS[unit]);
}

export function isExpired(date: Date | string | number, ttlMs: number): boolean {
  const d = toDate(date);
  return d.getTime() + ttlMs < Date.now();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDate(input?: Date | string | number): Date {
  if (!input) return new Date();
  if (input instanceof Date) return input;
  return new Date(input);
}
