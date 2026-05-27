import { describe, it, expect } from "vitest";
import {
  countTokens,
  estimateTokens,
  tokenLimit,
  safeTokenLimit,
  tokenCounter,
} from "../src/token-counter.js";

describe("tokenCounter", () => {
  describe("countTokens", () => {
    it("returns 0 for empty string", () => {
      expect(countTokens("")).toBe(0);
    });

    it("estimates tokens using default ratio", () => {
      const text = "Hello world";
      const result = countTokens(text);
      expect(result).toBeGreaterThan(0);
      expect(result).toBe(Math.ceil(11 / 4.0));
    });

    it("uses model-specific ratio when provided", () => {
      const text = "Hello world, this is a test";
      const gpt4Result = countTokens(text, "gpt-4");
      const defaultResult = countTokens(text);
      expect(gpt4Result).toBeGreaterThanOrEqual(defaultResult);
    });

    it("falls back to default ratio for unknown model", () => {
      const text = "test";
      const result = countTokens(text, "unknown-model-xyz");
      expect(result).toBe(Math.ceil(4 / 4.0));
    });
  });

  describe("estimateTokens", () => {
    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });

    it("uses chars/4 heuristic", () => {
      expect(estimateTokens("1234")).toBe(1);
      expect(estimateTokens("12345")).toBe(2);
    });
  });

  describe("tokenLimit", () => {
    it("returns known limits for gpt-4o", () => {
      expect(tokenLimit("gpt-4o")).toBe(128000);
    });

    it("returns known limits for claude-sonnet-4", () => {
      expect(tokenLimit("claude-sonnet-4-20250514")).toBe(200000);
    });

    it("returns default for unknown model", () => {
      expect(tokenLimit("unknown-model")).toBe(8192);
    });
  });

  describe("safeTokenLimit", () => {
    it("returns a conservative limit", () => {
      expect(safeTokenLimit()).toBe(4096);
    });
  });

  describe("tokenCounter interface methods", () => {
    it("countTokens and estimateTokens are consistent", () => {
      const text = "x".repeat(100);
      const counted = tokenCounter.countTokens(text);
      const estimated = tokenCounter.estimateTokens(text);
      expect(counted).toBe(estimated);
    });
  });
});
