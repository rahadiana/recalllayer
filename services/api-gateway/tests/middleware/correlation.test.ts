import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { correlationMiddleware } from "../../src/middleware/correlation.js";
import { resetHealth } from "@memory-platform/observability";

describe("correlationMiddleware", () => {
  let req: Record<string, unknown>;
  let res: Record<string, unknown>;
  let next: NextFunction;

  beforeEach(() => {
    resetHealth();
    req = { headers: {}, method: "GET", path: "/test" };
    res = {};
    next = vi.fn();
  });

  it("injects x-request-id when missing", () => {
    correlationMiddleware(req as unknown as Request, res as unknown as Response, next);

    expect(req.requestId).toBeDefined();
    expect(typeof req.requestId).toBe("string");
    expect((req.requestId as string).length).toBeGreaterThan(0);
    expect(next).toHaveBeenCalled();
  });

  it("preserves existing x-request-id header", () => {
    (req.headers as Record<string, string>)["x-request-id"] = "existing-req-id-123";
    correlationMiddleware(req as unknown as Request, res as unknown as Response, next);

    expect(req.requestId).toBe("existing-req-id-123");
    expect(next).toHaveBeenCalled();
  });

  it("generates a correlation ID", () => {
    correlationMiddleware(req as unknown as Request, res as unknown as Response, next);

    expect(req.correlationId).toBeDefined();
    expect(typeof req.correlationId).toBe("string");
    expect(next).toHaveBeenCalled();
  });

  it("attaches a logger to the request", () => {
    correlationMiddleware(req as unknown as Request, res as unknown as Response, next);

    expect(req.logger).toBeDefined();
    expect((req.logger as Record<string, unknown>).info).toBeDefined();
    expect(typeof (req.logger as Record<string, unknown>).info).toBe("function");
  });
});
