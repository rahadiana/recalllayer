import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import { errorHandler, AppError } from "../../src/middleware/error-handler.js";
import { UnauthorizedError } from "../../src/middleware/auth.js";
import { RateLimitExceededError } from "../../src/middleware/ratelimit.js";

function createMockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("errorHandler", () => {
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;

  function makeReq(): Record<string, unknown> {
    return {
      originalUrl: "/v1/test",
      path: "/v1/test",
      method: "GET",
      logger: createMockLogger(),
    };
  }

  function makeRes(): Record<string, unknown> {
    jsonSpy = vi.fn().mockReturnValue({});
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy });
    return { status: statusSpy, json: jsonSpy };
  }

  function getBody(): Record<string, unknown> {
    return jsonSpy.mock.calls[0][0] as Record<string, unknown>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles AppError", () => {
    const res = makeRes();
    errorHandler(
      new AppError(422, "VALIDATION_ERROR", "Invalid input", { field: "title" }),
      makeReq() as unknown as Request,
      res as unknown as Response,
      vi.fn(),
    );

    expect(statusSpy).toHaveBeenCalledWith(422);
    expect(getBody().code).toBe("VALIDATION_ERROR");
  });

  it("handles UnauthorizedError", () => {
    const res = makeRes();
    errorHandler(
      new UnauthorizedError("Token expired"),
      makeReq() as unknown as Request,
      res as unknown as Response,
      vi.fn(),
    );

    expect(statusSpy).toHaveBeenCalledWith(401);
    expect(getBody().code).toBe("UNAUTHORIZED");
  });

  it("handles RateLimitExceededError", () => {
    const res = makeRes();
    errorHandler(
      new RateLimitExceededError("rate limited", 5000),
      makeReq() as unknown as Request,
      res as unknown as Response,
      vi.fn(),
    );

    expect(statusSpy).toHaveBeenCalledWith(429);
    expect(getBody().code).toBe("TOO_MANY_REQUESTS");
  });

  it("handles JWT TokenExpiredError-like objects", () => {
    const res = makeRes();
    errorHandler(
      { name: "TokenExpiredError", message: "jwt expired" },
      makeReq() as unknown as Request,
      res as unknown as Response,
      vi.fn(),
    );

    expect(statusSpy).toHaveBeenCalledWith(401);
    expect(getBody().code).toBe("TOKEN_EXPIRED");
  });

  it("handles SyntaxError (malformed JSON)", () => {
    const res = makeRes();
    errorHandler(
      new SyntaxError("Unexpected token"),
      makeReq() as unknown as Request,
      res as unknown as Response,
      vi.fn(),
    );

    expect(statusSpy).toHaveBeenCalledWith(400);
    expect(getBody().code).toBe("INVALID_INPUT");
  });

  it("handles unknown errors as 500 INTERNAL_ERROR", () => {
    const res = makeRes();
    errorHandler(
      new Error("Something broke"),
      makeReq() as unknown as Request,
      res as unknown as Response,
      vi.fn(),
    );

    expect(statusSpy).toHaveBeenCalledWith(500);
    expect(getBody().code).toBe("INTERNAL_ERROR");
  });

  it("sanitizes messages in production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = makeRes();
      errorHandler(
        new Error("secret db password leaked"),
        makeReq() as unknown as Request,
        res as unknown as Response,
        vi.fn(),
      );
      expect(getBody().message).toBe("Internal server error");
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("includes error_id and timestamp in every response", () => {
    const res = makeRes();
    errorHandler(
      new AppError(400, "INVALID_INPUT", "bad"),
      makeReq() as unknown as Request,
      res as unknown as Response,
      vi.fn(),
    );

    const body = getBody();
    expect(typeof body.error_id).toBe("string");
    expect((body.error_id as string).length).toBeGreaterThan(0);
    expect(body.timestamp).toBeDefined();
  });

  it("logs through request logger", () => {
    const req = makeReq();
    const res = makeRes();
    errorHandler(
      new AppError(500, "INTERNAL_ERROR", "db down"),
      req as unknown as Request,
      res as unknown as Response,
      vi.fn(),
    );

    expect((req.logger as ReturnType<typeof createMockLogger>).error).toHaveBeenCalled();
  });
});
