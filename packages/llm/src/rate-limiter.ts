/**
 * Rate Limiter
 *
 * Token bucket implementation and rate-limit handling for LLM provider calls.
 * Prevents exceeding provider rate limits by queuing and throttling requests.
 */

import { retry, type RetryConfig } from "@memory-platform/shared-utils";
import { createLogger, recordMetric, type Logger } from "@memory-platform/observability";

// ─── Rate Limit Configuration ──────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the interval */
  maxRequests: number;
  /** Time window in milliseconds (e.g. 60000 for 1 minute) */
  intervalMs: number;
  /** Maximum number of concurrent requests (default: unlimited) */
  maxConcurrent?: number;
  /** Retry configuration for when rate limit is exceeded */
  retry?: RetryConfig;
  /** Whether to queue requests when at capacity (default: true) */
  queue?: boolean;
}

const DEFAULT_RATE_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  intervalMs: 60_000,
  maxConcurrent: 10,
  queue: true,
};

// ─── Token Bucket ──────────────────────────────────────────────────────────────

/**
 * Token Bucket rate limiter.
 *
 * Tokens are consumed on each request and refilled at a steady rate.
 * When the bucket is empty, callers must wait for tokens to refill.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private inFlight = 0;

  private readonly capacity: number;
  private readonly refillRate: number; // tokens per ms
  private readonly maxConcurrent: number;
  private readonly logger: Logger;

  constructor(config: RateLimitConfig) {
    this.capacity = config.maxRequests;
    this.tokens = config.maxRequests;
    this.refillRate = config.maxRequests / config.intervalMs;
    this.lastRefill = Date.now();
    this.maxConcurrent = config.maxConcurrent ?? Infinity;
    this.logger = createLogger("llm:rate-limiter");
  }

  /**
   * Attempt to consume a token. If no tokens are available, waits until one
   * is refilled. Also respects the max concurrent limit.
   *
   * @returns Promise that resolves when a token is available
   */
  async acquire(): Promise<void> {
    // Wait for concurrency slot
    while (this.inFlight >= this.maxConcurrent) {
      await sleep(10);
    }

    this.inFlight++;
    try {
      await this._acquireToken();
    } finally {
      this.inFlight--;
    }
  }

  private async _acquireToken(): Promise<void> {
    this._refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Calculate wait time for one token
    const waitMs = (1 - this.tokens) / this.refillRate + 1; // +1ms margin

    this.logger.debug("Rate limit hit — waiting", {
      waitMs: Math.round(waitMs),
      availableTokens: Math.round(this.tokens * 100) / 100,
    });

    recordMetric("llm.rate_limiter.wait", 1, {
      waitMs: Math.round(waitMs),
    });

    await sleep(waitMs);
    this._refill();
    this.tokens -= 1;
  }

  private _refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsed * this.refillRate,
    );
    this.lastRefill = now;
  }

  /**
   * Number of tokens currently available.
   */
  get availableTokens(): number {
    this._refill();
    return this.tokens;
  }

  /**
   * Number of requests currently in flight.
   */
  get currentInFlight(): number {
    return this.inFlight;
  }

  /**
   * Reset the bucket to full capacity.
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
    this.inFlight = 0;
  }
}

// ─── withRateLimit ─────────────────────────────────────────────────────────────

/**
 * Wrap an async function with rate limiting and retry logic.
 *
 * Requests are throttled through a TokenBucket. If the function throws a
 * retryable error (e.g. 429), the retry logic from `shared-utils` kicks in.
 *
 * @param fn     - The async function to rate-limit
 * @param config - Rate limit configuration
 * @returns A wrapped function with the same signature
 *
 * @example
 * ```ts
 * const rateLimitedFetch = withRateLimit(
 *   async (url: string) => fetch(url),
 *   { maxRequests: 10, intervalMs: 60000 }
 * );
 * ```
 */
export function withRateLimit<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: Partial<RateLimitConfig> = {},
): (...args: TArgs) => Promise<TResult> {
  const mergedConfig = { ...DEFAULT_RATE_CONFIG, ...config };
  const bucket = new TokenBucket(mergedConfig);
  const logger = createLogger("llm:rate-limiter:wrapper");

  return async (...args: TArgs): Promise<TResult> => {
    // Acquire rate limit token
    await bucket.acquire();

    const retryConfig: RetryConfig = {
      maxRetries: mergedConfig.retry?.maxRetries ?? 2,
      baseDelayMs: mergedConfig.retry?.baseDelayMs ?? 1000,
      maxDelayMs: mergedConfig.retry?.maxDelayMs ?? 30_000,
      jitterFactor: mergedConfig.retry?.jitterFactor ?? 0.1,
      strategy: mergedConfig.retry?.strategy ?? "exponential",
      shouldRetry: mergedConfig.retry?.shouldRetry ?? isRateLimitError,
      onRetry: (error: unknown, attempt: number, delayMs: number) => {
        logger.warn("Retrying after rate limit", {
          attempt,
          delayMs,
          error: String(error),
        });
        mergedConfig.retry?.onRetry?.(error, attempt, delayMs);
      },
    };

    return retry(async () => fn(...args), retryConfig);
  };
}

// ─── Rate Limit Detection ──────────────────────────────────────────────────────

/**
 * Check if an error is a rate-limit / too-many-requests error (HTTP 429).
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    // OpenAI and Anthropic SDKs throw structured errors with status codes
    const apiError = error as { status?: number; statusCode?: number };
    if (apiError.status === 429 || apiError.statusCode === 429) {
      return true;
    }
    // Generic HTTP error pattern
    if (
      error.message.includes("429") ||
      error.message.includes("rate limit") ||
      error.message.includes("too many requests")
    ) {
      return true;
    }
  }
  return false;
}

// ─── Simple Sleep ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
