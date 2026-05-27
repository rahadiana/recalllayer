import { describe, it, expect } from "vitest";
import { PdfExtractor } from "../src/extractors/pdf.js";

const extractor = new PdfExtractor();

describe("PdfExtractor", () => {
  it("returns empty result for empty string", () => {
    const result = extractor.extract("");
    expect(result.text).toBe("");
    expect(result.textLength).toBe(0);
    expect(result.metadata.word_count).toBe(0);
    expect(result.metadata.pdf_text_based).toBe(false);
  });

  it("detects binary PDF and returns empty with note", () => {
    const binaryPdf = "%PDF-1.4\n%\xFF\xFE\xFD\n1 0 obj\n<< /Type /Catalog >>\nendobj\n";
    const result = extractor.extract(binaryPdf);
    expect(result.text).toBe("");
    expect(result.textLength).toBe(0);
    expect(result.metadata.pdf_text_based).toBe(true);
    expect(result.metadata.note).toBeDefined();
  });

  it("extracts text from PDF text operators", () => {
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Page >>
stream
BT
/F1 12 Tf
(Hello World) Tj
ET
endstream
endobj`;

    const result = extractor.extract(pdfContent);
    expect(result.text).toContain("Hello World");
    expect(result.metadata.pdf_text_based).toBe(true);
  });

  it("extracts text from multiple streams", () => {
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Page >>
stream
BT
(First) Tj
ET
endstream
endobj
2 0 obj
<< /Type /Page >>
stream
BT
(Second) Tj
ET
endstream
endobj`;

    const result = extractor.extract(pdfContent);
    expect(result.text).toContain("First");
    expect(result.text).toContain("Second");
  });

  it("reports stream_count in metadata", () => {
    const pdfContent = `%PDF-1.4
1 0 obj << >> stream
BT
(One) Tj
ET
endstream endobj
2 0 obj << >> stream
BT
(Two) Tj
ET
endstream endobj`;

    const result = extractor.extract(pdfContent);
    expect(result.metadata.stream_count).toBeGreaterThanOrEqual(2);
  });

  it("produces sections when preserveSections is true", () => {
    const pdfContent = `%PDF-1.4
1 0 obj << >> stream
BT
(Content) Tj
ET
endstream endobj`;

    const result = extractor.extract(pdfContent, { preserveSections: true });
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.sections[0].content).toContain("Content");
  });

  it("respects maxLength", () => {
    const pdfContent = `%PDF-1.4
1 0 obj << >> stream
BT
(Hello World) Tj
ET
endstream endobj`;

    const result = extractor.extract(pdfContent, { maxLength: 5 });
    expect(result.text.length).toBeLessThanOrEqual(5);
  });

  it("reports strategy name", () => {
    const result = extractor.extract("test");
    expect(result.strategy).toBe("pdf-text-placeholder");
  });

  it("handles PDF with TJ array operator", () => {
    const pdfContent = `%PDF-1.4
1 0 obj << >> stream
BT
/F1 12 Tf
[(Hello) ( ) (World)] TJ
ET
endstream endobj`;

    const result = extractor.extract(pdfContent);
    expect(result.text).toContain("Hello");
    expect(result.text).toContain("World");
  });

  it("handles PDF with no extractable text gracefully", () => {
    const pdfContent = `%PDF-1.4
1 0 obj << >> stream
BT
( ) Tj
ET
endstream endobj`;

    const result = extractor.extract(pdfContent);
    expect(result.textLength).toBe(0);
    expect(result.metadata.note).toBeDefined();
  });

  it("handles escaped parentheses in PDF strings", () => {
    const pdfContent = `%PDF-1.4
1 0 obj << >> stream
BT
(Text with \\(parentheses\\)) Tj
ET
endstream endobj`;

    const result = extractor.extract(pdfContent);
    expect(result.text).toContain("Text with (parentheses)");
  });
});
