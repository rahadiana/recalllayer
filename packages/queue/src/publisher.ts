import type { Redis } from "ioredis";
import type { EventEnvelope, QueueConfig, PublishOptions } from "./types.js";
import { buildKey } from "./types.js";
import { validateEnvelope } from "./validation.js";

type EventEmitter = {
  emit(event: string, ...args: unknown[]): boolean;
  on(event: string, listener: (...args: unknown[]) => void): EventEmitter;
};

export class Publisher {
  #redis: Redis;
  #config: QueueConfig;
  #events: EventEmitter;
  #consumerId: string;

  constructor(redis: Redis, config: QueueConfig, events: EventEmitter, consumerId: string) {
    this.#redis = redis;
    this.#config = config;
    this.#events = events;
    this.#consumerId = consumerId;
  }

  /**
   * Publish a single typed event to a Redis pub/sub channel.
   * Validates the envelope shape before publishing.
   */
  async publish<T>(channel: string | null | undefined, event: EventEnvelope<T>, opts?: PublishOptions): Promise<string> {
    const chan = channel ?? opts?.channel ?? this.#config.defaultChannel ?? "default";
    const validated = validateEnvelope(event);

    this.#events.emit("queue:publishing", validated);

    if (opts?.dedupeKey) {
      const dedupeKey = buildKey(this.#config.keyPrefix ?? "queue", "dedupe", chan, opts.dedupeKey);
      const exists = await this.#redis.exists(dedupeKey);
      if (exists) {
        throw new Error(`Duplicate event rejected for dedupe key: ${opts.dedupeKey}`);
      }
      const ttl = opts.ttl ?? 300;
      await this.#redis.setex(dedupeKey, ttl, "1");
    }

    const serialized = JSON.stringify(validated);
    const listKey = buildKey(this.#config.keyPrefix ?? "queue", "queue", chan);

    if (this.#config.maxQueueLength && this.#config.maxQueueLength > 0) {
      await this.#redis.lpush(listKey, serialized);
      await this.#redis.ltrim(listKey, 0, this.#config.maxQueueLength - 1);
    } else {
      await this.#redis.lpush(listKey, serialized);
    }

    const pubKey = buildKey(this.#config.keyPrefix ?? "queue", "pubsub", chan);
    await this.#redis.publish(pubKey, serialized);

    if (opts?.ttl) {
      await this.#redis.expire(listKey, opts.ttl);
    }

    this.#events.emit("queue:published", validated, chan);
    return validated.id;
  }

  /**
   * Publish multiple events in a pipelined batch for efficiency.
   */
  async publishBulk<T>(channel: string | null | undefined, events: EventEnvelope<T>[], opts?: PublishOptions): Promise<string[]> {
    const chan = channel ?? opts?.channel ?? this.#config.defaultChannel ?? "default";
    const listKey = buildKey(this.#config.keyPrefix ?? "queue", "queue", chan);
    const pubKey = buildKey(this.#config.keyPrefix ?? "queue", "pubsub", chan);
    const ids: string[] = [];

    const pipeline = this.#redis.pipeline();

    for (const event of events) {
      const validated = validateEnvelope(event);
      this.#events.emit("queue:publishing", validated);

      if (opts?.dedupeKey) {
        const dedupeKey = buildKey(this.#config.keyPrefix ?? "queue", "dedupe", chan, `${opts.dedupeKey}:${validated.id}`);
        pipeline.setex(dedupeKey, opts.ttl ?? 300, "1");
      }

      const serialized = JSON.stringify(validated);
      pipeline.lpush(listKey, serialized);
      pipeline.publish(pubKey, serialized);
      ids.push(validated.id);
    }

    if (opts?.ttl) {
      pipeline.expire(listKey, opts.ttl);
    }

    await pipeline.exec();

    for (const event of events) {
      this.#events.emit("queue:published", event, chan);
    }

    return ids;
  }
}
