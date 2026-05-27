import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  retry,
  calculateDelay,
  withExponentialBackoff,
  calculateJitter,
} from "../src/retry.js";

describe("retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves immediately on first success", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await retry(fn);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(0);
  });

  it("passes attempt number to the function", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValue("ok");

    const promise = retry(fn, { maxRetries: 3, baseDelayMs: 1, strategy: "constant" });

    vi.advanceTimersByTimeAsync(1);
    vi.advanceTimersByTimeAsync(1);

    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenNthCalledWith(1, 0);
    expect(fn).toHaveBeenNthCalledWith(2, 1);
    expect(fn).toHaveBeenNthCalledWith(3, 2);
  });

  it("throws after exhausting maxRetries", async () => {
    const error = new Error("always fails");
    const fn = vi.fn().mockRejectedValue(error);

    const promise = retry(fn, { maxRetries: 2, baseDelayMs: 1, strategy: "constant" });

    vi.advanceTimersByTimeAsync(1);
    vi.advanceTimersByTimeAsync(1);

    await expect(promise).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("respects shouldRetry predicate", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("non-retryable"));

    const promise = retry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      shouldRetry: (err) => {
        return (err as Error).message !== "non-retryable";
      },
    });

    await expect(promise).rejects.toThrow("non-retryable");
    expect(fn).toHaveBeenCalledTimes(1); // no retries
  });

  it("calls onRetry callback before each retry", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockResolvedValue("ok");

    const onRetry = vi.fn();

    const promise = retry(fn, { maxRetries: 2, baseDelayMs: 1, strategy: "constant", onRetry });

    // Advance timer for the retry
    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      expect.any(Error),
      1, // attempt number
      expect.any(Number), // delay
    );
  });

  it("uses default config when none provided", async () => {
    const fn = vi.fn().mockResolvedValue("default");
    const result = await retry(fn);
    expect(result).toBe("default");
  });

  it("maxRetries=0 means no retries (only initial attempt)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(retry(fn, { maxRetries: 0, baseDelayMs: 10 })).rejects.toThrow(
      "fail",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("calculateDelay", () => {
  it("exponential strategy doubles each attempt", () => {
    const d0 = calculateDelay({ attempt: 0, baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0, strategy: "exponential" });
    const d1 = calculateDelay({ attempt: 1, baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0, strategy: "exponential" });
    const d2 = calculateDelay({ attempt: 2, baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0, strategy: "exponential" });
    expect(d0).toBe(100);
    expect(d1).toBe(200);
    expect(d2).toBe(400);
  });

  it("linear strategy increases linearly", () => {
    const d0 = calculateDelay({ attempt: 0, baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0, strategy: "linear" });
    const d1 = calculateDelay({ attempt: 1, baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0, strategy: "linear" });
    const d2 = calculateDelay({ attempt: 2, baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0, strategy: "linear" });
    expect(d0).toBe(100);
    expect(d1).toBe(200);
    expect(d2).toBe(300);
  });

  it("constant strategy always returns base delay", () => {
    const d0 = calculateDelay({ attempt: 0, baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0, strategy: "constant" });
    const d5 = calculateDelay({ attempt: 5, baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0, strategy: "constant" });
    expect(d0).toBe(100);
    expect(d5).toBe(100);
  });

  it("caps delay at maxDelayMs", () => {
    const delay = calculateDelay({ attempt: 10, baseDelayMs: 1000, maxDelayMs: 5000, jitterFactor: 0, strategy: "exponential" });
    expect(delay).toBe(5000);
  });

  it("applies jitter when factor > 0", () => {
    // With jitter, the result should vary (probabilistic test)
    const results = new Set<number>();
    for (let i = 0; i < 20; i++) {
      results.add(
        calculateDelay({ attempt: 0, baseDelayMs: 1000, maxDelayMs: 30000, jitterFactor: 0.5, strategy: "exponential" }),
      );
    }
    // With 50% jitter, we should see some variation
    expect(results.size).toBeGreaterThan(1);
  });
});

describe("withExponentialBackoff", () => {
  it("returns baseDelay for attempt 0", () => {
    expect(withExponentialBackoff(0, 1000)).toBe(1000);
  });

  it("doubles each attempt", () => {
    expect(withExponentialBackoff(0, 1000)).toBe(1000);
    expect(withExponentialBackoff(1, 1000)).toBe(2000);
    expect(withExponentialBackoff(2, 1000)).toBe(4000);
    expect(withExponentialBackoff(3, 1000)).toBe(8000);
  });

  it("caps at maxDelayMs", () => {
    expect(withExponentialBackoff(10, 1000, 5000)).toBe(5000);
  });

  it("uses defaults when not specified", () => {
    expect(withExponentialBackoff(0)).toBe(1000);
    expect(withExponentialBackoff(1)).toBe(2000);
  });
});

describe("calculateJitter", () => {
  it("returns exact delay when factor is 0", () => {
    expect(calculateJitter(1000, 0)).toBe(1000);
  });

  it("returns jittered value within range", () => {
    for (let i = 0; i < 50; i++) {
      const result = calculateJitter(1000, 0.1); // ±10%
      expect(result).toBeGreaterThanOrEqual(900);
      expect(result).toBeLessThanOrEqual(1100);
    }
  });

  it("clamps factor to 1", () => {
    for (let i = 0; i < 50; i++) {
      const result = calculateJitter(1000, 2); // clamped to 1
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(2000);
    }
  });

  it("handles negative factor", () => {
    expect(calculateJitter(1000, -0.5)).toBe(1000);
  });
});
