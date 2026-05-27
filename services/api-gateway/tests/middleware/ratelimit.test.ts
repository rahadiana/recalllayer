import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import {
  createRateLimitMiddleware,
  createInMemoryStore,
  RateLimitExceededError,
} from "../../src/middleware/ratelimit.js";

describe("createRateLimitMiddleware", () => {
  let store: ReturnType<typeof createInMemoryStore>;

  function makeReq(path: string, workspaceId: string): Record<string, unknown> {
    return { headers: {}, path, workspaceId };
  }

  function makeRes(): Record<string, unknown> {
    return {
      setHeader: vi.fn().mockReturnValue({} as Response),
    };
  }

  beforeEach(() => {
    store = createInMemoryStore();
  });

  it("allows requests within limit", () => {
    const middleware = createRateLimitMiddleware(
      { global: { maxRequests: 5, windowMs: 60_000 }, enabled: true },
      store,
    );
    const req = makeReq("/v1/test", "ws_1");
    const res = makeRes();

    for (let i = 0; i < 5; i++) {
      const nxt = vi.fn();
      middleware(req as unknown as Request, res as unknown as Response, nxt);
      expect(nxt).toHaveBeenCalledWith();
    }
  });

  it("blocks requests exceeding limit", () => {
    const middleware = createRateLimitMiddleware(
      { global: { maxRequests: 3, windowMs: 60_000 }, enabled: true },
      store,
    );
    const req = makeReq("/v1/test", "ws_1");
    const res = makeRes();

    for (let i = 0; i < 3; i++) {
      const nxt = vi.fn();
      middleware(req as unknown as Request, res as unknown as Response, nxt);
      expect(nxt).toHaveBeenCalledWith();
    }

    const blocked = vi.fn();
    middleware(req as unknown as Request, res as unknown as Response, blocked);
    expect(blocked).toHaveBeenCalledWith(expect.any(RateLimitExceededError));
  });

  it("sets rate-limit headers", () => {
    const middleware = createRateLimitMiddleware(
      { global: { maxRequests: 10, windowMs: 60_000 }, enabled: true },
      store,
    );
    const req = makeReq("/v1/test", "ws_1");
    const res = makeRes();
    const next = vi.fn();

    middleware(req as unknown as Request, res as unknown as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 10);
    expect(next).toHaveBeenCalledWith();
  });

  it("applies per-route limits", () => {
    const middleware = createRateLimitMiddleware(
      {
        global: { maxRequests: 100, windowMs: 60_000 },
        perRoute: { "/v1/search": { maxRequests: 2, windowMs: 60_000, key: "search" } },
        enabled: true,
      },
      store,
    );
    const req = makeReq("/v1/search", "ws_1");
    const res = makeRes();

    const nxt1 = vi.fn();
    middleware(req as unknown as Request, res as unknown as Response, nxt1);
    expect(nxt1).toHaveBeenCalledWith();

    const nxt2 = vi.fn();
    middleware(req as unknown as Request, res as unknown as Response, nxt2);
    expect(nxt2).toHaveBeenCalledWith();

    const nxt3 = vi.fn();
    middleware(req as unknown as Request, res as unknown as Response, nxt3);
    expect(nxt3).toHaveBeenCalledWith(expect.any(RateLimitExceededError));
  });

  it("separates rate limits by workspace", () => {
    const middleware = createRateLimitMiddleware(
      { global: { maxRequests: 2, windowMs: 60_000 }, enabled: true },
      store,
    );
    const req1 = makeReq("/v1/test", "ws-1");
    const req2 = makeReq("/v1/test", "ws-2");
    const res = makeRes();

    let nxt = vi.fn();
    middleware(req1 as unknown as Request, res as unknown as Response, nxt);
    expect(nxt).toHaveBeenCalledWith();

    nxt = vi.fn();
    middleware(req2 as unknown as Request, res as unknown as Response, nxt);
    expect(nxt).toHaveBeenCalledWith();

    nxt = vi.fn();
    middleware(req1 as unknown as Request, res as unknown as Response, nxt);
    expect(nxt).toHaveBeenCalledWith();

    nxt = vi.fn();
    middleware(req1 as unknown as Request, res as unknown as Response, nxt);
    expect(nxt).toHaveBeenCalledWith(expect.any(RateLimitExceededError));

    nxt = vi.fn();
    middleware(req2 as unknown as Request, res as unknown as Response, nxt);
    expect(nxt).toHaveBeenCalledWith();
  });

  it("returns error with correct status code and code", () => {
    const middleware = createRateLimitMiddleware(
      { global: { maxRequests: 1, windowMs: 60_000 }, enabled: true },
      store,
    );
    const req = makeReq("/v1/test", "ws_1");
    const res = makeRes();

    const nxt1 = vi.fn();
    middleware(req as unknown as Request, res as unknown as Response, nxt1);
    expect(nxt1).toHaveBeenCalledWith();

    const nxt2 = vi.fn();
    middleware(req as unknown as Request, res as unknown as Response, nxt2);
    const err = nxt2.mock.calls[0][0] as RateLimitExceededError;
    expect(err).toBeInstanceOf(RateLimitExceededError);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe("TOO_MANY_REQUESTS");
    expect(err.retryAfterMs).toBeGreaterThan(0);
  });

  it("can be disabled", () => {
    const middleware = createRateLimitMiddleware(
      { global: { maxRequests: 1, windowMs: 60_000 }, enabled: false },
      store,
    );
    const req = makeReq("/v1/test", "ws_1");
    const res = makeRes();

    for (let i = 0; i < 10; i++) {
      const nxt = vi.fn();
      middleware(req as unknown as Request, res as unknown as Response, nxt);
      expect(nxt).toHaveBeenCalledWith();
    }
  });

  it("creates independent stores", () => {
    const s1 = createInMemoryStore();
    const s2 = createInMemoryStore();
    s1.set("key", { count: 5, resetAt: Date.now() + 10000 });
    expect(s2.get("key")).toBeUndefined();
  });

  it("resets store properly", () => {
    store.set("k1", { count: 10, resetAt: Date.now() + 10000 });
    store.set("k2", { count: 5, resetAt: Date.now() + 20000 });
    expect(store.get("k1")).toBeDefined();
    store.reset();
    expect(store.get("k1")).toBeUndefined();
    expect(store.get("k2")).toBeUndefined();
  });
});
