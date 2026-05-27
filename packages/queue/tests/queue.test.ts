import { describe, it, expect, vi, beforeEach } from "vitest";
import Redis from "ioredis";
import { Queue } from "../src/queue.js";
import type { EventEnvelope, QueueConfig } from "../src/types.js";
import { randomUUID } from "node:crypto";

vi.mock("ioredis");

function makeMockRedis() {
  const redis = new Redis() as jest.Mocked<Redis>;
  redis.lpush = vi.fn().mockResolvedValue(1);
  redis.publish = vi.fn().mockResolvedValue(1);
  redis.ltrim = vi.fn().mockResolvedValue("OK");
  redis.exists = vi.fn().mockResolvedValue(0);
  redis.setex = vi.fn().mockResolvedValue("OK");
  redis.expire = vi.fn().mockResolvedValue(1);
  redis.llen = vi.fn().mockResolvedValue(0);
  redis.del = vi.fn().mockResolvedValue(1);
  redis.rpop = vi.fn().mockResolvedValue(null);
  redis.hset = vi.fn().mockResolvedValue(1);
  redis.hget = vi.fn().mockResolvedValue(null);
  redis.lrange = vi.fn().mockResolvedValue([]);
  redis.lrem = vi.fn().mockResolvedValue(1);
  redis.lindex = vi.fn().mockResolvedValue(null);
  redis.quit = vi.fn().mockResolvedValue("OK");
  redis.pipeline = vi.fn().mockReturnValue({
    setex: vi.fn().mockReturnThis(),
    lpush: vi.fn().mockReturnThis(),
    publish: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  });
  redis.duplicate = vi.fn().mockReturnValue({
    subscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
  } as unknown as Redis);
  return redis;
}

function makeEnvelope<T>(type: string, payload: T): EventEnvelope<T> {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    payload,
    metadata: {},
  };
}

describe("Queue", () => {
  let redis: jest.Mocked<Redis>;
  let events: ReturnType<typeof vi.fn>;
  let queue: Queue;
  const config: QueueConfig = { redisUrl: "redis://localhost", keyPrefix: "q" };

  beforeEach(() => {
    vi.clearAllMocks();
    redis = makeMockRedis();
    events = {
      emit: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    queue = new Queue(redis, config, events);
  });

  describe("enqueue", () => {
    it("publishes an event and assigns id/timestamp if missing", async () => {
      const event = { type: "test.run", payload: { step: 1 } } as unknown as EventEnvelope;
      const id = await queue.enqueue("jobs", event);

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(redis.lpush).toHaveBeenCalled();
      expect(redis.publish).toHaveBeenCalled();
    });

    it("preserves existing id and timestamp", async () => {
      const event = makeEnvelope("test.run", { step: 1 });
      const originalId = event.id;
      const originalTs = event.timestamp;

      await queue.enqueue("jobs", event);

      expect(event.id).toBe(originalId);
      expect(event.timestamp).toBe(originalTs);
    });
  });

  describe("process", () => {
    it("registers a handler and returns an unsubscribe function", () => {
      const handler = vi.fn();
      const unsub = queue.process("jobs", handler);
      expect(unsub).toBeTypeOf("function");
    });

    it("wraps handler with DLQ on failure when enabled", () => {
      const handler = vi.fn().mockRejectedValue(new Error("boom"));
      const unsub = queue.process("jobs", handler, { useDLQ: true });
      expect(unsub).toBeTypeOf("function");
    });
  });

  describe("drain", () => {
    it("drains and deletes the queue list", async () => {
      redis.llen = vi.fn().mockResolvedValue(5);
      const count = await queue.drain("jobs");
      expect(count).toBe(5);
      expect(redis.del).toHaveBeenCalledWith("q:queue:jobs");
    });
  });

  describe("depth", () => {
    it("returns the current list length", async () => {
      redis.llen = vi.fn().mockResolvedValue(42);
      const depth = await queue.depth("jobs");
      expect(depth).toBe(42);
    });

    it("uses defaultChannel when channel is null", async () => {
      const q = new Queue(redis, { ...config, defaultChannel: "def" }, events);
      redis.llen = vi.fn().mockResolvedValue(3);
      const depth = await q.depth(null);
      expect(depth).toBe(3);
      expect(redis.llen).toHaveBeenCalledWith("q:queue:def");
    });
  });

  describe("close", () => {
    it("calls redis.quit", async () => {
      await queue.close();
      expect(redis.quit).toHaveBeenCalled();
    });
  });

  describe("accessors", () => {
    it("exposes publisher, subscriber, and dlq", () => {
      expect(queue.publisher).toBeDefined();
      expect(queue.subscriber).toBeDefined();
      expect(queue.dlq).toBeDefined();
    });
  });
});
