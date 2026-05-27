import { describe, it, expect, vi, beforeEach } from "vitest";
import Redis from "ioredis";
import { DeadLetterQueue } from "../src/dead-letter.js";
import type { QueueConfig, Message } from "../src/types.js";
import { randomUUID } from "node:crypto";

vi.mock("ioredis");

function makeMockRedis() {
  const redis = new Redis() as jest.Mocked<Redis>;
  redis.lpush = vi.fn().mockResolvedValue(1);
  redis.rpop = vi.fn().mockResolvedValue(null);
  redis.llen = vi.fn().mockResolvedValue(0);
  redis.lindex = vi.fn().mockResolvedValue(null);
  redis.lrange = vi.fn().mockResolvedValue([]);
  redis.lrem = vi.fn().mockResolvedValue(1);
  redis.del = vi.fn().mockResolvedValue(1);
  redis.pipeline = vi.fn().mockReturnValue({
    lpush: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  });
  return redis;
}

function makeMessage(channel = "test-chan"): Message {
  return {
    id: randomUUID(),
    event: {
      id: randomUUID(),
      type: "test.event",
      timestamp: new Date().toISOString(),
      payload: { data: "hello" },
    },
    meta: {
      enqueuedAt: new Date().toISOString(),
      attempt: 3,
      channel,
      consumerId: "c1",
    },
  };
}

describe("DeadLetterQueue", () => {
  let redis: jest.Mocked<Redis>;
  let events: ReturnType<typeof vi.fn>;
  let dlq: DeadLetterQueue;
  const config: QueueConfig = { redisUrl: "redis://localhost", keyPrefix: "dlq" };

  beforeEach(() => {
    vi.clearAllMocks();
    redis = makeMockRedis();
    events = { emit: vi.fn() };
    dlq = new DeadLetterQueue(redis, config, events);
  });

  describe("pushToDLQ", () => {
    it("pushes a failed message to the DLQ list", async () => {
      const msg = makeMessage();
      const error = new Error("Handler failed");

      await dlq.pushToDLQ("orders", msg, error);

      expect(redis.lpush).toHaveBeenCalledWith(
        "dlq:dlq:orders",
        expect.stringContaining(msg.id),
      );
      expect(events.emit).toHaveBeenCalledWith("queue:dead-letter", msg, error);
    });
  });

  describe("replayFromDLQ", () => {
    it("replays all dead messages back to the live queue", async () => {
      const msg1 = makeMessage();
      const msg2 = makeMessage();
      const entry1 = JSON.stringify({ message: msg1, error: "e1", failedAt: "2024-01-01", attempts: 2, queueName: "orders" });
      const entry2 = JSON.stringify({ message: msg2, error: "e2", failedAt: "2024-01-02", attempts: 1, queueName: "orders" });

      redis.rpop = vi.fn()
        .mockResolvedValueOnce(entry1)
        .mockResolvedValueOnce(entry2)
        .mockResolvedValue(null);

      const count = await dlq.replayFromDLQ("orders");

      expect(count).toBe(2);
      expect(redis.rpop).toHaveBeenCalledTimes(3);
    });

    it("returns 0 when DLQ is empty", async () => {
      redis.rpop = vi.fn().mockResolvedValue(null);
      const count = await dlq.replayFromDLQ("orders");
      expect(count).toBe(0);
    });
  });

  describe("getDLQStats", () => {
    it("returns DLQ statistics", async () => {
      const dlqEntry = { message: makeMessage(), error: "e", failedAt: "2024-06-15T10:00:00Z", attempts: 2, queueName: "orders" };
      redis.llen = vi.fn().mockResolvedValue(42);
      redis.lindex = vi.fn()
        .mockResolvedValueOnce(JSON.stringify(dlqEntry))
        .mockResolvedValueOnce(JSON.stringify(dlqEntry));

      const stats = await dlq.getDLQStats("orders");

      expect(stats).toEqual({
        queueName: "orders",
        totalDead: 42,
        oldestEntry: "2024-06-15T10:00:00Z",
        newestEntry: "2024-06-15T10:00:00Z",
      });
    });

    it("handles empty DLQ", async () => {
      redis.llen = vi.fn().mockResolvedValue(0);
      redis.lindex = vi.fn().mockResolvedValue(null);

      const stats = await dlq.getDLQStats("orders");

      expect(stats).toEqual({
        queueName: "orders",
        totalDead: 0,
        oldestEntry: null,
        newestEntry: null,
      });
    });
  });

  describe("peekDLQ", () => {
    it("returns entries without removing them", async () => {
      const msg = makeMessage();
      const entry = JSON.stringify({ message: msg, error: "e", failedAt: "2024-01-01", attempts: 1, queueName: "q" });
      redis.lrange = vi.fn().mockResolvedValue([entry]);

      const entries = await dlq.peekDLQ("q", 5);

      expect(entries).toHaveLength(1);
      expect(entries[0].message.id).toBe(msg.id);
      expect(redis.lrange).toHaveBeenCalledWith("dlq:dlq:q", 0, 4);
    });
  });

  describe("removeFromDLQ", () => {
    it("removes a specific message from the DLQ", async () => {
      const msg = makeMessage();
      const entry = JSON.stringify({ message: msg, error: "e", failedAt: "2024-01-01", attempts: 1, queueName: "q" });
      redis.lrange = vi.fn().mockResolvedValue([entry]);

      const removed = await dlq.removeFromDLQ("q", msg.id);

      expect(removed).toBe(true);
      expect(redis.lrem).toHaveBeenCalledWith("dlq:dlq:q", 1, entry);
    });

    it("returns false when message not found", async () => {
      redis.lrange = vi.fn().mockResolvedValue([]);
      const removed = await dlq.removeFromDLQ("q", "nonexistent");
      expect(removed).toBe(false);
    });
  });

  describe("purgeDLQ", () => {
    it("deletes the DLQ key", async () => {
      await dlq.purgeDLQ("orders");
      expect(redis.del).toHaveBeenCalledWith("dlq:dlq:orders");
    });
  });
});
