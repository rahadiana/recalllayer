import { describe, it, expect } from "vitest";
import {
  generateId,
  isValidId,
  generateSnowflake,
  snowflakeToString,
  generateShortId,
} from "../src/id.js";

describe("generateId", () => {
  it("generates a UUID v7-style string", () => {
    const id = generateId();
    expect(id).toBeTypeOf("string");
    // UUID v7 format: 8-4-4-4-12 hex chars
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("generates unique IDs on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it("prepends a prefix when provided", () => {
    const id = generateId("user_");
    expect(id.startsWith("user_")).toBe(true);
    expect(id.length).toBeGreaterThan("user_".length);
  });

  it("prefix does not contain hyphens (so the UUID part is detectable)", () => {
    const id = generateId("doc_");
    const uuidPart = id.slice("doc_".length);
    expect(uuidPart).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("isValidId", () => {
  it("accepts bare UUID strings", () => {
    const id = generateId();
    expect(isValidId(id)).toBe(true);
  });

  it("accepts prefixed UUID strings", () => {
    const id = generateId("user_");
    expect(isValidId(id)).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(isValidId("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isValidId(null as unknown as string)).toBe(false);
    expect(isValidId(undefined as unknown as string)).toBe(false);
    expect(isValidId(123 as unknown as string)).toBe(false);
  });

  it("rejects malformed strings", () => {
    expect(isValidId("not-a-uuid")).toBe(false);
  });

  it("rejects strings with invalid characters", () => {
    expect(isValidId("gggggggg-gggg-gggg-gggg-gggggggggggg")).toBe(false);
  });
});

describe("generateSnowflake", () => {
  it("returns a BigInt", () => {
    const id = generateSnowflake();
    expect(typeof id).toBe("bigint");
  });

  it("generates monotonically increasing IDs", () => {
    const ids: bigint[] = [];
    for (let i = 0; i < 10; i++) {
      ids.push(generateSnowflake());
    }
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i] > ids[i - 1]).toBe(true);
    }
  });

  it("respects worker ID bounds", () => {
    expect(typeof generateSnowflake(0)).toBe("bigint");
    expect(typeof generateSnowflake(1023)).toBe("bigint");
  });

  it("clamps worker ID to 10 bits", () => {
    const id = generateSnowflake(2048);
    expect(typeof id).toBe("bigint");
  });

  it("snowflakeToString returns a string", () => {
    const id = generateSnowflake();
    const str = snowflakeToString(id);
    expect(str).toBeTypeOf("string");
    expect(str).toBe(id.toString());
  });
});

describe("generateShortId", () => {
  it("generates a string of default length 21", () => {
    const id = generateShortId();
    expect(id).toBeTypeOf("string");
    expect(id.length).toBe(21);
  });

  it("generates a string of custom length", () => {
    expect(generateShortId(10).length).toBe(10);
    expect(generateShortId(32).length).toBe(32);
  });

  it("generates URL-safe characters only", () => {
    for (let i = 0; i < 100; i++) {
      const id = generateShortId();
      expect(id).toMatch(/^[0-9A-Za-z]+$/);
    }
  });

  it("generates unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateShortId()));
    expect(ids.size).toBe(100);
  });

  it("throws on non-positive length", () => {
    expect(() => generateShortId(0)).toThrow(
      "Short ID length must be a positive integer",
    );
    expect(() => generateShortId(-1)).toThrow();
  });
});
