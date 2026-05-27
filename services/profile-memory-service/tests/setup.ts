import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@memory-platform/observability", () => {
  const mockLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    createLogger: vi.fn().mockReturnValue(mockLogger),
    recordMetric: vi.fn(),
    getCorrelationId: vi.fn().mockReturnValue(null),
    healthEndpoint: vi.fn().mockReturnValue(async () => ({
      status: "healthy",
      service: "test",
      uptime: 0,
      timestamp: new Date().toISOString(),
      checks: [],
    })),
    registerCheck: vi.fn(),
    healthCheck: vi.fn(),
    resetHealth: vi.fn(),
  };
});

vi.mock("@memory-platform/shared-utils", () => {
  let counter = 0;
  return {
    generateId: vi.fn(() => {
      counter++;
      return `id_${counter}`;
    }),
    isValidId: vi.fn(() => true),
    generateShortId: vi.fn(() => `short_${++counter}`),
  };
});

vi.mock("@memory-platform/db", () => {
  const sql = vi.fn();
  return {
    createPostgresClient: vi.fn().mockReturnValue({
      sql,
      health: vi.fn().mockResolvedValue({ status: "healthy", latencyMs: 1, checkedAt: new Date() }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
    createRedisClient: vi.fn().mockReturnValue({
      client: {
        ping: vi.fn().mockResolvedValue("PONG"),
        quit: vi.fn().mockResolvedValue("OK"),
        publish: vi.fn().mockResolvedValue(1),
        duplicate: vi.fn().mockReturnValue({
          subscribe: vi.fn().mockResolvedValue(undefined),
          on: vi.fn(),
        }),
        lpush: vi.fn().mockResolvedValue(1),
        rpop: vi.fn().mockResolvedValue(null),
        exist: vi.fn().mockResolvedValue(0),
        setex: vi.fn().mockResolvedValue("OK"),
        ltrim: vi.fn().mockResolvedValue("OK"),
        pipeline: vi.fn().mockReturnValue({
          lpush: vi.fn().mockReturnThis(),
          publish: vi.fn().mockReturnThis(),
          setex: vi.fn().mockReturnThis(),
          expire: vi.fn().mockReturnThis(),
          exec: vi.fn().mockResolvedValue([]),
        }),
        hget: vi.fn().mockResolvedValue(null),
        hset: vi.fn().mockResolvedValue(1),
        expire: vi.fn().mockResolvedValue(1),
      },
      health: vi.fn().mockResolvedValue({ status: "healthy", latencyMs: 1, checkedAt: new Date() }),
      close: vi.fn().mockResolvedValue(undefined),
      withConnection: vi.fn().mockImplementation(async (fn) => fn({})),
    }),
    createDbClients: vi.fn(),
    initDatabases: vi.fn(),
  };
});

vi.mock("@memory-platform/queue", () => {
  return {
    Publisher: class {
      publish = vi.fn().mockResolvedValue("mock_event_id");
      publishBulk = vi.fn().mockResolvedValue(["mock_event_id"]);
    },
    Subscriber: class {
      subscribe = vi.fn().mockReturnValue(() => undefined);
      unsubscribe = vi.fn();
    },
    validateEnvelope: vi.fn().mockReturnValue({}),
    buildKey: vi.fn((...args: string[]) => args.join(":")),
  };
});
