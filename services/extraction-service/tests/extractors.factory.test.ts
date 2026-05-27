import { describe, it, expect, beforeEach } from "vitest";
import { getExtractor, registerExtractor, TextExtractor, HtmlExtractor, MarkdownExtractor, PdfExtractor } from "../src/extractors/index.js";
import type { Extractor, ExtractionResult } from "../src/types.js";

describe("ExtractorFactory", () => {
  it("returns TextExtractor for text/plain", () => {
    const extractor = getExtractor("text/plain");
    expect(extractor).toBeInstanceOf(TextExtractor);
    expect(extractor.strategy).toBe("text-normalize");
  });

  it("returns TextExtractor for text/plain with charset", () => {
    const extractor = getExtractor("text/plain; charset=utf-8");
    expect(extractor).toBeInstanceOf(TextExtractor);
  });

  it("returns HtmlExtractor for text/html", () => {
    const extractor = getExtractor("text/html");
    expect(extractor).toBeInstanceOf(HtmlExtractor);
    expect(extractor.strategy).toBe("html-cleanse");
  });

  it("returns HtmlExtractor for application/xhtml+xml", () => {
    const extractor = getExtractor("application/xhtml+xml");
    expect(extractor).toBeInstanceOf(HtmlExtractor);
  });

  it("returns MarkdownExtractor for text/markdown", () => {
    const extractor = getExtractor("text/markdown");
    expect(extractor).toBeInstanceOf(MarkdownExtractor);
    expect(extractor.strategy).toBe("md-strip");
  });

  it("returns PdfExtractor for application/pdf", () => {
    const extractor = getExtractor("application/pdf");
    expect(extractor).toBeInstanceOf(PdfExtractor);
    expect(extractor.strategy).toBe("pdf-text-placeholder");
  });

  it("falls back to TextExtractor for unknown MIME type", () => {
    const extractor = getExtractor("application/unknown-format");
    expect(extractor).toBeInstanceOf(TextExtractor);
  });

  it("is case-insensitive for MIME types", () => {
    const extractor = getExtractor("TEXT/HTML");
    expect(extractor).toBeInstanceOf(HtmlExtractor);
  });

  it("caches extractor instances", () => {
    const a = getExtractor("text/plain");
    const b = getExtractor("text/plain");
    expect(a).toBe(b);
  });

  it("allows registering custom extractors", () => {
    const customExtractor: Extractor = {
      strategy: "custom-noop",
      mimeTypes: ["application/custom"],
      extract(raw: string): ExtractionResult {
        return {
          text: raw,
          textLength: raw.length,
          sections: [],
          metadata: {},
          mimeType: "application/custom",
          strategy: "custom-noop",
          durationMs: 0,
        };
      },
    };

    registerExtractor(["application/custom"], customExtractor);
    const resolved = getExtractor("application/custom");
    expect(resolved).toBe(customExtractor);
    expect(resolved.strategy).toBe("custom-noop");
  });

  it("custom extractor works correctly", () => {
    const customExtractor: Extractor = {
      strategy: "to-upper",
      mimeTypes: ["text/upper"],
      extract(raw: string): ExtractionResult {
        return {
          text: raw.toUpperCase(),
          textLength: raw.length,
          sections: [],
          metadata: {},
          mimeType: "text/upper",
          strategy: "to-upper",
          durationMs: 0,
        };
      },
    };

    registerExtractor(["text/upper"], customExtractor);
    const resolved = getExtractor("text/upper");
    const result = resolved.extract("hello");
    expect(result.text).toBe("HELLO");
  });

  it("extractors preserve their mime types", () => {
    const textExt = new TextExtractor();
    const htmlExt = new HtmlExtractor();
    const mdExt = new MarkdownExtractor();
    const pdfExt = new PdfExtractor();

    expect(textExt.mimeTypes).toContain("text/plain");
    expect(htmlExt.mimeTypes).toContain("text/html");
    expect(mdExt.mimeTypes).toContain("text/markdown");
    expect(pdfExt.mimeTypes).toContain("application/pdf");
  });
});
