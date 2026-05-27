import { describe, it, expect } from "vitest";
import {
  generateCorrelationId,
  withCorrelationId,
  withCorrelationIdAsync,
  getCorrelationId,
  requireCorrelationId,
  parseCorrelationId,
  ContextKey,
} from "../src/correlation.js";

describe("generateCorrelationId", () => {
  it("returns a non-empty string", () => {
    const id = generateCorrelationId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("returns unique IDs across calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateCorrelationId()));
    expect(ids.size).toBe(100);
  });

  it("returns UUID v4 format", () => {
    const id = generateCorrelationId();
    // UUID v4 regex — 8-4-4-4-12 hex digits
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("withCorrelationId / getCorrelationId", () => {
  it("propagates correlation ID inside the closure", () => {
    const id = generateCorrelationId();
    withCorrelationId(id, () => {
      expect(getCorrelationId()).toBe(id);
    });
  });

  it("generates a fresh ID when none provided", () => {
    withCorrelationId(undefined, () => {
      const inside = getCorrelationId();
      expect(inside).toBeTruthy();
      expect(typeof inside).toBe("string");
    });
  });

  it("returns undefined outside the context", () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it("returns undefined outside the closure after it exits", () => {
    withCorrelationId(generateCorrelationId(), () => {
      /* no-op */
    });
    expect(getCorrelationId()).toBeUndefined();
  });
});

describe("withCorrelationIdAsync", () => {
  it("propagates correlation ID across async boundaries", async () => {
    const id = generateCorrelationId();
    await withCorrelationIdAsync(id, async () => {
      // yield to microtask queue
      await Promise.resolve();
      expect(getCorrelationId()).toBe(id);
    });
  });

  it("generates a fresh ID when none provided", async () => {
    await withCorrelationIdAsync(undefined, async () => {
      await Promise.resolve();
      expect(getCorrelationId()).toBeTruthy();
    });
  });
});

describe("requireCorrelationId", () => {
  it("returns the ID when in context", () => {
    const id = generateCorrelationId();
    withCorrelationId(id, () => {
      expect(requireCorrelationId()).toBe(id);
    });
  });

  it("throws when outside context", () => {
    expect(() => requireCorrelationId()).toThrow("Correlation ID not found");
  });
});

describe("parseCorrelationId", () => {
  it("extracts from x-correlation-id header", () => {
    const id = generateCorrelationId();
    const result = parseCorrelationId({ [ContextKey.CORRELATION_ID]: id });
    expect(result).toBe(id);
  });

  it("extracts from x-request-id fallback", () => {
    const id = generateCorrelationId();
    const result = parseCorrelationId({ [ContextKey.REQUEST_ID]: id });
    expect(result).toBe(id);
  });

  it("handles array header values (takes first)", () => {
    const id = generateCorrelationId();
    const result = parseCorrelationId({ [ContextKey.CORRELATION_ID]: [id, "other"] });
    expect(result).toBe(id);
  });

  it("returns undefined when no header present", () => {
    expect(parseCorrelationId({})).toBeUndefined();
  });

  it("returns undefined for invalid-length values", () => {
    expect(parseCorrelationId({ [ContextKey.CORRELATION_ID]: "abc" })).toBeUndefined();
  });

  it("returns undefined for overly long values", () => {
    expect(
      parseCorrelationId({ [ContextKey.CORRELATION_ID]: "x".repeat(300) }),
    ).toBeUndefined();
  });

  it("returns undefined for values with invalid characters", () => {
    expect(
      parseCorrelationId({ [ContextKey.CORRELATION_ID]: "hello world!" }),
    ).toBeUndefined();
  });
});
