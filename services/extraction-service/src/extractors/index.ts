import type { Extractor } from "../types.js";
import { TextExtractor } from "./text.js";
import { HtmlExtractor } from "./html.js";
import { MarkdownExtractor } from "./markdown.js";
import { PdfExtractor } from "./pdf.js";

const MIME_EXTRACTOR_MAP: Map<string, () => Extractor> = new Map();
const extractorCache = new Map<string, Extractor>();

function register(mimeTypes: string[], factory: () => Extractor): void {
  for (const mime of mimeTypes) {
    MIME_EXTRACTOR_MAP.set(mime.toLowerCase(), factory);
  }
}

register(TextExtractor.mimeTypes, () => new TextExtractor());
register(HtmlExtractor.mimeTypes, () => new HtmlExtractor());
register(MarkdownExtractor.mimeTypes, () => new MarkdownExtractor());
register(PdfExtractor.mimeTypes, () => new PdfExtractor());

/**
 * Resolve an extractor for the given MIME type.
 *
 * Falls back to TextExtractor for unrecognised types.
 */
export function getExtractor(mimeType: string): Extractor {
  const key = mimeType.toLowerCase();
  const cached = extractorCache.get(key);
  if (cached) return cached;

  const factory = MIME_EXTRACTOR_MAP.get(key);
  const extractor = factory ? factory() : new TextExtractor();
  extractorCache.set(key, extractor);
  return extractor;
}

/**
 * Register a custom extractor at runtime (useful for testing).
 */
export function registerExtractor(mimeTypes: string[], extractor: Extractor): void {
  for (const mime of mimeTypes) {
    const key = mime.toLowerCase();
    MIME_EXTRACTOR_MAP.set(key, () => extractor);
    extractorCache.set(key, extractor);
  }
}

export { TextExtractor, HtmlExtractor, MarkdownExtractor, PdfExtractor };
