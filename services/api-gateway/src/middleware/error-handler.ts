/**
 * Global Error Handler
 *
 * Catches all errors thrown in the request pipeline and transforms
 * them into the standardised ApiError response shape defined
 * in @memory-platform/shared-schemas.
 */

import type { Request, Response, NextFunction } from "express";
import type { ApiError, ErrorCode } from "@memory-platform/shared-schemas";
import { generateShortId } from "@memory-platform/shared-utils";
import { createLogger, type Logger } from "@memory-platform/observability";

const log = createLogger("api-gateway:error-handler");

// ─── Error Classes ───────────────────────────────────────────────────────────

/**
 * Base class for all API-level errors.
 *
 * Custom errors should extend this to ensure consistent
 * status codes and error codes.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// ─── Error Handler ───────────────────────────────────────────────────────────

/**
 * Map known error types to status codes and error codes.
 */
function resolveError(err: unknown): {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
} {
  // Handle known AppError subclasses
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }

  // Handle errors with explicit statusCode (e.g. UnauthorizedError, RateLimitExceededError)
  if (
    err &&
    typeof err === "object" &&
    "statusCode" in err &&
    "code" in err &&
    typeof (err as Record<string, unknown>).statusCode === "number" &&
    typeof (err as Record<string, unknown>).code === "string"
  ) {
    return {
      statusCode: (err as Record<string, unknown>).statusCode as number,
      code: (err as Record<string, unknown>).code as ErrorCode,
      message:
        err instanceof Error ? err.message : "An error occurred",
    };
  }

  // Handle JWT errors (from jsonwebtoken)
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as Record<string, unknown>).name as string;
    if (name === "TokenExpiredError") {
      return {
        statusCode: 401,
        code: "TOKEN_EXPIRED",
        message: "Authentication token has expired",
      };
    }
    if (name === "JsonWebTokenError") {
      return {
        statusCode: 401,
        code: "UNAUTHORIZED",
        message: "Invalid authentication token",
      };
    }
  }

  // Handle SyntaxError (JSON parse failures)
  if (err instanceof SyntaxError) {
    return {
      statusCode: 400,
      code: "INVALID_INPUT",
      message: "Invalid request body: unable to parse JSON",
    };
  }

  // Default: internal server error
  const message = err instanceof Error ? err.message : "Internal server error";

  // In production, avoid leaking internal error details
  const safeMessage =
    process.env.NODE_ENV === "production" ? "Internal server error" : message;

  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: safeMessage,
    details:
      process.env.NODE_ENV !== "production" && err instanceof Error
        ? { stack: err.stack }
        : undefined,
  };
}

// ─── Middleware ──────────────────────────────────────────────────────────────

/**
 * Global Express error-handling middleware.
 *
 * Must be registered LAST (after all routes) and with 4 parameters
 * so Express recognises it as an error handler.
 *
 * Produces standardised ApiError responses:
 * ```json
 * {
 *   "code": "UNAUTHORIZED",
 *   "message": "Authentication required",
 *   "error_id": "abc123",
 *   "timestamp": "2026-05-14T09:30:00.000Z",
 *   "path": "/v1/documents"
 * }
 * ```
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const errorId = generateShortId(12);
  const timestamp = new Date().toISOString();
  const path = req.originalUrl ?? req.path;

  const { statusCode, code, message, details } = resolveError(err);

  // Log the error with structured metadata
  const logger: Logger | undefined = (req as unknown as Record<string, unknown>).logger as Logger | undefined;
  if (logger) {
    logger.error(message, {
      errorId,
      statusCode,
      code,
      path,
      method: req.method,
      stack: err instanceof Error ? err.stack : undefined,
    });
  } else {
    log.error(message, {
      errorId,
      statusCode,
      code,
      path,
      method: req.method,
      stack: err instanceof Error ? err.stack : undefined,
    });
  }

  const body: ApiError = {
    code,
    message,
    details: details ?? undefined,
    error_id: errorId,
    timestamp,
    path,
  };

  res.status(statusCode).json(body);
}
