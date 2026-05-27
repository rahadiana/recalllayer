import { describe, it, expect, vi, beforeEach } from "vitest";
import Redis from "ioredis";
import { Publisher } from "../src/publisher.js";
import { validateEnvelope } from "../src/validation.js";
import type { EventEnvelope, QueueConfig } from "../src/types.js";
import { randomUUID } from "node:crypto";

vi.mock("ioredis");

const mockRedis = new Redis() as jest.Mocked<Redis>;
const mockEvents = {
  emit: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
};

const testConfig: QueueConfig = {
  redisUrl: "redis://localhost:6379",
  keyPrefix: "test",
  defaultChannel: "default",
};

function makeEnvelope<T>(type: string, payload: T): EventEnvelope<T> {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    payload,
    metadata: { source: "test" },
  };
}

describe("Publisher", () => {
  let publisher: Publisher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.lpush = vi.fn().mockResolvedValue(1);
    mockRedis.publish = vi.fn().mockResolvedValue(1);
    mockRedis.ltrim = vi.fn().mockResolvedValue("OK");
    mockRedis.exists = vi.fn().mockResolvedValue(0);
    mockRedis.setex = vi.fn().mockResolvedValue("OK");
    mockRedis.expire = vi.fn().mockResolvedValue(1);
    mockRedis.pipeline = vi.fn().mockReturnValue({
      setex: vi.fn().mockReturnThis(),
      lpush: vi.fn().mockReturnThis(),
      publish: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    });
    publisher = new Publisher(mockRedis, testConfig, mockEvents, "consumer-1");
  });

  describe("publish", () => {
    it("publishes an event to the list and pubsub channel", async () => {
      const event = makeEnvelope("test.event", { foo: "bar" });
      const id = await publisher.publish("my-channel", event);

      expect(id).toBe(event.id);
      expect(mockRedis.lpush).toHaveBeenCalledWith("test:queue:my-channel", JSON.stringify(event));
      expect(mockRedis.publish).toHaveBeenCalledWith("test:pubsub:my-channel", JSON.stringify(event));
      expect(mockEvents.emit).toHaveBeenCalledWith("queue:publishing", event);
      expect(mockEvents.emit).toHaveBeenCalledWith("queue:published", event, "my-channel");
    });

    it("rejects duplicate events when dedupeKey is set", async () => {
      mockRedis.exists = vi.fn().mockResolvedValue(1);
      const event = makeEnvelope("test.event", { foo: "bar" });

      await expect(
        publisher.publish("ch", event, { dedupeKey: "dup-1" }),
      ).rejects.toThrow("Duplicate event rejected");
    });

    it("trims the list when maxQueueLength is configured", async () => {
      const event = makeEnvelope("test.event", { foo: "bar" });
      const configWithMax: QueueConfig = { ...testConfig, maxQueueLength: 100 };
      const pub = new Publisher(mockRedis, configWithMax, mockEvents, "c1");

      await pub.publish("ch", event);
      expect(mockRedis.ltrim).toHaveBeenCalledWith("test:queue:ch", 0, 99);
    });

    it("rejects invalid envelopes", async () => {
      const invalid = { type: "bad" } as unknown as EventEnvelope;
      await expect(publisher.publish("ch", invalid)).rejects.toThrow("Invalid EventEnvelope");
    });

    it("falls back to defaultChannel when no channel specified", async () => {
      const event = makeEnvelope("test.event", {});
      await publisher.publish(null, event);
      expect(mockRedis.lpush).toHaveBeenCalledWith("test:queue:default", expect.any(String));
    });
  });

  describe("publishBulk", () => {
    it("publishes multiple events in a pipeline", async () => {
      const events = [
        makeEnvelope("test.e1", { n: 1 }),
        makeEnvelope("test.e2", { n: 2 }),
        makeEnvelope("test.e3", { n: 3 }),
      ];

      const ids = await publisher.publishBulk("bulk-chan", events);

      expect(ids).toEqual(events.map((e) => e.id));
      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it("sets TTL on the list when ttl option is provided", async () => {
      const pipelineExec = vi.fn().mockResolvedValue([]);
      const pipelineObj = {
        setex: vi.fn().mockReturnThis(),
        lpush: vi.fn().mockReturnThis(),
        publish: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: pipelineExec,
      };
      mockRedis.pipeline = vi.fn().mockReturnValue(pipelineObj);

      const events = [makeEnvelope("e", {})];
      await publisher.publishBulk("ch", events, { ttl: 120 });

      expect(pipelineObj.expire).toHaveBeenCalledWith("test:queue:ch", 120);
    });
  });
});

describe("validateEnvelope", () => {
  it("passes valid envelopes", () => {
    const env = makeEnvelope("e", {});
    expect(() => validateEnvelope(env)).not.toThrow();
  });

  it("rejects envelopes missing required fields", () => {
    expect(() => validateEnvelope({ type: "e" } as EventEnvelope)).toThrow("Invalid EventEnvelope");
    expect(() => validateEnvelope({ id: "1" } as EventEnvelope)).toThrow("Invalid EventEnvelope");
    expect(() => validateEnvelope({ id: "1", type: "e" } as EventEnvelope)).toThrow("Invalid EventEnvelope");
  });

  it("accepts optional metadata, correlationId, causationId", () => {
    const env = makeEnvelope("e", {});
    env.correlationId = randomUUID();
    env.causationId = randomUUID();
    expect(() => validateEnvelope(env)).not.toThrow();
  });
});
