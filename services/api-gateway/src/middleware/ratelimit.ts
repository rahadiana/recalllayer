/**
 * Rate Limiting Middleware
 *
 * Per-workspace rate limiting with configurable windows and limits.
 * Uses an in-memory store by default; can integrate with Redis
 * via @memory-platform/db for distributed deployments.
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "@memory-platform/observability";

const log = createLogger("api-gateway:ratelimit");

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Configuration for a rate limit window.
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Optional route-specific identifier. */
  key?: string;
}

/**
 * Default rate limits per endpoint category.
 */
export interface RateLimitOptions {
  /** Global default for all endpoints. */
  global: RateLimitConfig;
  /** Per-route overrides (keyed by route path prefix). */
  perRoute?: Record<string, RateLimitConfig>;
  /** Whether to enable rate limiting (useful for testing). */
  enabled?: boolean;
}

/**
 * A single rate-limit bucket entry.
 */
interface RateLimitBucket {
  count: number;
  resetAt: number;
}

// ─── Error ───────────────────────────────────────────────────────────────────

export class RateLimitExceededError extends Error {
  public readonly statusCode = 429;
  public readonly code = "TOO_MANY_REQUESTS";
  public readonly retryAfterMs: number;

  constructor(message = "Rate limit exceeded", retryAfterMs = 1000) {
    super(message);
    this.name = "RateLimitExceededError";
    this.retryAfterMs = retryAfterMs;
  }
}

// ─── In-Memory Store ─────────────────────────────────────────────────────────

interface RateLimitStore {
  get(key: string): RateLimitBucket | undefined;
  set(key: string, bucket: RateLimitBucket): void;
  reset(): void;
}

/**
 * Create an in-memory rate limit store.
 *
 * In production this would be replaced with a Redis-backed store
 * via @memory-platform/db.
 */
function createInMemoryStore(): RateLimitStore {
  const store = new Map<string, RateLimitBucket>();

  // Periodically clean up expired entries
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of store) {
      if (bucket.resetAt <= now) {
        store.delete(key);
      }
    }
  }, 60_000);

  // Allow the process to exit cleanly
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return {
    get(key: string): RateLimitBucket | undefined {
      return store.get(key);
    },

    set(key: string, bucket: RateLimitBucket): void {
      store.set(key, bucket);
    },

    reset(): void {
      store.clear();
    },
  };
}

// ─── Middleware Factory ──────────────────────────────────────────────────────

/**
 * Create a rate-limiting middleware.
 *
 * Rate limits are keyed by `workspace_id:route_key` so different
 * workspaces and endpoint categories have independent limits.
 *
 * @param opts  - Rate limit configuration
 * @param store - Rate limit store (defaults to in-memory)
 * @returns Express middleware
 */
export function createRateLimitMiddleware(
  opts: RateLimitOptions,
  store: RateLimitStore = createInMemoryStore(),
) {
  const { global, perRoute = {}, enabled = true } = opts;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!enabled) return next();

    const workspaceId = req.workspaceId ?? "anonymous";

    // Determine which limit config applies
    const routePath = req.path;
    let config: RateLimitConfig = global;

    for (const [prefix, routeConfig] of Object.entries(perRoute)) {
      if (routePath.startsWith(prefix)) {
        config = routeConfig;
        break;
      }
    }

    // Build the rate-limit key
    const key = `ratelimit:${workspaceId}:${config.key ?? routePath}`;

    const now = Date.now();
    let bucket = store.get(key);

    // Initialize or reset expired bucket
    if (!bucket || bucket.resetAt <= now) {
      bucket = {
        count: 1,
        resetAt: now + config.windowMs,
      };
      store.set(key, bucket);

      // Set rate-limit headers
      res.setHeader("X-RateLimit-Limit", config.maxRequests);
      res.setHeader("X-RateLimit-Remaining", config.maxRequests - 1);
      res.setHeader("X-RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));

      return next();
    }

    bucket.count++;
    store.set(key, bucket);

    const remaining = Math.max(0, config.maxRequests - bucket.count);

    // Set rate-limit headers
    res.setHeader("X-RateLimit-Limit", config.maxRequests);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));

    if (bucket.count > config.maxRequests) {
      const retryAfterMs = bucket.resetAt - now;

      log.warn("Rate limit exceeded", {
        workspaceId,
        key,
        count: bucket.count,
        maxRequests: config.maxRequests,
        retryAfterMs,
      });

      res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000));
      return next(
        new RateLimitExceededError(
          `Rate limit of ${config.maxRequests} requests per ${config.windowMs / 1000}s exceeded`,
          retryAfterMs,
        ),
      );
    }

    return next();
  };
}

/**
 * Public helper to create an in-memory store (exposed for testing).
 */
export { createInMemoryStore };
