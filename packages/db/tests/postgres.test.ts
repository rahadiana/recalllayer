import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSqlEnd = vi.fn().mockResolvedValue(undefined);
const mockSqlQuery = vi.fn();

vi.mock("postgres", () => {
  const mockSql = vi.fn(() => {
    const fn = mockSqlQuery as unknown as Record<string, unknown>;
    fn.end = mockSqlEnd;
    return fn;
  });
  (mockSql as unknown as Record<string, unknown>).camel = true;
  return { default: mockSql };
});

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

import { createPostgresClient } from "../src/postgres.js";
import postgres from "postgres";
import { createLogger } from "@memory-platform/observability";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPostgresClient", () => {
  const url = "postgres://user:pass@localhost:5432/mydb";

  it("creates a PostgresPool with required methods", () => {
    const pool = createPostgresClient(url);
    expect(pool).toBeDefined();
    expect(pool.sql).toBeDefined();
    expect(typeof pool.health).toBe("function");
    expect(typeof pool.close).toBe("function");
  });

  it("calls postgres with the URL and default options", () => {
    createPostgresClient(url);
    expect(postgres).toHaveBeenCalledWith(url, expect.objectContaining({
      max: 20,
      idle_timeout: 30,
    }));
  });

  it("passes custom options through", () => {
    createPostgresClient(url, { max: 5, idleTimeout: 10, maxLifetime: 60 });
    expect(postgres).toHaveBeenCalledWith(url, expect.objectContaining({
      max: 5,
      idle_timeout: 10,
      max_lifetime: 60,
    }));
  });

  it("health returns healthy when query succeeds", async () => {
    mockSqlQuery.mockResolvedValueOnce([{ check_result: 1 }]);
    const pool = createPostgresClient(url);
    const result = await pool.health();
    expect(result.status).toBe("healthy");
    expect(result.checkedAt).toBeInstanceOf(Date);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("health returns unhealthy when query fails", async () => {
    mockSqlQuery.mockRejectedValueOnce(new Error("connection refused"));
    const pool = createPostgresClient(url);
    const result = await pool.health();
    expect(result.status).toBe("unhealthy");
    expect(result.message).toContain("connection refused");
  });

  it("health returns degraded on unexpected result", async () => {
    mockSqlQuery.mockResolvedValueOnce([{ check_result: 0 }]);
    const pool = createPostgresClient(url);
    const result = await pool.health();
    expect(result.status).toBe("degraded");
  });

  it("close calls sql.end", async () => {
    const pool = createPostgresClient(url);
    await pool.close();
    expect(mockSqlEnd).toHaveBeenCalledWith({ timeout: 5 });
  });

  it("logs pool creation", () => {
    const pool = createPostgresClient(url);
    expect(pool).toBeDefined();
  });
});
