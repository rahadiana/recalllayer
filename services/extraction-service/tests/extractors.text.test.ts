import { describe, it, expect } from "vitest";
import { TextExtractor } from "../src/extractors/text.js";

const extractor = new TextExtractor();

describe("TextExtractor", () => {
  it("returns empty result for empty string", () => {
    const result = extractor.extract("");
    expect(result.text).toBe("");
    expect(result.textLength).toBe(0);
    expect(result.sections).toEqual([]);
    expect(result.metadata.word_count).toBe(0);
    expect(result.strategy).toBe("text-normalize");
  });

  it("trims and normalizes plain text", () => {
    const result = extractor.extract("  Hello   World  ");
    expect(result.text).toBe("Hello World");
    expect(result.textLength).toBe(11);
    expect(result.metadata.word_count).toBe(2);
  });

  it("removes null bytes", () => {
    const result = extractor.extract("Hello\0World");
    expect(result.text).toBe("HelloWorld");
    expect(result.textLength).toBe(10);
  });

  it("removes control characters but preserves newlines", () => {
    const result = extractor.extract("Line1\nLine2\x00\rLine3");
    expect(result.text).toContain("Line1");
    expect(result.text).toContain("Line2");
    expect(result.text).toContain("Line3");
  });

  it("normalizes unicode", () => {
    const result = extractor.extract("cafe\u0301");
    expect(result.text).toBe("caf\u00e9");
  });

  it("respects maxLength option", () => {
    const result = extractor.extract("Hello World", { maxLength: 5 });
    expect(result.text).toBe("Hello");
    expect(result.textLength).toBe(5);
  });

  it("produces sections when preserveSections is true", () => {
    const result = extractor.extract("Hello World", { preserveSections: true });
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].heading).toBe("");
    expect(result.sections[0].level).toBe(0);
    expect(result.sections[0].content).toBe("Hello World");
  });

  it("reports correct durationMs", () => {
    const result = extractor.extract("test");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("handles only whitespace input", () => {
    const result = extractor.extract("   \n\t   ");
    expect(result.text).toBe("");
    expect(result.textLength).toBe(0);
    expect(result.metadata.word_count).toBe(0);
  });

  it("counts words correctly for multi-line text", () => {
    const result = extractor.extract("one two\nthree four five");
    expect(result.metadata.word_count).toBe(5);
  });

  it("uses correct mimeType in result", () => {
    const result = extractor.extract("test");
    expect(result.mimeType).toBe("text/plain");
  });
});
