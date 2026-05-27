import { describe, it, expect } from "vitest";
import { MarkdownExtractor } from "../src/extractors/markdown.js";

const extractor = new MarkdownExtractor();

describe("MarkdownExtractor", () => {
  it("returns empty result for empty string", () => {
    const result = extractor.extract("");
    expect(result.text).toBe("");
    expect(result.textLength).toBe(0);
    expect(result.metadata.word_count).toBe(0);
  });

  it("strips bold syntax", () => {
    const result = extractor.extract("Hello **World**");
    expect(result.text).toBe("Hello World");
  });

  it("strips italic syntax", () => {
    const result = extractor.extract("Hello *World*");
    expect(result.text).toBe("Hello World");
  });

  it("strips bold-italic syntax", () => {
    const result = extractor.extract("Hello ***World***");
    expect(result.text).toBe("Hello World");
  });

  it("strips underscore bold syntax", () => {
    const result = extractor.extract("Hello __World__");
    expect(result.text).toBe("Hello World");
  });

  it("strips underscore italic syntax", () => {
    const result = extractor.extract("Hello _World_");
    expect(result.text).toBe("Hello World");
  });

  it("strips strikethrough syntax", () => {
    const result = extractor.extract("Hello ~~World~~");
    expect(result.text).toBe("Hello World");
  });

  it("strips link syntax and preserves link text", () => {
    const result = extractor.extract("Visit [OpenAI](https://openai.com) today");
    expect(result.text).toBe("Visit OpenAI today");
  });

  it("strips image syntax and preserves alt text", () => {
    const result = extractor.extract("Here is ![a chart](chart.png)");
    expect(result.text).toBe("Here is a chart");
  });

  it("strips inline code backticks", () => {
    const result = extractor.extract("Use the `map()` function");
    expect(result.text).toBe("Use the map() function");
  });

  it("preserves code block content but strips inner formatting", () => {
    const md = "```\nfunction hello() {\n  return **bold**;\n}\n```";
    const result = extractor.extract(md);
    expect(result.text).toContain("function hello()");
    expect(result.text).toContain("bold");
    expect(result.text).not.toContain("**");
  });

  it("preserves code block content with language header", () => {
    const md = "```typescript\nconst x: number = 42;\n```";
    const result = extractor.extract(md);
    expect(result.text).toContain("const x: number = 42");
    expect(result.text).not.toContain("typescript");
  });

  it("strips blockquote markers", () => {
    const result = extractor.extract("> This is a quote\n> line two");
    expect(result.text).toBe("This is a quote line two");
  });

  it("strips unordered list markers", () => {
    const result = extractor.extract("- item one\n- item two\n* item three");
    expect(result.text).toBe("item one item two item three");
  });

  it("strips ordered list markers", () => {
    const result = extractor.extract("1. first\n2. second\n10. tenth");
    expect(result.text).toBe("first second tenth");
  });

  it("removes horizontal rules", () => {
    const result = extractor.extract("above\n---\nbelow");
    expect(result.text).toContain("above");
    expect(result.text).toContain("below");
    expect(result.text).not.toContain("---");
  });

  it("strips HTML tags inside markdown", () => {
    const result = extractor.extract("Hello <b>World</b>");
    expect(result.text).toBe("Hello World");
  });

  it("preserves heading structure when preserveSections is true", () => {
    const md = "# Title\nSome intro\n## Section 1\nContent 1\n### Subsection\nDeep content";
    const result = extractor.extract(md, { preserveSections: true });
    const titleSection = result.sections.find((s) => s.heading === "Title");
    expect(titleSection).toBeDefined();
    expect(titleSection?.level).toBe(1);
  });

  it("handles headings without sections mode", () => {
    const md = "# Title\n## Section\nContent";
    const result = extractor.extract(md);
    expect(result.text).toContain("Title");
    expect(result.text).toContain("Section");
    expect(result.text).toContain("Content");
  });

  it("respects maxLength", () => {
    const result = extractor.extract("Hello **World**", { maxLength: 5 });
    expect(result.text.length).toBeLessThanOrEqual(5);
  });

  it("reports strategy name", () => {
    const result = extractor.extract("test");
    expect(result.strategy).toBe("md-strip");
  });

  it("handles real-world markdown document", () => {
    const md = `# API Documentation

## Overview

This is the **official** API for the platform.

## Authentication

Use \`Bearer\` tokens for auth.

> Note: Keep your token secret.

## Endpoints

- \`GET /api/users\` - List users
- \`POST /api/users\` - Create user

### Response Format

\`\`\`json
{
  "id": "123",
  "name": "John"
}
\`\`\`

See [docs](https://example.com) for more.`;

    const result = extractor.extract(md);
    expect(result.text).toContain("API Documentation");
    expect(result.text).toContain("official");
    expect(result.text).toContain("Bearer tokens");
    expect(result.text).toContain("GET /api/users");
    expect(result.text).toContain('"id": "123"');
    expect(result.text).toContain("docs");
    expect(result.text).not.toContain("**");
    expect(result.text).not.toContain("```");
    expect(result.text).not.toContain("https://example.com");
  });
});
