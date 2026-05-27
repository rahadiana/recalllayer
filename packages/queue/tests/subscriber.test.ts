import { describe, it, expect, vi, beforeEach } from "vitest";
import Redis from "ioredis";
import { Subscriber } from "../src/subscriber.js";
import type { EventEnvelope, QueueConfig, Message } from "../src/types.js";
import { randomUUID } from "node:crypto";

vi.mock("ioredis");

function makeMockRedis() {
  const redis = new Redis() as jest.Mocked<Redis>;
  redis.duplicate = vi.fn().mockReturnValue({
    subscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
  } as unknown as Redis);
  redis.lpush = vi.fn().mockResolvedValue(1);
  redis.rpop = vi.fn().mockResolvedValue(null);
  redis.hset = vi.fn().mockResolvedValue(1);
  redis.hget = vi.fn().mockResolvedValue(null);
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

function makeMessage<T>(type: string, payload: T, channel = "test-chan"): Message<T> {
  return {
    id: randomUUID(),
    event: makeEnvelope(type, payload),
    meta: {
      enqueuedAt: new Date().toISOString(),
      attempt: 1,
      channel,
      consumerId: "c1",
    },
  };
}

describe("Subscriber", () => {
  let redis: jest.Mocked<Redis>;
  let events: ReturnType<typeof vi.fn>;
  let subscriber: Subscriber;
  const config: QueueConfig = { redisUrl: "redis://localhost", keyPrefix: "t" };

  beforeEach(() => {
    vi.clearAllMocks();
    redis = makeMockRedis();
    events = {
      emit: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    subscriber = new Subscriber(redis, config, events, "consumer-1");
  });

  describe("subscribe", () => {
    it("registers a handler and returns an unsubscribe function", () => {
      const handler = vi.fn();
      const unsub = subscriber.subscribe("my-chan", handler);

      expect(unsub).toBeTypeOf("function");
      expect(redis.duplicate).toHaveBeenCalled();
    });

    it("unsubscribe removes the handler", () => {
      const handler = vi.fn();
      const unsub = subscriber.subscribe("my-chan", handler);
      unsub();

      expect(() => unsub()).not.toThrow();
    });
  });

  describe("message processing", () => {
    it("emits queue:connected on subscribe", async () => {
      subscriber.subscribe("chan", vi.fn());
      await new Promise((r) => setTimeout(r, 10));
      expect(events.emit).toHaveBeenCalledWith("queue:connected", "chan");
    });

    it("processes backlog messages on subscribe via rpop", async () => {
      const event = makeEnvelope("ev", {});
      const raw = JSON.stringify(event);

      redis.rpop = vi.fn()
        .mockResolvedValueOnce(raw)
        .mockResolvedValue(null);

      subscriber.subscribe("chan", vi.fn());

      await vi.waitFor(() => {
        expect(redis.rpop).toHaveBeenCalled();
      }, { timeout: 1000 });
    });

    it("falls back to defaultChannel", () => {
      const configWithDefault: QueueConfig = { ...config, defaultChannel: "fallback" };
      const sub = new Subscriber(redis, configWithDefault, events, "c2");
      const handler = vi.fn();
      sub.subscribe(null, handler);
      expect(redis.duplicate).toHaveBeenCalled();
    });
  });
});
