/**
 * API Gateway — Express App Factory
 *
 * Single entry point for all public API traffic.
 * Wires middleware, routes, and the internal proxy.
 *
 * Usage:
 * ```ts
 * const app = initApiGateway({
 *   jwtSecret: process.env.JWT_SECRET!,
 *   ingressUrl: "ingestion-service:3002",
 *   retrievalUrl: "retrieval-service:3003",
 *   connectorUrl: "connector-service:3004",
 * });
 * app.listen(3001);
 * ```
 */

import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger } from "@memory-platform/observability";

import { correlationMiddleware } from "./middleware/correlation.js";
import { createAuthMiddleware, type AuthOptions } from "./middleware/auth.js";
import {
  createRateLimitMiddleware,
  type RateLimitOptions,
} from "./middleware/ratelimit.js";
import { errorHandler } from "./middleware/error-handler.js";

import {
  createInternalProxy,
  type InternalProxy,
  type ProxyConfig,
} from "./proxy.js";

import { healthRouter, registerCheck } from "./routes/health.js";
import { createDocumentsRouter } from "./routes/documents.js";
import { createSearchRouter } from "./routes/search.js";
import { createMemoriesRouter } from "./routes/memories.js";
import { createConnectorsRouter } from "./routes/connectors.js";
import { usageRouter } from "./routes/usage.js";

const log = createLogger("api-gateway:init");

export interface GatewayConfig {
  /** JWT configuration. */
  auth: {
    jwtSecret: string;
    jwtAudience?: string;
    jwtIssuer?: string;
  };
  /** Internal service URLs. */
  services: {
    ingestionServiceUrl: string;
    retrievalServiceUrl: string;
    connectorServiceUrl: string;
  };
  /** Rate limit configuration. */
  rateLimit?: RateLimitOptions;
  /** Whether to enable CORS (default: true). */
  cors?: boolean;
  /** Whether to enable helmet security headers (default: true). */
  helmet?: boolean;
  /** Custom proxy instance (for testing). */
  proxy?: InternalProxy;
}

const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  enabled: true,
  global: { maxRequests: 1000, windowMs: 60_000 },
  perRoute: {
    "/v1/search": { maxRequests: 100, windowMs: 60_000, key: "search" },
    "/v1/context": { maxRequests: 100, windowMs: 60_000, key: "context" },
    "/v1/connectors": { maxRequests: 50, windowMs: 60_000, key: "connectors" },
  },
};

export function initApiGateway(config: GatewayConfig): Express {
  const app = express();

  const proxy =
    config.proxy ??
    createInternalProxy({
      ingestionServiceUrl: config.services.ingestionServiceUrl,
      retrievalServiceUrl: config.services.retrievalServiceUrl,
      connectorServiceUrl: config.services.connectorServiceUrl,
    });

  const authOptions: AuthOptions = {
    jwtSecret: config.auth.jwtSecret,
    jwtAudience: config.auth.jwtAudience,
    jwtIssuer: config.auth.jwtIssuer,
  };

  const rateLimitConfig: RateLimitOptions = config.rateLimit ?? DEFAULT_RATE_LIMIT;

  // ── Global middleware ───────────────────────────────────────────────
  if (config.helmet !== false) {
    app.use(helmet());
  }
  if (config.cors !== false) {
    app.use(cors());
  }
  app.use(express.json({ limit: "10mb" }));
  app.use(correlationMiddleware);

  // ── Public routes (no auth required) ─────────────────────────────────
  app.use(healthRouter);

  app.use(createAuthMiddleware(authOptions));
  app.use(createRateLimitMiddleware(rateLimitConfig));

  // ── Routes ──────────────────────────────────────────────────────────
  app.use(createDocumentsRouter(proxy));
  app.use(createSearchRouter(proxy));
  app.use(createMemoriesRouter(proxy));
  app.use(createConnectorsRouter(proxy));
  app.use(usageRouter);

  // ── 404 handler ─────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      code: "NOT_FOUND",
      message: `Route not found: ${_req.method} ${_req.path}`,
      error_id: "",
      timestamp: new Date().toISOString(),
      path: _req.path,
    });
  });

  // ── Error handler (must be last) ────────────────────────────────────
  app.use(errorHandler);

  log.info("API Gateway initialized", {
    services: {
      ingestion: config.services.ingestionServiceUrl,
      retrieval: config.services.retrievalServiceUrl,
      connector: config.services.connectorServiceUrl,
    },
    rateLimitEnabled: rateLimitConfig.enabled,
    corsEnabled: config.cors !== false,
    helmetEnabled: config.helmet !== false,
  });

  return app;
}

export type { InternalProxy, ProxyConfig, ProxyRequestHeaders } from "./proxy.js";
export { createInternalProxy } from "./proxy.js";

export { correlationMiddleware } from "./middleware/correlation.js";
export { createAuthMiddleware, UnauthorizedError, ForbiddenError, InvalidApiKeyError } from "./middleware/auth.js";
export type { AuthOptions, JwtPayload } from "./middleware/auth.js";
export { createRateLimitMiddleware, createInMemoryStore, RateLimitExceededError } from "./middleware/ratelimit.js";
export type { RateLimitConfig, RateLimitOptions } from "./middleware/ratelimit.js";
export { errorHandler, AppError } from "./middleware/error-handler.js";

export { healthRouter, registerCheck } from "./routes/health.js";
export { createDocumentsRouter } from "./routes/documents.js";
export { createSearchRouter } from "./routes/search.js";
export { createMemoriesRouter } from "./routes/memories.js";
export { createConnectorsRouter } from "./routes/connectors.js";
export { usageRouter } from "./routes/usage.js";
