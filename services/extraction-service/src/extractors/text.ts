import { performance } from "node:perf_hooks";
import type {
  Extractor,
  ExtractionOptions,
  ExtractionResult,
} from "../types.js";
import type { DocumentSection } from "@memory-platform/shared-schemas";
import { sanitizeForStorage } from "@memory-platform/shared-utils";

export class TextExtractor implements Extractor {
  static readonly mimeTypes = [
    "text/plain",
    "text/plain; charset=utf-8",
    "text/plain; charset=us-ascii",
    "application/octet-stream",
  ];

  readonly strategy = "text-normalize";
  readonly mimeTypes = TextExtractor.mimeTypes;

  extract(raw: string, options?: ExtractionOptions): ExtractionResult {
    const start = performance.now();

    if (!raw || raw.length === 0) {
      return {
        text: "",
        textLength: 0,
        sections: [],
        metadata: { word_count: 0 },
        mimeType: "text/plain",
        strategy: this.strategy,
        durationMs: Math.round(performance.now() - start),
      };
    }

    let cleaned = sanitizeForStorage(raw);

    if (options?.maxLength && options.maxLength > 0 && cleaned.length > options.maxLength) {
      cleaned = cleaned.slice(0, options.maxLength);
    }

    const sections: DocumentSection[] = options?.preserveSections
      ? [
          {
            heading: "",
            level: 0,
            content: cleaned,
            start_offset: 0,
            end_offset: cleaned.length,
          },
        ]
      : [];

    const wordCount = cleaned
      ? cleaned.split(/\s+/).filter(Boolean).length
      : 0;

    return {
      text: cleaned,
      textLength: cleaned.length,
      sections,
      metadata: { word_count: wordCount },
      mimeType: "text/plain",
      strategy: this.strategy,
      durationMs: Math.round(performance.now() - start),
    };
  }
}
