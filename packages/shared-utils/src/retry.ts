/**
 * Retry & Backoff Helpers
 *
 * Pure utility functions for retry logic with exponential backoff and jitter.
 * Zero external dependencies.
 */

export interface RetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
  strategy?: "exponential" | "linear" | "constant";
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_CONFIG: Required<Omit<RetryConfig, "shouldRetry" | "onRetry">> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitterFactor: 0.1,
  strategy: "exponential",
};

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  config: RetryConfig = {},
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, jitterFactor, strategy } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (config.shouldRetry && !config.shouldRetry(error, attempt)) {
        throw error;
      }

      if (attempt >= maxRetries) {
        throw error;
      }

      const delay = calculateDelay({
        attempt,
        baseDelayMs,
        maxDelayMs,
        jitterFactor,
        strategy,
      });

      config.onRetry?.(error, attempt + 1, delay);

      await sleep(delay);
    }
  }

  throw lastError;
}

interface CalculateDelayInput {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  strategy: "exponential" | "linear" | "constant";
}

export function calculateDelay(input: CalculateDelayInput): number {
  const { attempt, baseDelayMs, maxDelayMs, jitterFactor, strategy } = input;

  let delay: number;

  switch (strategy) {
    case "exponential":
      delay = baseDelayMs * Math.pow(2, attempt);
      break;
    case "linear":
      delay = baseDelayMs * (attempt + 1);
      break;
    case "constant":
      delay = baseDelayMs;
      break;
    default:
      delay = baseDelayMs * Math.pow(2, attempt);
  }

  delay = Math.min(delay, maxDelayMs);

  if (jitterFactor > 0) {
    delay = calculateJitter(delay, jitterFactor);
  }

  return delay;
}

export function withExponentialBackoff(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 30_000,
): number {
  const delay = baseDelayMs * Math.pow(2, attempt);
  return Math.min(delay, maxDelayMs);
}

export function calculateJitter(delay: number, factor: number): number {
  if (factor <= 0) return delay;
  const clampedFactor = Math.min(factor, 1);
  const range = delay * clampedFactor;
  const jitter = (Math.random() * 2 - 1) * range;
  return Math.round(delay + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
