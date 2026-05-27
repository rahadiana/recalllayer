/**
 * Authentication Middleware
 *
 * Validates JWT tokens (Authorization: Bearer <token>) and API keys
 * (x-api-key header). Extracts workspace_id and actor_id from valid
 * credentials and attaches them to `req`.
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createLogger } from "@memory-platform/observability";

const log = createLogger("api-gateway:auth");

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * JWT payload expected from authentication service.
 */
export interface JwtPayload {
  sub: string; // user_id
  workspace_id: string;
  role?: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
}

/**
 * Extended Express Request after auth middleware.
 */
declare global {
  namespace Express {
    interface Request {
      /** Authenticated workspace ID (from JWT or API key). */
      workspaceId: string;
      /** Authenticated actor ID (user ID or "api_key:<key_id>"). */
      actorId: string;
      /** Whether the request was authenticated via API key. */
      isApiKey: boolean;
      /** JWT payload when using token auth. */
      jwtPayload?: JwtPayload;
    }
  }
}

// ─── Auth Options ────────────────────────────────────────────────────────────

export interface AuthOptions {
  /** JWT secret used for token verification. */
  jwtSecret: string;
  /** Optional audience claim to verify. */
  jwtAudience?: string;
  /** Optional issuer claim to verify. */
  jwtIssuer?: string;
  /** Whether to allow unauthenticated requests (useful for health). */
  allowUnauthenticated?: boolean;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class UnauthorizedError extends Error {
  public readonly statusCode = 401;
  public readonly code = "UNAUTHORIZED";

  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  public readonly statusCode = 403;
  public readonly code = "FORBIDDEN";

  constructor(message = "Insufficient permissions") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class InvalidApiKeyError extends Error {
  public readonly statusCode = 401;
  public readonly code = "INVALID_API_KEY";

  constructor(message = "Invalid or expired API key") {
    super(message);
    this.name = "InvalidApiKeyError";
  }
}

// ─── Middleware Factory ──────────────────────────────────────────────────────

/**
 * Verify a JWT token and return its decoded payload.
 */
function verifyJwtToken(
  token: string,
  secret: string,
  audience?: string,
  issuer?: string,
): JwtPayload {
  try {
    const payload = jwt.verify(token, secret, {
      audience,
      issuer,
    }) as JwtPayload;

    if (!payload.sub || !payload.workspace_id) {
      throw new UnauthorizedError("Token missing required claims (sub, workspace_id)");
    }

    return payload;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    if (
      typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as Record<string, unknown>).name === "TokenExpiredError"
    ) {
      throw new UnauthorizedError("Token has expired");
    }
    if (
      typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as Record<string, unknown>).name === "JsonWebTokenError"
    ) {
      throw new UnauthorizedError(
        `Invalid token: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
    throw new UnauthorizedError("Token verification failed");
  }
}

/**
 * Create the authentication middleware.
 *
 * Checks for credentials in this order:
 * 1. `Authorization: Bearer <jwt>` header → JWT auth
 * 2. `x-api-key` header → API key auth
 *
 * @param opts - Configuration options
 * @returns Express middleware
 */
export function createAuthMiddleware(opts: AuthOptions) {
  const { jwtSecret, jwtAudience, jwtIssuer, allowUnauthenticated = false } = opts;

  return (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers["x-api-key"] as string | undefined;

    // ── JWT Authentication ──────────────────────────────────────────────
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);

      try {
        const payload = verifyJwtToken(token, jwtSecret, jwtAudience, jwtIssuer);

        req.workspaceId = payload.workspace_id;
        req.actorId = payload.sub;
        req.isApiKey = false;
        req.jwtPayload = payload;

        req.logger?.debug("JWT authentication successful", {
          userId: payload.sub,
          workspaceId: payload.workspace_id,
        });

        return next();
      } catch (err) {
        log.warn("JWT authentication failed", {
          error: err instanceof Error ? err.message : String(err),
          path: req.path,
        });
        return next(err);
      }
    }

    // ── API Key Authentication ──────────────────────────────────────────
    if (apiKey) {
      // In production, validate against the database.
      // For now we do a basic structure check.
      if (apiKey.length < 16) {
        log.warn("API key too short", { path: req.path });
        return next(new InvalidApiKeyError());
      }

      // Extract key prefix (format: "ak_<workspace_id>_<random>")
      // or "sk_<workspace_id>_<random>"
      const keyMatch = apiKey.match(/^(?:ak|sk)_([a-zA-Z0-9]+)_/);
      if (!keyMatch) {
        log.warn("API key malformed", { path: req.path });
        return next(new InvalidApiKeyError("Malformed API key"));
      }

      const workspaceId = keyMatch[1];

      req.workspaceId = workspaceId;
      req.actorId = `api_key:${apiKey.slice(0, 8)}...`;
      req.isApiKey = true;

      req.logger?.debug("API key authentication successful", {
        workspaceId,
      });

      return next();
    }

    // ── No Credentials ──────────────────────────────────────────────────
    if (allowUnauthenticated) {
      req.workspaceId = "unauthenticated";
      req.actorId = "anonymous";
      req.isApiKey = false;
      return next();
    }

    log.warn("No authentication credentials provided", { path: req.path });
    return next(new UnauthorizedError());
  };
}
