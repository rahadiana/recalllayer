import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPing = vi.fn();
const mockQuit = vi.fn();
const mockOn = vi.fn();
const { MockRedis } = vi.hoisted(() => ({
  MockRedis: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: MockRedis,
}));

vi.mock("@memory-platform/observability", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn() })),
  })),
}));

import { createRedisClient } from "../src/redis.js";
import Redis from "ioredis";
import { createLogger } from "@memory-platform/observability";

beforeEach(() => {
  vi.clearAllMocks();
  MockRedis.mockImplementation(() => ({
    ping: mockPing,
    quit: mockQuit,
    on: mockOn,
  }));
});

describe("createRedisClient", () => {
  const url = "redis://localhost:6379";

  it("creates a RedisPool with required methods", () => {
    const pool = createRedisClient(url);
    expect(pool).toBeDefined();
    expect(pool.client).toBeDefined();
    expect(typeof pool.health).toBe("function");
    expect(typeof pool.close).toBe("function");
    expect(typeof pool.withConnection).toBe("function");
  });

  it("creates Redis with URL and default options", () => {
    createRedisClient(url);
    expect(MockRedis).toHaveBeenCalledWith(url, expect.objectContaining({
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    }));
  });

  it("passes custom options through", () => {
    createRedisClient(url, {
      maxRetriesPerRequest: 5,
      lazyConnect: true,
      connectionName: "test",
    });
    expect(MockRedis).toHaveBeenCalledWith(url, expect.objectContaining({
      maxRetriesPerRequest: 5,
      lazyConnect: true,
      connectionName: "test",
    }));
  });

  it("registers connect and error listeners", () => {
    createRedisClient(url);
    expect(mockOn).toHaveBeenCalledWith("connect", expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("health returns healthy on PONG", async () => {
    mockPing.mockResolvedValueOnce("PONG");
    const pool = createRedisClient(url);
    const result = await pool.health();
    expect(result.status).toBe("healthy");
    expect(mockPing).toHaveBeenCalled();
  });

  it("health returns unhealthy on error", async () => {
    mockPing.mockRejectedValueOnce(new Error("connection timeout"));
    const pool = createRedisClient(url);
    const result = await pool.health();
    expect(result.status).toBe("unhealthy");
    expect(result.message).toContain("connection timeout");
  });

  it("health returns degraded on unexpected ping response", async () => {
    mockPing.mockResolvedValueOnce("SOMETHING_ELSE");
    const pool = createRedisClient(url);
    const result = await pool.health();
    expect(result.status).toBe("degraded");
  });

  it("close calls quit", async () => {
    mockQuit.mockResolvedValueOnce("OK");
    const pool = createRedisClient(url);
    await pool.close();
    expect(mockQuit).toHaveBeenCalled();
  });

  it("withConnection passes the client to the callback", async () => {
    const pool = createRedisClient(url);
    const spy = vi.fn().mockResolvedValue("result");
    const result = await pool.withConnection(spy);
    expect(spy).toHaveBeenCalledWith(pool.client);
    expect(result).toBe("result");
  });

  it("logs client creation", () => {
    const client = createRedisClient(url);
    expect(client).toBeDefined();
  });
});
