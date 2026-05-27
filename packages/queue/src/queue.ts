import type { Redis } from "ioredis";
import type { EventEnvelope, QueueConfig, Message, PublishOptions, SubscribeOptions } from "./types.js";
import { buildKey } from "./types.js";
import { Publisher } from "./publisher.js";
import { Subscriber, type SubscriberHandler } from "./subscriber.js";
import { DeadLetterQueue } from "./dead-letter.js";
import { type RetryConfig, withRetry } from "./retry.js";
import { validateEnvelope } from "./validation.js";
import { randomUUID } from "node:crypto";

type EventEmitter = {
  emit(event: string, ...args: unknown[]): boolean;
  on(event: string, listener: (...args: unknown[]) => void): EventEmitter;
  removeListener(event: string, listener: (...args: unknown[]) => void): EventEmitter;
};

export type QueueHandler<T = unknown> = (job: Message<T>) => Promise<void> | void;

export class Queue {
  #redis: Redis;
  #config: QueueConfig;
  #publisher: Publisher;
  #subscriber: Subscriber;
  #dlq: DeadLetterQueue;
  #events: EventEmitter;
  #consumerId: string;

  constructor(redis: Redis, config: QueueConfig, events: EventEmitter) {
    this.#redis = redis;
    this.#config = config;
    this.#events = events;
    this.#consumerId = randomUUID();
    this.#publisher = new Publisher(redis, config, events, this.#consumerId);
    this.#subscriber = new Subscriber(redis, config, events, this.#consumerId);
    this.#dlq = new DeadLetterQueue(redis, config, events);
  }

  get publisher(): Publisher {
    return this.#publisher;
  }

  get subscriber(): Subscriber {
    return this.#subscriber;
  }

  get dlq(): DeadLetterQueue {
    return this.#dlq;
  }

  /**
   * Enqueue a job (event) into the named channel's list queue.
   */
  async enqueue<T>(channel: string | null | undefined, event: EventEnvelope<T>, opts?: PublishOptions): Promise<string> {
    if (!event.id) {
      event.id = randomUUID();
    }
    if (!event.timestamp) {
      event.timestamp = new Date().toISOString();
    }
    return this.#publisher.publish(channel, event, opts);
  }

  /**
   * Register a handler to process jobs from a channel. Returns an unsubscribe function.
   */
  process<T>(channel: string | null | undefined, handler: QueueHandler<T>, opts?: SubscribeOptions): () => void {
    const dlq = this.#dlq;
    const chan = channel ?? this.#config.defaultChannel ?? "default";

    const wrappedHandler: SubscriberHandler<T> = async (message: Message<T>) => {
      try {
        await handler(message);
      } catch (err) {
        if (opts?.useDLQ !== false && this.#config.enableDLQ !== false) {
          await dlq.pushToDLQ(chan, message, err instanceof Error ? err : new Error(String(err)));
        }
        throw err;
      }
    };

    return this.#subscriber.subscribe(channel, wrappedHandler, opts);
  }

  /**
   * Process a channel with retry logic. The handler is wrapped with withRetry.
   */
  processWithRetry<T>(
    channel: string | null | undefined,
    handler: QueueHandler<T>,
    retryConfig: RetryConfig,
    opts?: SubscribeOptions,
  ): () => void {
    const retryingHandler: QueueHandler<T> = async (message) => {
      await withRetry(async () => {
        await handler(message);
      }, retryConfig);
    };

    return this.process(channel, retryingHandler, opts);
  }

  /**
   * Drain all pending messages from a channel (process backlog).
   */
  async drain(channel: string | null | undefined): Promise<number> {
    const chan = channel ?? this.#config.defaultChannel ?? "default";
    const listKey = buildKey(this.#config.keyPrefix ?? "queue", "queue", chan);
    const length = await this.#redis.llen(listKey);
    await this.#redis.del(listKey);
    return length;
  }

  /**
   * Get current queue depth for a channel.
   */
  async depth(channel: string | null | undefined): Promise<number> {
    const chan = channel ?? this.#config.defaultChannel ?? "default";
    const listKey = buildKey(this.#config.keyPrefix ?? "queue", "queue", chan);
    return this.#redis.llen(listKey);
  }

  /**
   * Close the Redis connection gracefully.
   */
  async close(): Promise<void> {
    await this.#redis.quit();
  }
}
