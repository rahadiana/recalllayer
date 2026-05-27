import { describe, it, expect, beforeEach, vi } from "vitest";
import "./setup.js";

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
    healthEndpoint: vi.fn().mockReturnValue(async () => ({
      status: "healthy",
      service: "test",
      uptime: 0,
      timestamp: new Date().toISOString(),
      checks: [],
    })),
    registerCheck: vi.fn(),
    getCorrelationId: vi.fn().mockReturnValue(null),
    withCorrelationId: vi.fn().mockImplementation((_id, fn) => fn()),
    withCorrelationIdAsync: vi.fn().mockImplementation(async (_id, fn) => fn()),
  };
});

vi.mock("@memory-platform/shared-utils", () => {
  let counter = 0;
  return {
    generateId: vi.fn(() => {
      counter++;
      return `test_id_${counter}`;
    }),
  };
});

vi.mock("@memory-platform/queue", () => {
  const publish = vi.fn().mockResolvedValue("mock_event_id");
  const subscribe = vi.fn().mockReturnValue(() => undefined);
  return {
    Publisher: class {
      publish = publish;
      publishBulk = vi.fn().mockResolvedValue(["mock_event_id"]);
    },
    Subscriber: class {
      subscribe = subscribe;
      unsubscribe = vi.fn();
    },
    validateEnvelope: vi.fn().mockReturnValue({}),
    buildKey: vi.fn((...args: string[]) => args.join(":")),
  };
});

import { ProfileMemoryWorker } from "../src/worker.js";
import { ProfileRepository } from "../src/profile-repository.js";
import { EventPublisher } from "../src/events.js";
import type { WorkspaceId } from "@memory-platform/shared-schemas";

describe("ProfileMemoryWorker", () => {
  let worker: ProfileMemoryWorker;
  let mockRepo: ProfileRepository;
  let mockEvents: EventPublisher;
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      ping: vi.fn().mockResolvedValue("PONG"),
      quit: vi.fn().mockResolvedValue("OK"),
      publish: vi.fn().mockResolvedValue(1),
      duplicate: vi.fn().mockReturnValue({
        subscribe: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        quit: vi.fn(),
      }),
      lpush: vi.fn().mockResolvedValue(1),
      rpop: vi.fn().mockResolvedValue(null),
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
    };

    mockRepo = new ProfileRepository({
      sql: vi.fn(),
      health: vi.fn().mockResolvedValue({ status: "healthy", latencyMs: 1, checkedAt: new Date() }),
      close: vi.fn().mockResolvedValue(undefined),
    });

    mockEvents = new EventPublisher(mockRedis, {
      redisUrl: "redis://localhost:6379",
      defaultChannel: "profile",
      keyPrefix: "profile",
    });

    worker = new ProfileMemoryWorker({
      redis: mockRedis,
      queueConfig: {
        redisUrl: "redis://localhost:6379",
        defaultChannel: "profile",
        keyPrefix: "profile",
      },
      repo: mockRepo,
      events: mockEvents,
      config: {
        port: 3007,
        postgresUrl: "postgres://localhost:5432/test",
        redisUrl: "redis://localhost:6379",
        queuePrefix: "profile",
        inferenceConfidenceThreshold: 0.7,
        maxBehaviorEventsPerProfile: 10000,
        maxFactsPerProfile: 500,
      },
    });
  });

  it("starts without errors", () => {
    expect(() => worker.start()).not.toThrow();
  });

  it("stops without errors", () => {
    worker.start();
    expect(() => worker.stop()).not.toThrow();
  });

  it("subscribes to all required channels", () => {
    expect(() => worker.start()).not.toThrow();
    expect(() => worker.stop()).not.toThrow();
  });

  it("can start and stop multiple times", () => {
    worker.start();
    worker.stop();
    expect(() => worker.start()).not.toThrow();
    worker.stop();
  });
});
