import type { Redis } from "ioredis";
import type { EventEnvelope, QueueConfig, Message, SubscribeOptions } from "./types.js";
import { buildKey } from "./types.js";
import { validateEnvelope } from "./validation.js";

type EventEmitter = {
  emit(event: string, ...args: unknown[]): boolean;
  on(event: string, listener: (...args: unknown[]) => void): EventEmitter;
  removeListener(event: string, listener: (...args: unknown[]) => void): EventEmitter;
};

export type SubscriberHandler<T = unknown> = (message: Message<T>) => Promise<void> | void;

export class Subscriber {
  #redis: Redis;
  #config: QueueConfig;
  #events: EventEmitter;
  #consumerId: string;
  #handlers = new Map<string, Set<SubscriberHandler<any>>>();
  #subscribed = new Map<string, boolean>();
  #activeCount = new Map<string, number>();

  constructor(redis: Redis, config: QueueConfig, events: EventEmitter, consumerId: string) {
    this.#redis = redis;
    this.#config = config;
    this.#events = events;
    this.#consumerId = consumerId;
  }

  /**
   * Subscribe to a channel with a typed handler. Messages are dequeued
   * from the Redis list and delivered to the handler.
   */
  subscribe<T>(channel: string | null | undefined, handler: SubscriberHandler<T>, opts?: SubscribeOptions): () => void {
    const chan = channel ?? this.#config.defaultChannel ?? "default";
    const concurrency = opts?.concurrency ?? 1;
    const autoAck = opts?.autoAcknowledge ?? false;

    if (!this.#handlers.has(chan)) {
      this.#handlers.set(chan, new Set());
      this.#activeCount.set(chan, 0);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.#handlers.get(chan) as Set<SubscriberHandler<any>>).add(handler as SubscriberHandler<any>);

    if (!this.#subscribed.get(chan)) {
      this.#subscribed.set(chan, true);
      void this.#listen(chan, concurrency, autoAck);
    }

    return () => this.unsubscribe(chan, handler as SubscriberHandler);
  }

  /**
   * Remove a handler from a channel. If no handlers remain, the listener is torn down.
   */
  unsubscribe(channel: string | null | undefined, handler: SubscriberHandler): void {
    const chan = channel ?? this.#config.defaultChannel ?? "default";
    const handlers = this.#handlers.get(chan);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.#handlers.delete(chan);
        this.#subscribed.set(chan, false);
      }
    }
  }

  async #listen(channel: string, concurrency: number, autoAck: boolean): Promise<void> {
    const listKey = buildKey(this.#config.keyPrefix ?? "queue", "queue", channel);
    const pubKey = buildKey(this.#config.keyPrefix ?? "queue", "pubsub", channel);

    const subscriber = this.#redis.duplicate();
    await subscriber.subscribe(pubKey);
    this.#events.emit("queue:connected", channel);

    subscriber.on("message", (_redisChannel: string, message: string) => {
      void this.#processMessage(listKey, channel, message, concurrency, autoAck);
    });

    subscriber.on("error", (err: Error) => {
      this.#events.emit("queue:disconnected", channel, err);
    });

    void this.#drainPending(listKey, channel, concurrency, autoAck);
  }

  async #drainPending(listKey: string, channel: string, concurrency: number, autoAck: boolean): Promise<void> {
    let message: string | null;
    while ((message = await this.#redis.rpop(listKey)) !== null) {
      await this.#processMessage(listKey, channel, message, concurrency, autoAck);
    }
  }

  async #processMessage(
    listKey: string,
    channel: string,
    raw: string,
    concurrency: number,
    autoAck: boolean,
  ): Promise<void> {
    const active = this.#activeCount.get(channel) ?? 0;
    if (active >= concurrency) {
      await this.#redis.lpush(listKey, raw);
      return;
    }

    this.#activeCount.set(channel, active + 1);

    let parsed: EventEnvelope;
    try {
      parsed = JSON.parse(raw);
      validateEnvelope(parsed);
    } catch {
      this.#activeCount.set(channel, (this.#activeCount.get(channel) ?? 1) - 1);
      return;
    }

    const attemptStr = await this.#redis.hget(
      buildKey(this.#config.keyPrefix ?? "queue", "attempts", channel),
      parsed.id,
    );
    const attempt = attemptStr ? parseInt(attemptStr, 10) + 1 : 1;

    const msg: Message = {
      id: parsed.id,
      event: parsed as EventEnvelope,
      meta: {
        enqueuedAt: new Date().toISOString(),
        attempt,
        channel,
        consumerId: this.#consumerId,
      },
    };

    this.#events.emit("queue:received", msg);

    if (autoAck) {
      this.#events.emit("queue:processing", msg);
      try {
        await this.#dispatchHandlers(channel, msg);
        this.#events.emit("queue:processed", msg);
      } catch (err) {
        this.#events.emit("queue:error", msg, err as Error);
      } finally {
        this.#activeCount.set(channel, (this.#activeCount.get(channel) ?? 1) - 1);
      }
    } else {
      await this.#redis.hset(
        buildKey(this.#config.keyPrefix ?? "queue", "attempts", channel),
        parsed.id,
        attempt.toString(),
      );

      this.#events.emit("queue:processing", msg);
      try {
        await this.#dispatchHandlers(channel, msg);
        this.#events.emit("queue:processed", msg);
      } catch (err) {
        this.#events.emit("queue:error", msg, err as Error);
        await this.#redis.lpush(listKey, raw);
      } finally {
        this.#activeCount.set(channel, (this.#activeCount.get(channel) ?? 1) - 1);
      }
    }
  }

  async #dispatchHandlers(channel: string, message: Message): Promise<void> {
    const handlers = this.#handlers.get(channel);
    if (!handlers || handlers.size === 0) return;
    await Promise.all([...handlers].map((handler) => Promise.resolve(handler(message))));
  }
}
