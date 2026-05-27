/**
 * ID Generation Utilities
 *
 * Pure functions for generating various ID formats.
 * Zero external dependencies.
 */

const HEX_CHARS = "0123456789abcdef";

function randomHex(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += HEX_CHARS[Math.floor(Math.random() * 16)];
  }
  return result;
}

/** Generate a timestamp-based hex value (milliseconds since epoch, padded to 12 hex chars). */
function timestampHex(): string {
  return Math.floor(Date.now()).toString(16).padStart(12, "0");
}

/**
 * Generate a UUID v7-style identifier.
 *
 * UUID v7 uses a 48-bit Unix timestamp (ms) followed by 74 bits of randomness.
 * This implementation produces a string that follows the UUID v7 layout:
 * `tttttttt-tttt-7rrr-vrrr-rrrrrrrrrrrr`
 *
 * @param prefix - Optional prefix prepended to the ID (e.g. "user_", "doc_")
 * @returns A UUID v7-style string, optionally with a prefix.
 */
export function generateId(prefix?: string): string {
  const ts = timestampHex();
  const rand = randomHex(18);

  const versionNibble = "7";
  const variantNibble = (Math.floor(Math.random() * 4) + 8).toString(16);

  const uuid =
    ts.slice(0, 8) +
    "-" +
    ts.slice(8, 12) +
    "-" +
    versionNibble +
    rand.slice(0, 3) +
    "-" +
    variantNibble +
    rand.slice(3, 6) +
    "-" +
    rand.slice(6, 18);

  return prefix ? `${prefix}${uuid}` : uuid;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIXED_UUID_REGEX = /^[a-z][a-z0-9_]*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate whether a string is a well-formed ID produced by this module.
 *
 * Supports both bare UUID strings and prefixed UUIDs (e.g. "user_<uuid>").
 *
 * @param id - The string to validate
 * @returns `true` if the ID format is valid
 */
export function isValidId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  return UUID_REGEX.test(id) || PREFIXED_UUID_REGEX.test(id);
}

const SNOWFLAKE_EPOCH = 1700000000000n;
const MAX_SEQUENCE = 0xfffn;

let snowflakeLastTimestamp = -1n;
let snowflakeSequence = 0n;

/**
 * Generate a snowflake-style unique ID.
 *
 * Snowflake IDs are 64-bit integers that sort chronologically.
 * Layout: [41-bit timestamp] [10-bit worker] [12-bit sequence]
 *
 * @param workerId - Worker/machine identifier (0-1023). Defaults to 0.
 * @returns A bigint snowflake-style ID
 */
export function generateSnowflake(workerId = 0): bigint {
  const worker = BigInt(workerId) & 0x3ffn;
  const now = BigInt(Date.now()) - SNOWFLAKE_EPOCH;

  if (now < 0n) {
    throw new Error("System clock is set before the snowflake epoch");
  }

  if (now === snowflakeLastTimestamp) {
    snowflakeSequence = (snowflakeSequence + 1n) & MAX_SEQUENCE;
    if (snowflakeSequence === 0n) {
      const start = performance.now();
      while (performance.now() - start < 2) {
        const next = BigInt(Date.now()) - SNOWFLAKE_EPOCH;
        if (next > now) break;
      }
      return generateSnowflake(workerId);
    }
  } else {
    snowflakeSequence = 0n;
  }

  snowflakeLastTimestamp = now;

  return (now << 22n) | (worker << 12n) | snowflakeSequence;
}

/** Convert a snowflake BigInt ID to its string representation. */
export function snowflakeToString(id: bigint): string {
  return id.toString();
}

const SHORT_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SHORT_ID_DEFAULT_LENGTH = 21;

/**
 * Generate a short, URL-safe random identifier (nanoid-style).
 *
 * Uses `crypto.getRandomValues()` for CSPRNG-backed randomness.
 * Falls back to `Math.random()` when crypto is unavailable.
 *
 * @param length - Desired ID length (default 21)
 * @returns A random string of the specified length
 */
export function generateShortId(length: number = SHORT_ID_DEFAULT_LENGTH): string {
  if (length <= 0) {
    throw new Error("Short ID length must be a positive integer");
  }

  let result = "";

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      result += SHORT_ID_ALPHABET[bytes[i] % SHORT_ID_ALPHABET.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += SHORT_ID_ALPHABET[Math.floor(Math.random() * SHORT_ID_ALPHABET.length)];
    }
  }

  return result;
}
