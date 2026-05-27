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

const mockPing = vi.fn();
const mockQuit = vi.fn();
const mockRedisOn = vi.fn();
vi.mock("ioredis", () => ({
  default: vi.fn(() => ({
    ping: mockPing,
    quit: mockQuit,
    on: mockRedisOn,
  })),
}));

const mockGetCollections = vi.fn();
vi.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: vi.fn(() => ({
    getCollections: mockGetCollections,
  })),
}));

const mockSessionRun = vi.fn();
const mockSessionClose = vi.fn();
const mockDriverClose = vi.fn();
const mockVerifyConnectivity = vi.fn();
const { mockAuthBasic } = vi.hoisted(() => ({
  mockAuthBasic: vi.fn(() => ({})),
}));

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => ({
      session: vi.fn(() => ({ run: mockSessionRun, close: mockSessionClose })),
      close: mockDriverClose,
      verifyConnectivity: mockVerifyConnectivity,
    })),
    auth: { basic: mockAuthBasic },
  },
}));

const mockS3Send = vi.fn();
const mockS3Destroy = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({ send: mockS3Send, destroy: mockS3Destroy })),
  ListBucketsCommand: vi.fn(),
}));

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(() => mockLogger),
};

vi.mock("@memory-platform/observability", () => ({
  createLogger: vi.fn(() => mockLogger),
}));

import { createDbClients, initDatabases } from "../src/init.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createDbClients", () => {
  it("returns aggregated DbClients with health and close", () => {
    const config = { postgresUrl: "postgres://localhost/db" };
    const clients = createDbClients(config);
    expect(clients.postgres).toBeDefined();
    expect(typeof clients.health).toBe("function");
    expect(typeof clients.close).toBe("function");
  });

  it("creates only clients for which URLs are provided", () => {
    const config = {
      postgresUrl: "postgres://localhost/db",
      redisUrl: "redis://localhost:6379",
    };
    const clients = createDbClients(config);
    expect(clients.postgres).toBeDefined();
    expect(clients.redis).toBeDefined();
    expect(clients.vector).toBeUndefined();
    expect(clients.graph).toBeUndefined();
    expect(clients.storage).toBeUndefined();
  });

  it("creates all clients when all URLs provided", () => {
    const config = {
      postgresUrl: "postgres://localhost/db",
      redisUrl: "redis://localhost:6379",
      qdrantUrl: "http://localhost:6333",
      neo4jUrl: "bolt://localhost:7687",
      neo4jUser: "neo4j",
      neo4jPassword: "secret",
      s3Endpoint: "http://localhost:9000",
      s3Region: "us-east-1",
    };
    const clients = createDbClients(config);
    expect(clients.postgres).toBeDefined();
    expect(clients.redis).toBeDefined();
    expect(clients.vector).toBeDefined();
    expect(clients.graph).toBeDefined();
    expect(clients.storage).toBeDefined();
  });

  it("creates no clients when no URLs provided", () => {
    const clients = createDbClients({});
    expect(clients.postgres).toBeUndefined();
    expect(clients.redis).toBeUndefined();
    expect(clients.vector).toBeUndefined();
    expect(clients.graph).toBeUndefined();
    expect(clients.storage).toBeUndefined();
  });

  it("health runs checks in parallel for all configured clients", async () => {
    mockSqlQuery.mockResolvedValue([{ check_result: 1 }]);
    mockPing.mockResolvedValue("PONG");
    mockGetCollections.mockResolvedValue({ collections: [{ name: "c1" }] });
    mockSessionRun.mockResolvedValue({ records: [{ get: () => 1 }] });
    mockS3Send.mockResolvedValue({ Buckets: [{ Name: "b1" }] });

    const config = {
      postgresUrl: "postgres://localhost/db",
      redisUrl: "redis://localhost:6379",
      qdrantUrl: "http://localhost:6333",
      neo4jUrl: "bolt://localhost:7687",
      neo4jUser: "neo4j",
      neo4jPassword: "secret",
      s3Endpoint: "http://localhost:9000",
      s3Region: "us-east-1",
    };
    const clients = createDbClients(config);
    const results = await clients.health();
    expect(results.postgres).toBeDefined();
    expect(results.redis).toBeDefined();
    expect(results.vector).toBeDefined();
    expect(results.graph).toBeDefined();
    expect(results.storage).toBeDefined();
  });

  it("close shuts down all clients in parallel", async () => {
    mockQuit.mockResolvedValue("OK");
    const config = {
      postgresUrl: "postgres://localhost/db",
      redisUrl: "redis://localhost:6379",
    };
    const clients = createDbClients(config);
    await clients.close();
    expect(mockSqlEnd).toHaveBeenCalled();
    expect(mockQuit).toHaveBeenCalled();
  });

  it("close handles no configured clients gracefully", async () => {
    const clients = createDbClients({});
    await expect(clients.close()).resolves.toBeUndefined();
  });

  it("health handles no configured clients gracefully", async () => {
    const clients = createDbClients({});
    const results = await clients.health();
    expect(results).toEqual({});
  });
});

describe("initDatabases", () => {
  it("creates clients and runs health checks", async () => {
    mockSqlQuery.mockResolvedValue([{ check_result: 1 }]);
    const config = { postgresUrl: "postgres://localhost/db" };
    const clients = await initDatabases(config);
    expect(clients.postgres).toBeDefined();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("healthy"),
      expect.anything(),
    );
  });

  it("logs unhealthy databases", async () => {
    mockSqlQuery.mockRejectedValue(new Error("fail"));
    const config = { postgresUrl: "postgres://localhost/db" };
    await initDatabases(config);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("unhealthy"),
      expect.anything(),
    );
  });
});
