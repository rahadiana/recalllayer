import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry, RetryPolicy, DEFAULT_RETRY_CONFIG } from "../src/retry.js";
import type { RetryConfig } from "../src/retry.js";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure up to maxRetries", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, { ...DEFAULT_RETRY_CONFIG, maxRetries: 3 });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    const promise = withRetry(fn, { ...DEFAULT_RETRY_CONFIG, maxRetries: 2, jitter: false });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("respects retryableError filter", async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError("not retryable"));

    const config: RetryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      maxRetries: 3,
      retryableError: (err) => err.message !== "not retryable",
    };

    await expect(withRetry(fn, config)).rejects.toThrow("not retryable");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry callback on each retry attempt", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");
    const onRetry = vi.fn();

    const promise = withRetry(fn, {
      ...DEFAULT_RETRY_CONFIG,
      maxRetries: 3,
      jitter: false,
      onRetry,
    });

    await vi.runAllTimersAsync();
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
  });
});

describe("RetryPolicy", () => {
  it("none returns config with 0 maxRetries", () => {
    const cfg = RetryPolicy.none();
    expect(cfg.maxRetries).toBe(0);
  });

  it("fixed uses constant interval with no backoff", () => {
    const cfg = RetryPolicy.fixed(500, 5);
    expect(cfg.initialDelayMs).toBe(500);
    expect(cfg.maxDelayMs).toBe(500);
    expect(cfg.backoffMultiplier).toBe(1);
    expect(cfg.jitter).toBe(false);
    expect(cfg.maxRetries).toBe(5);
  });

  it("exponential uses doubling backoff without jitter", () => {
    const cfg = RetryPolicy.exponential(1000, 5, 30_000);
    expect(cfg.initialDelayMs).toBe(1000);
    expect(cfg.maxDelayMs).toBe(30_000);
    expect(cfg.backoffMultiplier).toBe(2);
    expect(cfg.jitter).toBe(false);
    expect(cfg.maxRetries).toBe(5);
  });

  it("exponentialWithJitter enables jitter", () => {
    const cfg = RetryPolicy.exponentialWithJitter(200, 3);
    expect(cfg.jitter).toBe(true);
    expect(cfg.maxRetries).toBe(3);
  });
});
