export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableError?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60_000,
  backoffMultiplier: 2,
  jitter: true,
};

function calculateBackoff(attempt: number, config: RetryConfig): number {
  const delay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelayMs,
  );
  if (config.jitter) {
    const jitter = Math.random() * delay * 0.3;
    return Math.round(delay + jitter);
  }
  return delay;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async function with retry logic. Retries on any thrown error
 * unless `retryableError` is provided and returns false.
 */
export async function withRetry<T>(fn: () => Promise<T>, config: RetryConfig = DEFAULT_RETRY_CONFIG): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt > config.maxRetries) {
        throw lastError;
      }

      if (config.retryableError && !config.retryableError(lastError)) {
        throw lastError;
      }

      const delay = calculateBackoff(attempt, config);
      config.onRetry?.(lastError, attempt, delay);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("withRetry exhausted all attempts");
}

/**
 * Pre-built retry presets.
 */
export const RetryPolicy = {
  none: (): RetryConfig => ({ ...DEFAULT_RETRY_CONFIG, maxRetries: 0 }),

  fixed: (intervalMs: number, maxRetries: number): RetryConfig => ({
    maxRetries,
    initialDelayMs: intervalMs,
    maxDelayMs: intervalMs,
    backoffMultiplier: 1,
    jitter: false,
  }),

  exponential: (initialMs: number, maxRetries: number, maxDelayMs = 60_000): RetryConfig => ({
    maxRetries,
    initialDelayMs: initialMs,
    maxDelayMs,
    backoffMultiplier: 2,
    jitter: false,
  }),

  exponentialWithJitter: (initialMs: number, maxRetries: number, maxDelayMs = 60_000): RetryConfig => ({
    maxRetries,
    initialDelayMs: initialMs,
    maxDelayMs,
    backoffMultiplier: 2,
    jitter: true,
  }),
} as const;
