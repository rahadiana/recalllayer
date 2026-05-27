import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Unique correlation ID type — a branded string (UUID v4).
 */
export type CorrelationId = string & { __brand: "CorrelationId" };

/**
 * Storage for request-scoped correlation IDs.
 * Each asynchronous request gets its own context.
 */
const correlationStorage = new AsyncLocalStorage<CorrelationId>();

/**
 * Context key names used when propagating correlation IDs
 * via headers or metadata.
 */
export const ContextKey = {
  CORRELATION_ID: "x-correlation-id",
  REQUEST_ID: "x-request-id",
  TRACE_ID: "x-trace-id",
} as const;

/**
 * Generate a new UUID v4 correlation ID.
 */
export function generateCorrelationId(): CorrelationId {
  return randomUUID() as CorrelationId;
}

/**
 * Run `fn` inside a correlation context.
 *
 * If `correlationId` is not provided a fresh one is generated.
 * Any existing correlation context is _replaced_ (nested) for the duration of `fn`.
 *
 * @param correlationId - optional explicit ID (e.g. parsed from incoming headers)
 * @param fn             - synchronous function to wrap
 */
export function withCorrelationId<T>(
  correlationId: CorrelationId | undefined,
  fn: () => T,
): T {
  const id = correlationId ?? generateCorrelationId();
  return correlationStorage.run(id, fn);
}

/**
 * Async variant of {@link withCorrelationId}.
 */
export async function withCorrelationIdAsync<T>(
  correlationId: CorrelationId | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const id = correlationId ?? generateCorrelationId();
  return correlationStorage.run(id, () => fn());
}

/**
 * Retrieve the current correlation ID from the async context.
 *
 * @returns The correlation ID if running inside a `withCorrelationId` scope,
 *          otherwise `undefined`.
 */
export function getCorrelationId(): CorrelationId | undefined {
  return correlationStorage.getStore();
}

/**
 * Require a correlation ID — throws if not in context.
 */
export function requireCorrelationId(): CorrelationId {
  const id = getCorrelationId();
  if (!id) {
    throw new Error(
      "Correlation ID not found in current async context. " +
        "Wrap the call with withCorrelationId() or call generateCorrelationId() first.",
    );
  }
  return id;
}

/**
 * Parse a correlation ID from an incoming headers-like object.
 * Accepts common header casing variations.
 */
export function parseCorrelationId(
  headers: Record<string, string | string[] | undefined>,
): CorrelationId | undefined {
  const raw =
    headers[ContextKey.CORRELATION_ID] ??
    headers["x-correlation-id"] ??
    headers["X-Correlation-Id"] ??
    headers[ContextKey.REQUEST_ID] ??
    headers["x-request-id"] ??
    headers["X-Request-Id"];

  if (!raw) return undefined;

  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "string" || value.length > 256) return undefined;

  // Basic sanity: UUID-like or base64-ish
  if (!/^[a-zA-Z0-9\-_=+/]{8,}$/.test(value)) return undefined;

  return value as CorrelationId;
}
