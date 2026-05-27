import type { Redis } from "ioredis";

// ── Event Envelope ──────────────────────────────────────────────
// Mirrors the expected contract from @memory-platform/shared-schemas.
// Re-exported so consumers can import from @memory-platform/queue directly
// until @memory-platform/shared-schemas publishes its own EventEnvelope.

/**
 * Standard event envelope for all cross-service communication.
 * @template T - The payload type for this specific event.
 */
export interface EventEnvelope<T = unknown> {
  /** Unique event identifier (UUID v4). */
  id: string;
  /** Event type discriminator (e.g. "document.created"). */
  type: string;
  /** ISO-8601 timestamp of when the event was emitted. */
  timestamp: string;
  /** Typed payload carried by the event. */
  payload: T;
  /** Optional free-form metadata. */
  metadata?: Record<string, unknown>;
  /** ID of the root / initiating event for tracing. */
  correlationId?: string;
  /** ID of the immediate parent event. */
  causationId?: string;
}

// ── Queue Primitives ────────────────────────────────────────────

/**
 * Connection and operational configuration for the queue system.
 */
export interface QueueConfig {
  /** Redis connection URL (ioredis format). */
  redisUrl: string;
  /** Prefix used for all Redis keys owned by this queue. */
  keyPrefix?: string;
  /** Default channel used when none is specified. */
  defaultChannel?: string;
  /** Maximum number of items kept in a list-based queue. 0 = unlimited. */
  maxQueueLength?: number;
  /** Connection timeout in milliseconds. */
  connectionTimeout?: number;
  /** Enable automatic dead-letter queue handling. */
  enableDLQ?: boolean;
}

/**
 * Options for publishing a single event.
 */
export interface PublishOptions {
  /** Explicit channel override. Falls back to QueueConfig.defaultChannel. */
  channel?: string;
  /** Deduplication key (optional). Events with the same key within TTL are skipped. */
  dedupeKey?: string;
  /** TTL in seconds for the published message in Redis. */
  ttl?: number;
}

/**
 * Options for subscribing to events.
 */
export interface SubscribeOptions {
  /** Concurrency: max simultaneous handler invocations. */
  concurrency?: number;
  /** If true, acknowledge each message before invoking the handler (fire-and-forget). */
  autoAcknowledge?: boolean;
  /** If true, unhandled errors are pushed to the dead-letter queue. */
  useDLQ?: boolean;
}

/**
 * A message dequeued from a Redis list with its context.
 */
export interface Message<T = unknown> {
  /** The raw message ID (Redis list element index or generated). */
  id: string;
  /** The deserialized event envelope. */
  event: EventEnvelope<T>;
  /** Metadata added by the queue layer. */
  meta: {
    /** Timestamp when the message was enqueued. */
    enqueuedAt: string;
    /** Number of delivery attempts so far. */
    attempt: number;
    /** The channel / queue name this message came from. */
    channel: string;
    /** Unique identifier of the consumer that received this message. */
    consumerId?: string;
  };
}

/**
 * Events emitted by the Queue / Publisher / Subscriber for observability.
 */
export interface QueueEvents {
  /** Fired when a message is published (before Redis call). */
  "queue:publishing": (event: EventEnvelope) => void;
  /** Fired after a successful publish. */
  "queue:published": (event: EventEnvelope, channel: string) => void;
  /** Fired when a new message is received by a subscriber. */
  "queue:received": (message: Message) => void;
  /** Fired when handler processing begins. */
  "queue:processing": (message: Message) => void;
  /** Fired after successful handler completion. */
  "queue:processed": (message: Message) => void;
  /** Fired when handler throws or rejects. */
  "queue:error": (message: Message, error: Error) => void;
  /** Fired when a message is sent to the dead-letter queue. */
  "queue:dead-letter": (message: Message, error: Error) => void;
  /** Fired when a subscriber connects (Redis ready). */
  "queue:connected": (channel: string) => void;
  /** Fired when a subscriber disconnects. */
  "queue:disconnected": (channel: string, error?: Error) => void;
}

/**
 * Internal Redis key builder.
 */
export function buildKey(prefix: string, ...segments: string[]): string {
  return [prefix, ...segments].filter(Boolean).join(":");
}
