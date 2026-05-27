import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import {
  createAuthMiddleware,
  UnauthorizedError,
  InvalidApiKeyError,
} from "../../src/middleware/auth.js";

const TEST_JWT_SECRET = "test-secret-key-for-unit-tests";
const TEST_WORKSPACE_ID = "workspace123abc";
const TEST_USER_ID = "user_550e8400-e29b-41d4-a716-446655440000";

function createSignedToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    { sub: TEST_USER_ID, workspace_id: TEST_WORKSPACE_ID, role: "editor", ...overrides },
    TEST_JWT_SECRET,
    { expiresIn: "1h" },
  );
}

function createMockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("createAuthMiddleware", () => {
  let middleware: ReturnType<typeof createAuthMiddleware>;

  beforeEach(() => {
    middleware = createAuthMiddleware({ jwtSecret: TEST_JWT_SECRET });
  });

  it("authenticates with a valid JWT Bearer token", () => {
    const req: Record<string, unknown> = {
      headers: { authorization: `Bearer ${createSignedToken()}` },
      method: "GET",
      path: "/test",
      logger: createMockLogger(),
    };
    const next = vi.fn();

    middleware(req as unknown as Request, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.workspaceId).toBe(TEST_WORKSPACE_ID);
    expect(req.actorId).toBe(TEST_USER_ID);
    expect(req.isApiKey).toBe(false);
  });

  it("rejects missing sub claim in JWT", () => {
    const req: Record<string, unknown> = {
      headers: {
        authorization: `Bearer ${jwt.sign({ workspace_id: TEST_WORKSPACE_ID }, TEST_JWT_SECRET, { expiresIn: "1h" })}`,
      },
      method: "GET",
      path: "/test",
      logger: createMockLogger(),
    };
    const next = vi.fn();

    middleware(req as unknown as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects expired JWT tokens", () => {
    const token = jwt.sign(
      { sub: TEST_USER_ID, workspace_id: TEST_WORKSPACE_ID },
      TEST_JWT_SECRET,
      { expiresIn: "0s" },
    );
    const req: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      path: "/test",
      logger: createMockLogger(),
    };
    const next = vi.fn();

    middleware(req as unknown as Request, {} as Response, next);
    const err = next.mock.calls[0][0] as UnauthorizedError;
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.message).toContain("expired");
  });

  it("validates API key with x-api-key header", () => {
    const req: Record<string, unknown> = {
      headers: { "x-api-key": `ak_${TEST_WORKSPACE_ID}_randomstring1234567890123456` },
      method: "GET",
      path: "/test",
      logger: createMockLogger(),
    };
    const next = vi.fn();

    middleware(req as unknown as Request, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.workspaceId).toBe(TEST_WORKSPACE_ID);
    expect(req.isApiKey).toBe(true);
  });

  it("rejects malformed API keys", () => {
    const req: Record<string, unknown> = {
      headers: { "x-api-key": "bad-format-key" },
      method: "GET",
      path: "/test",
      logger: createMockLogger(),
    };
    const next = vi.fn();

    middleware(req as unknown as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(InvalidApiKeyError));
  });

  it("returns UnauthorizedError when no credentials provided", () => {
    const req: Record<string, unknown> = {
      headers: {},
      method: "GET",
      path: "/test",
      logger: createMockLogger(),
    };
    const next = vi.fn();

    middleware(req as unknown as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("allows unauthenticated requests when allowUnauthenticated is true", () => {
    const permissive = createAuthMiddleware({
      jwtSecret: TEST_JWT_SECRET,
      allowUnauthenticated: true,
    });
    const req: Record<string, unknown> = {
      headers: {},
      method: "GET",
      path: "/test",
      logger: createMockLogger(),
    };
    const next = vi.fn();

    permissive(req as unknown as Request, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.workspaceId).toBe("unauthenticated");
    expect(req.actorId).toBe("anonymous");
  });

  it("validates JWT audience when configured", () => {
    const audienceMw = createAuthMiddleware({
      jwtSecret: TEST_JWT_SECRET,
      jwtAudience: "memory-platform",
    });
    const token = jwt.sign(
      { sub: TEST_USER_ID, workspace_id: TEST_WORKSPACE_ID },
      TEST_JWT_SECRET,
      { audience: "memory-platform", expiresIn: "1h" },
    );
    const req: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      path: "/test",
      logger: createMockLogger(),
    };
    const next = vi.fn();

    audienceMw(req as unknown as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.workspaceId).toBe(TEST_WORKSPACE_ID);
  });

  it("prefers JWT over API key when both are present", () => {
    const token = createSignedToken();
    const req: Record<string, unknown> = {
      headers: {
        authorization: `Bearer ${token}`,
        "x-api-key": "ak_other_1234567890123456",
      },
      method: "GET",
      path: "/test",
      logger: createMockLogger(),
    };
    const next = vi.fn();

    middleware(req as unknown as Request, {} as Response, next);

    expect(req.workspaceId).toBe(TEST_WORKSPACE_ID);
    expect(req.isApiKey).toBe(false);
    expect(req.actorId).toBe(TEST_USER_ID);
  });
});
