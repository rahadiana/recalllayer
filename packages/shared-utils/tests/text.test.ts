import { describe, it, expect } from "vitest";
import {
  truncate,
  slugify,
  stripHtml,
  sanitizeForStorage,
} from "../src/text.js";

describe("truncate", () => {
  it("returns the text unchanged if shorter than maxLength", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the text unchanged if equal to maxLength", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends default ellipsis", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
  });

  it("uses custom ellipsis", () => {
    expect(truncate("hello world", 8, "...")).toBe("hello...");
  });

  it("returns empty string for empty input", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("handles maxLength smaller than ellipsis", () => {
    expect(truncate("hello world", 2)).toBe("h…");
    expect(truncate("hello world", 1)).toBe("…");
  });

  it("handles maxLength of 0 gracefully", () => {
    expect(truncate("hello", 0)).toBe("");
  });
});

describe("slugify", () => {
  it("converts to lowercase", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with separator", () => {
    expect(slugify("hello world")).toBe("hello-world");
    expect(slugify("hello  world")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(slugify("hello!@#$%^&*()world")).toBe("helloworld");
  });

  it("collapses multiple separators", () => {
    expect(slugify("hello---world")).toBe("hello-world");
    expect(slugify("hello___world")).toBe("hello-world");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("-hello-world-")).toBe("hello-world");
    expect(slugify(" hello world ")).toBe("hello-world");
  });

  it("handles accented characters via NFKD normalization", () => {
    const result = slugify("café résumé naïve");
    expect(result).toBe("cafe-resume-naive");
  });

  it("uses custom separator", () => {
    expect(slugify("hello world", "_")).toBe("hello_world");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("handles already clean strings", () => {
    expect(slugify("already-clean")).toBe("already-clean");
  });

  it("handles German umlauts", () => {
    expect(slugify("München")).toBe("munchen");
  });
});

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml("<p>Hello</p>")).toBe("Hello");
  });

  it("removes nested tags", () => {
    expect(stripHtml("<div><p>Hello <b>World</b></p></div>")).toBe("Hello World");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("&lt;hello&gt; &amp; &quot;world&quot;")).toBe('<hello> & "world"');
  });

  it("decodes numeric entities", () => {
    expect(stripHtml("&#65;&#66;&#67;")).toBe("ABC");
  });

  it("decodes hex entities", () => {
    expect(stripHtml("&#x41;&#x42;&#x43;")).toBe("ABC");
  });

  it("handles non-breaking spaces", () => {
    expect(stripHtml("hello&nbsp;world")).toBe("hello world");
  });

  it("collapses whitespace", () => {
    expect(stripHtml("hello   world")).toBe("hello world");
    expect(stripHtml("<p>hello</p>  <p>world</p>")).toBe("hello world");
  });

  it("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });

  it("leaves unknown entities as-is", () => {
    expect(stripHtml("&unknown;")).toBe("&unknown;");
  });

  it("handles apostrophe entity", () => {
    expect(stripHtml("it&apos;s")).toBe("it's");
    expect(stripHtml("it&#39;s")).toBe("it's");
  });
});

describe("sanitizeForStorage", () => {
  it("trims whitespace", () => {
    expect(sanitizeForStorage("  hello  ")).toBe("hello");
  });

  it("removes null bytes", () => {
    expect(sanitizeForStorage("hello\0world")).toBe("helloworld");
  });

  it("removes control characters", () => {
    expect(sanitizeForStorage("hello\x01world")).toBe("helloworld");
  });

  it("preserves newlines and tabs", () => {
    expect(sanitizeForStorage("hello\n\tworld")).toBe("hello\n\tworld");
  });

  it("replaces non-breaking spaces with regular spaces", () => {
    expect(sanitizeForStorage("hello\u00a0world")).toBe("hello world");
  });

  it("collapses multiple spaces", () => {
    expect(sanitizeForStorage("hello    world")).toBe("hello world");
  });

  it("collapses excessive newlines (3+ to 2)", () => {
    expect(sanitizeForStorage("hello\n\n\n\nworld")).toBe("hello\n\nworld");
  });

  it("truncates to maxLength when specified", () => {
    expect(sanitizeForStorage("hello world", 5)).toBe("hell…");
    expect(sanitizeForStorage("hello", 5)).toBe("hello");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeForStorage("")).toBe("");
  });

  it("handles Unicode normalization", () => {
    const input = "e\u0301";
    const result = sanitizeForStorage(input);
    expect(result).toBe("\u00e9");
    expect(result.length).toBe(1);
  });

  it("handles text without any issues unchanged", () => {
    const clean = "This is clean text.\nWith a newline.";
    expect(sanitizeForStorage(clean)).toBe(clean);
  });
});
