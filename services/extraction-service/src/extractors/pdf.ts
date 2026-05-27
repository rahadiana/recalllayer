import { performance } from "node:perf_hooks";
import type {
  Extractor,
  ExtractionOptions,
  ExtractionResult,
} from "../types.js";
import { ExtractionError } from "../types.js";
import type { DocumentSection } from "@memory-platform/shared-schemas";

const PDF_TEXT_HINT_REGEX = /\/Type|\/Text|\/Font|BT\b|\bET\b|Tf\b|Tj\b|TJ\b|stream|endstream|\bobj\b|\bendobj\b/;
const STREAM_REGEX = /stream\r?\n([\s\S]*?)endstream/g;
const PDF_OBJ_REGEX = /(\d+ \d+ obj[\s\S]*?endobj)/g;
const ESCAPE_SEQUENCE_REGEX = /\\([()\\nrtbf])/g;
const PAREN_TEXT_REGEX = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;

function extractParenText(content: string): string {
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = PAREN_TEXT_REGEX.exec(content)) !== null) {
    const raw = match[1];
    const unescaped = raw.replace(ESCAPE_SEQUENCE_REGEX, (_, char) => {
      switch (char) {
        case "n": return "\n";
        case "r": return "\r";
        case "t": return "\t";
        case "b": return "\b";
        case "f": return "\f";
        default: return char;
      }
    });
    results.push(unescaped);
  }
  return results.join(" ");
}

function isTextBasedPdf(raw: string): boolean {
  return PDF_TEXT_HINT_REGEX.test(raw);
}

/**
 * PDF placeholder extractor (MVP).
 *
 * Attempts light text extraction from raw PDF content without a full
 * PDF library. Handles text-based PDFs by extracting strings from PDF
 * operators. Binary PDFs return an empty result with a warning.
 */
export class PdfExtractor implements Extractor {
  static readonly mimeTypes = [
    "application/pdf",
    "application/x-pdf",
  ];

  readonly strategy = "pdf-text-placeholder";
  readonly mimeTypes = PdfExtractor.mimeTypes;

  extract(raw: string, options?: ExtractionOptions): ExtractionResult {
    const start = performance.now();

    if (!raw || raw.length === 0) {
      return {
        text: "",
        textLength: 0,
        sections: [],
        metadata: { word_count: 0, pdf_text_based: false },
        mimeType: "application/pdf",
        strategy: this.strategy,
        durationMs: Math.round(performance.now() - start),
      };
    }

    if (!isTextBasedPdf(raw)) {
      return {
        text: "",
        textLength: 0,
        sections: [],
        metadata: {
          word_count: 0,
          pdf_text_based: false,
          note: "Binary PDF detected — full PDF parsing requires a dedicated PDF library (not available in MVP).",
        },
        mimeType: "application/pdf",
        strategy: this.strategy,
        durationMs: Math.round(performance.now() - start),
      };
    }

    const textPieces: string[] = [];

    let streamMatch: RegExpExecArray | null;
    STREAM_REGEX.lastIndex = 0;
    while ((streamMatch = STREAM_REGEX.exec(raw)) !== null) {
      const streamContent = streamMatch[1];
      const extracted = extractParenText(streamContent);
      if (extracted) textPieces.push(extracted);
    }

    let cleaned = textPieces
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (options?.maxLength && options.maxLength > 0) {
      cleaned = cleaned.slice(0, options.maxLength);
    }

    const sections: DocumentSection[] = [];
    if (options?.preserveSections && cleaned) {
      sections.push({
        heading: "",
        level: 0,
        content: cleaned,
        start_offset: 0,
        end_offset: cleaned.length,
      });
    }

    const wordCount = cleaned
      ? cleaned.split(/\s+/).filter(Boolean).length
      : 0;

    return {
      text: cleaned,
      textLength: cleaned.length,
      sections,
      metadata: {
        word_count: wordCount,
        pdf_text_based: true,
        stream_count: textPieces.length,
        note: cleaned
          ? "Light text extraction succeeded. For higher fidelity, use a full PDF library."
          : "Text-based PDF detected but no extractable text found in streams.",
      },
      mimeType: "application/pdf",
      strategy: this.strategy,
      durationMs: Math.round(performance.now() - start),
    };
  }
}
