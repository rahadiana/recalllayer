import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatISO,
  formatRelative,
  addDuration,
  dateDiff,
  isExpired,
  sleep,
} from "../src/date.js";

describe("formatISO", () => {
  it("returns an ISO string for a given date", () => {
    const date = new Date("2024-01-15T10:30:00Z");
    expect(formatISO(date)).toBe("2024-01-15T10:30:00.000Z");
  });

  it("returns an ISO string for a timestamp", () => {
    const ts = new Date("2024-06-01T12:00:00Z").getTime();
    const iso = formatISO(ts);
    expect(iso).toMatch(/^2024-06-01T12:00:00\.000Z$/);
  });

  it("returns an ISO string for an ISO string input", () => {
    expect(formatISO("2024-03-15T08:00:00Z")).toBe("2024-03-15T08:00:00.000Z");
  });

  it("defaults to now when no argument given", () => {
    const iso = formatISO();
    expect(iso).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});

describe("formatRelative", () => {
  it('returns "just now" for less than 10 seconds', () => {
    const now = new Date();
    expect(formatRelative(now, now)).toBe("just now");
    expect(formatRelative(new Date(now.getTime() - 5000), now)).toBe("just now");
  });

  it("returns seconds ago", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    const past = new Date(now.getTime() - 15 * 1000);
    expect(formatRelative(past, now)).toBe("15 seconds ago");
  });

  it("returns minutes ago", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    const past = new Date(now.getTime() - 5 * 60 * 1000);
    expect(formatRelative(past, now)).toBe("5 minutes ago");
  });

  it("returns 1 minute ago (singular)", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    const past = new Date(now.getTime() - 60 * 1000);
    expect(formatRelative(past, now)).toBe("1 minute ago");
  });

  it("returns hours ago", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    const past = new Date(now.getTime() - 3 * 3600 * 1000);
    expect(formatRelative(past, now)).toBe("3 hours ago");
  });

  it("returns days ago", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    const past = new Date(now.getTime() - 2 * 86400 * 1000);
    expect(formatRelative(past, now)).toBe("2 days ago");
  });

  it("returns weeks ago", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    const past = new Date(now.getTime() - 10 * 86400 * 1000);
    expect(formatRelative(past, now)).toBe("1 week ago");
  });

  it("returns months ago", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    const past = new Date(now.getTime() - 45 * 86400 * 1000);
    expect(formatRelative(past, now)).toBe("1 month ago");
  });

  it("returns years ago", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    const past = new Date(now.getTime() - 400 * 86400 * 1000);
    expect(formatRelative(past, now)).toBe("1 year ago");
  });

  it("returns future times with 'in' prefix", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    const future = new Date(now.getTime() + 2 * 3600 * 1000);
    expect(formatRelative(future, now)).toBe("in 2 hours");
  });

  it("defaults base to now", () => {
    const past = new Date(Date.now() - 30 * 1000);
    const result = formatRelative(past);
    expect(result).toMatch(/ago$/);
  });

  it("accepts timestamp and ISO string inputs", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    const past = new Date(now.getTime() - 60000);
    expect(formatRelative(past.getTime(), now.getTime())).toBe("1 minute ago");
    expect(formatRelative(past.toISOString(), now.toISOString())).toBe("1 minute ago");
  });
});

describe("addDuration", () => {
  const base = new Date("2024-01-01T00:00:00Z");

  it("adds milliseconds", () => {
    const result = addDuration(base, { milliseconds: 500 });
    expect(result.getTime()).toBe(base.getTime() + 500);
  });

  it("adds seconds", () => {
    const result = addDuration(base, { seconds: 30 });
    expect(result.getTime()).toBe(base.getTime() + 30000);
  });

  it("adds minutes", () => {
    const result = addDuration(base, { minutes: 5 });
    expect(result.getTime()).toBe(base.getTime() + 5 * 60 * 1000);
  });

  it("adds hours", () => {
    const result = addDuration(base, { hours: 2 });
    expect(result.getTime()).toBe(base.getTime() + 2 * 3600 * 1000);
  });

  it("adds days", () => {
    const result = addDuration(base, { days: 7 });
    expect(result.getTime()).toBe(base.getTime() + 7 * 86400 * 1000);
  });

  it("adds weeks", () => {
    const result = addDuration(base, { weeks: 2 });
    expect(result.getTime()).toBe(base.getTime() + 14 * 86400 * 1000);
  });

  it("adds months", () => {
    const result = addDuration(base, { months: 1 });
    expect(result.getUTCMonth()).toBe(1);
    expect(result.getUTCDate()).toBe(1);
  });

  it("adds years", () => {
    const result = addDuration(base, { years: 1 });
    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(0);
    expect(result.getUTCDate()).toBe(1);
  });

  it("adds multiple units together", () => {
    const result = addDuration(base, { hours: 1, minutes: 30 });
    expect(result.getTime()).toBe(base.getTime() + 90 * 60 * 1000);
  });

  it("does not mutate the original date", () => {
    const original = new Date(base);
    addDuration(base, { days: 5 });
    expect(base.getTime()).toBe(original.getTime());
  });

  it("handles negative durations", () => {
    const result = addDuration(base, { days: -1 });
    expect(result.getTime()).toBe(base.getTime() - 86400 * 1000);
  });
});

describe("dateDiff", () => {
  const a = new Date("2024-01-10T00:00:00Z");
  const b = new Date("2024-01-01T00:00:00Z");

  it("calculates difference in milliseconds", () => {
    expect(dateDiff(a, b, "millisecond")).toBe(9 * 86400 * 1000);
  });

  it("calculates difference in seconds", () => {
    expect(dateDiff(a, b, "second")).toBe(9 * 86400);
  });

  it("calculates difference in minutes", () => {
    expect(dateDiff(a, b, "minute")).toBe(9 * 1440);
  });

  it("calculates difference in hours", () => {
    expect(dateDiff(a, b, "hour")).toBe(9 * 24);
  });

  it("calculates difference in days", () => {
    expect(dateDiff(a, b, "day")).toBe(9);
  });

  it("calculates difference in weeks", () => {
    expect(dateDiff(a, b, "week")).toBe(1);
  });

  it("defaults to milliseconds", () => {
    expect(dateDiff(a, b)).toBe(9 * 86400 * 1000);
  });

  it("returns negative when a < b", () => {
    expect(dateDiff(b, a, "day")).toBe(-9);
  });
});

describe("isExpired", () => {
  it("returns true when TTL has passed", () => {
    const past = new Date(Date.now() - 10_000);
    expect(isExpired(past, 5_000)).toBe(true);
  });

  it("returns false when TTL has not passed", () => {
    const now = new Date();
    expect(isExpired(now, 60_000)).toBe(false);
  });

  it("returns false when exactly at TTL boundary (within ms race)", () => {
    const justNow = new Date(Date.now() - 5000);
    expect(isExpired(justNow, 10_000)).toBe(false);
    expect(isExpired(justNow, 4000)).toBe(true);
  });
});

describe("sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the specified time", async () => {
    const promise = sleep(1000);
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    expect(resolved).toBe(true);
  });

  it("resolves immediately for 0ms", async () => {
    const promise = sleep(0);
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.toBeUndefined();
  });
});
