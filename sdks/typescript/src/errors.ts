/**
 * SDK-specific error classes for the TypeScript client library.
 *
 * Provides structured, typed errors that wrap HTTP responses, network failures,
 * and authentication issues in a consistent hierarchy.
 *
 * @module errors
 */

import type { ErrorCode } from "@memory-platform/shared-schemas";

// ─── Base SDK Error ──────────────────────────────────────────────────────────

/**
 * Base error class for all SDK-specific errors.
 *
 * All errors thrown by the SDK inherit from this class, making it easy
 * to catch any SDK error with a single `instanceof` check.
 */
export class MemoryPlatformError extends Error {
  /** Machine-readable error code (from the API or SDK-specific). */
  public readonly code: ErrorCode | string;

  /** HTTP status code (0 for network-level errors). */
  public readonly status: number;

  /** Unique error instance identifier for log correlation. */
  public readonly errorId?: string;

  /** Optional details payload (e.g. validation field errors). */
  public readonly details?: unknown;

  constructor(
    message: string,
    code: ErrorCode | string,
    status: number,
    errorId?: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "MemoryPlatformError";
    this.code = code;
    this.status = status;
    this.errorId = errorId;
    this.details = details;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MemoryPlatformError);
    }
  }
}

// ─── API Error ───────────────────────────────────────────────────────────────

/**
 * Error returned by the Memory Platform API (4xx / 5xx responses).
 *
 * This class parses the standardised `ApiError` shape from the API
 * and exposes it as a typed JavaScript error.
 */
export class ApiError extends MemoryPlatformError {
  /** The HTTP path that triggered the error. */
  public readonly path?: string;

  /**
   * Create an ApiError from an API response body.
   *
   * @param response - Parsed API error response body.
   * @param status - HTTP status code.
   * @param requestPath - The URL path of the failed request.
   */
  static fromResponse(
    response: {
      code: ErrorCode | string;
      message: string;
      error_id?: string;
      details?: unknown;
      path?: string;
    },
    status: number,
    requestPath?: string,
  ): ApiError {
    return new ApiError(
      response.message ?? "Unknown API error",
      response.code ?? "UNKNOWN",
      status,
      response.error_id,
      response.details,
      response.path ?? requestPath,
    );
  }

  constructor(
    message: string,
    code: ErrorCode | string,
    status: number,
    errorId?: string,
    details?: unknown,
    path?: string,
  ) {
    super(message, code, status, errorId, details);
    this.name = "ApiError";
    this.path = path;
  }
}

// ─── Network Error ──────────────────────────────────────────────────────────

/**
 * Error representing a network-level failure (DNS, timeout, connection refused).
 *
 * Thrown when `fetch()` itself fails before receiving any HTTP response.
 */
export class NetworkError extends MemoryPlatformError {
  /** The underlying system error that caused the failure. */
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, "NETWORK_ERROR", 0);
    this.name = "NetworkError";
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NetworkError);
    }
  }
}

// ─── Auth Error ──────────────────────────────────────────────────────────────

/**
 * Error representing an authentication or authorisation failure.
 *
 * Thrown when the SDK client is not configured with a valid API key
 * or when the API returns a 401/403 response.
 */
export class AuthError extends ApiError {
  constructor(
    message: string,
    code: ErrorCode | string = "UNAUTHORIZED",
    status = 401,
    errorId?: string,
    details?: unknown,
  ) {
    super(message, code, status, errorId, details);
    this.name = "AuthError";
  }
}

// ─── Rate Limit Error ───────────────────────────────────────────────────────

/**
 * Error representing a rate limit (HTTP 429) response.
 *
 * This error indicates the client has exceeded the API rate limit
 * and should back off before retrying.
 */
export class RateLimitError extends ApiError {
  /** Seconds to wait before retrying (from `Retry-After` header, if present). */
  public readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    status = 429,
    errorId?: string,
    retryAfterSeconds?: number,
  ) {
    super(message, "TOO_MANY_REQUESTS", status, errorId);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// ─── Type guard ──────────────────────────────────────────────────────────────

/**
 * Check if an error is a MemoryPlatformError (or subclass).
 */
export function isMemoryPlatformError(error: unknown): error is MemoryPlatformError {
  return error instanceof MemoryPlatformError;
}

/**
 * Check if an error is an ApiError.
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Check if an error is a NetworkError.
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}
