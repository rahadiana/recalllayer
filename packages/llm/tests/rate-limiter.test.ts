import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenBucket, withRateLimit } from "../src/rate-limiter.js";

vi.mock("@memory-platform/observability", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn() })),
  })),
  recordMetric: vi.fn(),
  initMetrics: vi.fn(),
}));

describe("TokenBucket", () => {
  it("starts with full capacity", () => {
    const bucket = new TokenBucket({ maxRequests: 10, intervalMs: 60000 });
    expect(bucket.availableTokens).toBeCloseTo(10, 0);
  });

  it("consumes tokens on acquire", async () => {
    const bucket = new TokenBucket({ maxRequests: 10, intervalMs: 60000 });
    await bucket.acquire();
    expect(bucket.availableTokens).toBeLessThan(10);
  });

  it("refills tokens over time", async () => {
    const bucket = new TokenBucket({ maxRequests: 10, intervalMs: 1000 });
    for (let i = 0; i < 10; i++) {
      await bucket.acquire();
    }
    expect(bucket.availableTokens).toBeLessThan(1);

    await new Promise((r) => setTimeout(r, 100));
    expect(bucket.availableTokens).toBeGreaterThan(0.5);
  });

  it("caps tokens at capacity", async () => {
    const bucket = new TokenBucket({ maxRequests: 10, intervalMs: 1000 });
    await new Promise((r) => setTimeout(r, 200));
    expect(bucket.availableTokens).toBeCloseTo(10, 0);
  });

  it("tracks in-flight count", async () => {
    const bucket = new TokenBucket({ maxRequests: 10, intervalMs: 60000, maxConcurrent: 2 });

    const p1 = bucket.acquire();
    expect(bucket.currentInFlight).toBe(1);

    const p2 = bucket.acquire();
    expect(bucket.currentInFlight).toBe(2);

    await Promise.all([p1, p2]);
    expect(bucket.currentInFlight).toBe(0);
  });

  it("respects maxConcurrent", async () => {
    const bucket = new TokenBucket({ maxRequests: 10, intervalMs: 60000, maxConcurrent: 1 });
    await bucket.acquire();

    let started = false;
    const p = bucket.acquire().then(() => {
      started = true;
    });

    await new Promise((r) => setTimeout(r, 10));
    await p;

    expect(started).toBe(true);
  });

  it("reset restores full capacity", async () => {
    const bucket = new TokenBucket({ maxRequests: 10, intervalMs: 60000 });
    await bucket.acquire();
    await bucket.acquire();
    bucket.reset();
    expect(bucket.availableTokens).toBeCloseTo(10, 0);
    expect(bucket.currentInFlight).toBe(0);
  });
});

describe("withRateLimit", () => {
  it("passes through successful calls", async () => {
    const fn = vi.fn().mockResolvedValue("result");
    const wrapped = withRateLimit(fn, { maxRequests: 10, intervalMs: 60000 });
    const result = await wrapped("arg1");
    expect(result).toBe("result");
    expect(fn).toHaveBeenCalledWith("arg1");
  });

  it("throttles requests when at capacity", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const wrapped = withRateLimit(fn, { maxRequests: 1, intervalMs: 100 });

    // First call passes through (bucket has tokens)
    await wrapped();
    expect(fn).toHaveBeenCalledTimes(1);

    // Second call must wait (bucket empty)
    const p2 = wrapped();
    // Should not have executed yet
    await new Promise(r => setTimeout(r, 50));
    expect(fn).toHaveBeenCalledTimes(1);

    // Wait for refill
    await p2;
    expect(fn).toHaveBeenCalledTimes(2);
  }, 10000);

  it("retries on rate limit errors", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls <= 2) {
        const err = new Error("429 too many requests") as Error & { status: number };
        err.status = 429;
        throw err;
      }
      return "success";
    });

    const wrapped = withRateLimit(fn, {
      maxRequests: 10,
      intervalMs: 60000,
    });

    const resultPromise = wrapped();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);

    const result = await resultPromise;
    vi.useRealTimers();
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
