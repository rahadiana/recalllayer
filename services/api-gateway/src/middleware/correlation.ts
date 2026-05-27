/**
 * Correlation ID Middleware
 *
 * Injects x-request-id header when missing, seeds the async
 * correlation context, and attaches a logger child with
 * correlation metadata to every request.
 */

import type { Request, Response, NextFunction } from "express";
import {
  generateCorrelationId,
  withCorrelationId,
  parseCorrelationId,
  ContextKey,
  createLogger,
  type Logger,
} from "@memory-platform/observability";
import { generateShortId } from "@memory-platform/shared-utils";

const log = createLogger("api-gateway:correlation");

/**
 * Extended Express Request with correlation helpers.
 */
declare global {
  namespace Express {
    interface Request {
      /** The resolved correlation ID for this request. */
      correlationId: string;
      /** The resolved request ID for this request. */
      requestId: string;
      /** A logger child with correlation metadata. */
      logger: Logger;
    }
  }
}

/**
 * Middleware that ensures every request has:
 *
 * 1. A `x-request-id` header (generates one if missing).
 * 2. A correlation ID from `x-correlation-id` or generated fresh.
 * 3. A logger child attached to `req.logger`.
 *
 * The correlation ID is pushed into the async context storage so
 * downstream logger calls automatically include it.
 */
export function correlationMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Resolve or generate request ID
  const requestId =
    (req.headers[ContextKey.REQUEST_ID] as string | undefined) ??
    (req.headers["x-request-id"] as string | undefined) ??
    generateShortId(12);

  req.requestId = requestId;

  // Resolve or generate correlation ID
  const correlationId =
    parseCorrelationId(req.headers as Record<string, string | string[] | undefined>) ??
    generateCorrelationId();

  req.correlationId = correlationId;

  // Create a request-scoped logger child
  req.logger = log.child({
    requestId,
    correlationId,
    method: req.method,
    path: req.path,
  });

  // Push correlation ID into async context so downstream
  // observability calls (e.g. tracing, logs) pick it up.
  withCorrelationId(correlationId, () => {
    next();
  });
}
