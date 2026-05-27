/**
 * Safe JSON Helpers
 *
 * Pure utility functions for JSON parsing and stringification
 * with proper error handling. Zero external dependencies.
 */

// ─── Custom Error ────────────────────────────────────────────────────────────

/**
 * Error thrown by `safeParse` when JSON parsing fails.
 * Includes the original input string (truncated) for debugging.
 */
export class JsonParseError extends Error {
  public readonly originalInput: string;

  constructor(message: string, input: string) {
    super(message);
    this.name = "JsonParseError";
    this.originalInput = input.slice(0, 500); // Truncate for safety
  }
}

// ─── Safe Parse ──────────────────────────────────────────────────────────────

export interface SafeParseResult<T> {
  /** Whether parsing succeeded */
  ok: boolean;
  /** The parsed value (only when ok=true) */
  value: T | null;
  /** The error (only when ok=false) */
  error: JsonParseError | null;
}

/**
 * Safely parse a JSON string. Never throws.
 *
 * Returns a result object instead of throwing, making it suitable
 * for parsing untrusted or potentially malformed JSON.
 *
 * @param json - The JSON string to parse
 * @returns A `SafeParseResult<T>` with either the parsed value or an error
 *
 * @example
 * ```ts
 * const result = safeParse<{ name: string }>('{"name": "Alice"}');
 * if (result.ok) {
 *   console.log(result.value.name); // "Alice"
 * }
 * ```
 */
export function safeParse<T = unknown>(json: string): SafeParseResult<T> {
  if (!json || typeof json !== "string") {
    return {
      ok: false,
      value: null,
      error: new JsonParseError("Input is not a valid JSON string", String(json)),
    };
  }

  try {
    const value = JSON.parse(json) as T;
    return { ok: true, value, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown JSON parse error";
    return {
      ok: false,
      value: null,
      error: new JsonParseError(message, json),
    };
  }
}

// ─── Safe Stringify ──────────────────────────────────────────────────────────

/**
 * Safely stringify a value to JSON. Never throws.
 *
 * Handles circular references, BigInt, and other non-serializable values
 * gracefully by returning a fallback value.
 *
 * @param value - The value to stringify
 * @param fallback - Fallback value returned on error (default: `"{}"`)
 * @param space - Indentation spaces (default: 0)
 * @returns A JSON string, or the fallback if stringification fails
 *
 * @example
 * ```ts
 * const json = safeStringify({ name: "Alice" });
 * // '{"name":"Alice"}'
 *
 * const bad = safeStringify({ circular: {} });
 * // '{}' (fallback, with circular reference handled)
 * ```
 */
export function safeStringify(
  value: unknown,
  fallback = "{}",
  space?: number,
): string {
  try {
    // Use a replacer to handle BigInt and other special types
    return JSON.stringify(value, replacer, space);
  } catch {
    return fallback;
  }
}

/**
 * Custom JSON.stringify replacer that handles:
 * - BigInt → string representation
 * - undefined in arrays → null
 * - undefined / functions in objects → omitted (default JSON behavior)
 */
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "function") {
    return "[Function]";
  }
  if (typeof value === "symbol") {
    return value.toString();
  }
  return value;
}

// ─── Utility: Try JSON Parse (throws) ────────────────────────────────────────

/**
 * Parse a JSON string with a default value fallback on failure.
 *
 * A simpler alternative to `safeParse` when you just want a default value
 * instead of an error object.
 *
 * @param json - The JSON string to parse
 * @param defaultValue - Value returned when parsing fails
 * @returns The parsed value, or the default if parsing fails
 *
 * @example
 * ```ts
 * const config = tryParse<Config>(rawJson, defaultConfig);
 * ```
 */
export function tryParse<T>(json: string, defaultValue: T): T {
  const result = safeParse<T>(json);
  if (result.ok && result.value !== null) {
    return result.value;
  }
  return defaultValue;
}
