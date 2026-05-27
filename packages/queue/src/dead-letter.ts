import type { Redis } from "ioredis";
import type { Message, QueueConfig } from "./types.js";
import { buildKey } from "./types.js";

type EventEmitter = {
  emit(event: string, ...args: unknown[]): boolean;
};

export interface DLQEntry {
  message: Message;
  error: string;
  failedAt: string;
  attempts: number;
  queueName: string;
}

export interface DLQStats {
  queueName: string;
  totalDead: number;
  oldestEntry: string | null;
  newestEntry: string | null;
}

export class DeadLetterQueue {
  #redis: Redis;
  #config: QueueConfig;
  #events: EventEmitter;

  constructor(redis: Redis, config: QueueConfig, events: EventEmitter) {
    this.#redis = redis;
    this.#config = config;
    this.#events = events;
  }

  /**
   * Push a failed message to the dead-letter queue for later inspection or replay.
   */
  async pushToDLQ(queueName: string, message: Message, error: Error): Promise<void> {
    const dlqKey = buildKey(this.#config.keyPrefix ?? "queue", "dlq", queueName);
    const entry: DLQEntry = {
      message,
      error: error.message,
      failedAt: new Date().toISOString(),
      attempts: message.meta.attempt,
      queueName,
    };

    await this.#redis.lpush(dlqKey, JSON.stringify(entry));
    this.#events.emit("queue:dead-letter", message, error);
  }

  /**
   * Replay all dead-letter messages from a queue back into the live queue.
   */
  async replayFromDLQ(queueName: string): Promise<number> {
    const dlqKey = buildKey(this.#config.keyPrefix ?? "queue", "dlq", queueName);
    const liveKey = buildKey(this.#config.keyPrefix ?? "queue", "queue", queueName);
    let count = 0;

    let raw: string | null;
    const pipeline = this.#redis.pipeline();

    while ((raw = await this.#redis.rpop(dlqKey)) !== null) {
      const entry: DLQEntry = JSON.parse(raw);
      const serialized = JSON.stringify(entry.message.event);
      pipeline.lpush(liveKey, serialized);
      count++;
    }

    if (count > 0) {
      await pipeline.exec();
    }

    return count;
  }

  /**
   * Get statistics about the dead-letter queue for a given channel.
   */
  async getDLQStats(queueName: string): Promise<DLQStats> {
    const dlqKey = buildKey(this.#config.keyPrefix ?? "queue", "dlq", queueName);
    const [totalDead, oldest, newest] = await Promise.all([
      this.#redis.llen(dlqKey),
      this.#redis.lindex(dlqKey, -1),
      this.#redis.lindex(dlqKey, 0),
    ]);

    let oldestEntry: string | null = null;
    let newestEntry: string | null = null;

    if (oldest) {
      const entry: DLQEntry = JSON.parse(oldest);
      oldestEntry = entry.failedAt;
    }
    if (newest) {
      const entry: DLQEntry = JSON.parse(newest);
      newestEntry = entry.failedAt;
    }

    return { queueName, totalDead, oldestEntry, newestEntry };
  }

  /**
   * Peek at dead-letter queue entries without removing them.
   */
  async peekDLQ(queueName: string, count = 10): Promise<DLQEntry[]> {
    const dlqKey = buildKey(this.#config.keyPrefix ?? "queue", "dlq", queueName);
    const entries = await this.#redis.lrange(dlqKey, 0, count - 1);
    return entries.map((raw: string) => JSON.parse(raw) as DLQEntry);
  }

  /**
   * Remove a specific message from the dead-letter queue by its message ID.
   */
  async removeFromDLQ(queueName: string, messageId: string): Promise<boolean> {
    const dlqKey = buildKey(this.#config.keyPrefix ?? "queue", "dlq", queueName);
    const entries = await this.#redis.lrange(dlqKey, 0, -1);

    for (const raw of entries) {
      const entry: DLQEntry = JSON.parse(raw);
      if (entry.message.id === messageId) {
        await this.#redis.lrem(dlqKey, 1, raw);
        return true;
      }
    }

    return false;
  }

  /**
   * Clear all entries from a dead-letter queue.
   */
  async purgeDLQ(queueName: string): Promise<void> {
    const dlqKey = buildKey(this.#config.keyPrefix ?? "queue", "dlq", queueName);
    await this.#redis.del(dlqKey);
  }
}
