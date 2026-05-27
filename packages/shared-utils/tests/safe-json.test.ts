import { describe, it, expect } from "vitest";
import {
  JsonParseError,
  safeParse,
  safeStringify,
  tryParse,
} from "../src/safe-json.js";

describe("JsonParseError", () => {
  it("is an instance of Error", () => {
    const err = new JsonParseError("test", "raw");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(JsonParseError);
  });

  it("has correct name", () => {
    const err = new JsonParseError("test", "raw");
    expect(err.name).toBe("JsonParseError");
  });

  it("stores truncated original input", () => {
    const long = "x".repeat(1000);
    const err = new JsonParseError("test", long);
    expect(err.originalInput.length).toBe(500);
  });
});

describe("safeParse", () => {
  it("parses valid JSON object", () => {
    const result = safeParse<{ name: string }>('{"name":"Alice"}');
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.value).toEqual({ name: "Alice" });
  });

  it("parses valid JSON array", () => {
    const result = safeParse("[1, 2, 3]");
    expect(result.ok).toBe(true);
    expect(result.value).toEqual([1, 2, 3]);
  });

  it("parses primitives", () => {
    expect(safeParse("42").value).toBe(42);
    expect(safeParse('"hello"').value).toBe("hello");
    expect(safeParse("true").value).toBe(true);
    expect(safeParse("null").value).toBe(null);
  });

  it("returns error for malformed JSON", () => {
    const result = safeParse("{invalid");
    expect(result.ok).toBe(false);
    expect(result.value).toBeNull();
    expect(result.error).toBeInstanceOf(JsonParseError);
  });

  it("returns error for empty string", () => {
    const result = safeParse("");
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(JsonParseError);
  });

  it("returns error for non-string input", () => {
    const result = safeParse(42 as unknown as string);
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(JsonParseError);
  });

  it("returns error for null/undefined input", () => {
    expect(safeParse(null as unknown as string).ok).toBe(false);
    expect(safeParse(undefined as unknown as string).ok).toBe(false);
  });
});

describe("safeStringify", () => {
  it("stringifies a plain object", () => {
    expect(safeStringify({ name: "Alice" })).toBe('{"name":"Alice"}');
  });

  it("stringifies an array", () => {
    expect(safeStringify([1, 2, 3])).toBe("[1,2,3]");
  });

  it("stringifies primitives", () => {
    expect(safeStringify(42)).toBe("42");
    expect(safeStringify("hello")).toBe('"hello"');
    expect(safeStringify(true)).toBe("true");
    expect(safeStringify(null)).toBe("null");
  });

  it("returns fallback on circular reference", () => {
    const obj: Record<string, unknown> = { name: "test" };
    obj.self = obj;
    expect(safeStringify(obj, "fallback")).toBe("fallback");
  });

  it("returns default fallback '{}' on error", () => {
    const obj: Record<string, unknown> = {};
    obj.circular = obj;
    expect(safeStringify(obj)).toBe("{}");
  });

  it("handles BigInt values", () => {
    const obj = { id: BigInt(42) };
    expect(safeStringify(obj)).toBe('{"id":"42"}');
  });

  it("handles function values", () => {
    const obj = { fn: () => {} };
    expect(safeStringify(obj)).toBe('{"fn":"[Function]"}');
  });

  it("handles symbol values", () => {
    const sym = Symbol("test");
    expect(safeStringify({ sym })).toBe('{"sym":"Symbol(test)"}');
  });

  it("applies space formatting", () => {
    const result = safeStringify({ a: 1, b: 2 }, "{}", 2);
    expect(result).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it("handles undefined values (omitted in objects)", () => {
    expect(safeStringify({ a: undefined })).toBe("{}");
  });
});

describe("tryParse", () => {
  it("returns parsed value on success", () => {
    const result = tryParse<{ name: string }>('{"name":"Bob"}', { name: "default" });
    expect(result).toEqual({ name: "Bob" });
  });

  it("returns default value on failure", () => {
    const defaultValue = { name: "default" };
    const result = tryParse("invalid", defaultValue);
    expect(result).toBe(defaultValue);
  });

  it("returns default when safeParse returns ok=false", () => {
    const result = tryParse("", "fallback");
    expect(result).toBe("fallback");
  });
});
