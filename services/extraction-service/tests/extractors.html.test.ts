import { describe, it, expect } from "vitest";
import { HtmlExtractor } from "../src/extractors/html.js";

const extractor = new HtmlExtractor();

describe("HtmlExtractor", () => {
  it("returns empty result for empty string", () => {
    const result = extractor.extract("");
    expect(result.text).toBe("");
    expect(result.textLength).toBe(0);
    expect(result.metadata.word_count).toBe(0);
  });

  it("strips HTML tags", () => {
    const result = extractor.extract("<p>Hello <b>World</b></p>");
    expect(result.text).toBe("Hello World");
  });

  it("decodes HTML entities", () => {
    const result = extractor.extract("<p>Hello &amp; World &lt;3</p>");
    expect(result.text).toBe("Hello & World <3");
  });

  it("decodes numeric entities", () => {
    const result = extractor.extract("&#65;&#66;&#67;");
    expect(result.text).toBe("ABC");
  });

  it("decodes hex entities", () => {
    const result = extractor.extract("&#x41;&#x42;&#x43;");
    expect(result.text).toBe("ABC");
  });

  it("removes script tags and their content", () => {
    const result = extractor.extract(
      "<html><body><p>Visible</p><script>alert('xss')</script><p>Also visible</p></body></html>",
    );
    expect(result.text).toContain("Visible");
    expect(result.text).toContain("Also visible");
    expect(result.text).not.toContain("alert");
  });

  it("removes style tags and their content", () => {
    const result = extractor.extract(
      "<html><body><p>Hello</p><style>.p { color: red; }</style><p>World</p></body></html>",
    );
    expect(result.text).toContain("Hello");
    expect(result.text).toContain("World");
    expect(result.text).not.toContain("color");
  });

  it("removes HTML comments", () => {
    const result = extractor.extract(
      "<p>Hello<!-- secret comment --> World</p>",
    );
    expect(result.text).toContain("Hello");
    expect(result.text).toContain("World");
    expect(result.text).not.toContain("secret");
  });

  it("extracts body content", () => {
    const result = extractor.extract(
      "<html><head><title>Title</title></head><body><p>Body content</p></body></html>",
    );
    expect(result.text).toBe("Body content");
    expect(result.text).not.toContain("Title");
  });

  it("preserves heading structure when preserveSections is true", () => {
    const html = `
      <h1>Introduction</h1>
      <p>Welcome to the guide.</p>
      <h2>Getting Started</h2>
      <p>Install the package.</p>
    `;
    const result = extractor.extract(html, { preserveSections: true });
    expect(result.sections.length).toBeGreaterThanOrEqual(1);
    const introSection = result.sections.find((s) => s.heading === "Introduction");
    expect(introSection).toBeDefined();
  });

  it("inserts line breaks for block elements", () => {
    const result = extractor.extract("<div>Block 1</div><div>Block 2</div>");
    expect(result.text).toMatch(/Block 1\s+Block 2/);
  });

  it("handles br tags as line breaks", () => {
    const result = extractor.extract("Line 1<br>Line 2<br/>Line 3");
    expect(result.text).toMatch(/Line 1\s+Line 2\s+Line 3/);
  });

  it("counts HTML tags in metadata", () => {
    const result = extractor.extract("<p><b><i>Hello</i></b></p>");
    expect(result.metadata.tag_count).toBeGreaterThan(0);
  });

  it("reports correct strategy name", () => {
    const result = extractor.extract("<p>test</p>");
    expect(result.strategy).toBe("html-cleanse");
  });

  it("handles deeply nested HTML", () => {
    const html = "<div><div><div><p>Deep <span>nested <em>content</em></span></p></div></div></div>";
    const result = extractor.extract(html);
    expect(result.text).toBe("Deep nested content");
  });

  it("respects maxLength", () => {
    const result = extractor.extract("<p>Hello World</p>", { maxLength: 5 });
    expect(result.text.length).toBeLessThanOrEqual(5);
  });
});
