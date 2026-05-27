import { performance } from "node:perf_hooks";
import type {
  Extractor,
  ExtractionOptions,
  ExtractionResult,
} from "../types.js";
import type { DocumentSection } from "@memory-platform/shared-schemas";

const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;
const BOLD_REGEX = /\*\*([^*]+)\*\*/g;
const ITALIC_REGEX = /(?<!\*)\*([^*]+)\*(?!\*)/g;
const BOLD_ITALIC_REGEX = /\*\*\*([^*]+)\*\*\*/g;
const UNDERSCORE_BOLD_REGEX = /__([^_]+)__/g;
const UNDERSCORE_ITALIC_REGEX = /(?<!_)_([^_]+)_(?!_)/g;
const STRIKETHROUGH_REGEX = /~~([^~]+)~~/g;
const LINK_REGEX = /\[([^\]]*)\]\([^)]*\)/g;
const IMAGE_REGEX = /!\[([^\]]*)\]\([^)]*\)/g;
const INLINE_CODE_REGEX = /`([^`]+)`/g;
const CODE_BLOCK_REGEX = /```[\s\S]*?```/g;
const BLOCKQUOTE_REGEX = /^>\s?/gm;
const UNORDERED_LIST_REGEX = /^[\s]*[-*+]\s+/gm;
const ORDERED_LIST_REGEX = /^[\s]*\d+\.\s+/gm;
const HORIZONTAL_RULE_REGEX = /^[-*_]{3,}\s*$/gm;
const HTML_TAG_REGEX = /<[^>]*>/g;
const WHITESPACE_REGEX = /\s+/g;

function stripMarkdownSyntax(text: string): string {
  let cleaned = text;

  cleaned = cleaned.replace(HORIZONTAL_RULE_REGEX, "");

  cleaned = cleaned.replace(CODE_BLOCK_REGEX, (match) => {
    const inner = match
      .replace(/^```\w*\n?/, "")
      .replace(/```\s*$/, "");
    return inner
      .replace(BOLD_REGEX, "$1")
      .replace(ITALIC_REGEX, "$1")
      .replace(BOLD_ITALIC_REGEX, "$1")
      .replace(UNDERSCORE_BOLD_REGEX, "$1")
      .replace(UNDERSCORE_ITALIC_REGEX, "$1")
      .replace(STRIKETHROUGH_REGEX, "$1");
  });

  cleaned = cleaned.replace(IMAGE_REGEX, "$1");
  cleaned = cleaned.replace(LINK_REGEX, "$1");
  cleaned = cleaned.replace(BOLD_ITALIC_REGEX, "$1");
  cleaned = cleaned.replace(BOLD_REGEX, "$1");
  cleaned = cleaned.replace(ITALIC_REGEX, "$1");
  cleaned = cleaned.replace(UNDERSCORE_BOLD_REGEX, "$1");
  cleaned = cleaned.replace(UNDERSCORE_ITALIC_REGEX, "$1");
  cleaned = cleaned.replace(STRIKETHROUGH_REGEX, "$1");
  cleaned = cleaned.replace(INLINE_CODE_REGEX, "$1");
  cleaned = cleaned.replace(HTML_TAG_REGEX, "");

  cleaned = cleaned.replace(BLOCKQUOTE_REGEX, "");
  cleaned = cleaned.replace(UNORDERED_LIST_REGEX, "");
  cleaned = cleaned.replace(ORDERED_LIST_REGEX, "");

  return cleaned;
}

function extractHeadings(text: string): { cleaned: string; headings: { level: number; title: string }[] } {
  const headings: { level: number; title: string }[] = [];

  HEADING_REGEX.lastIndex = 0;
  const cleaned = text.replace(HEADING_REGEX, (_match, hashes: string, content: string) => {
    const title = content.trim();
    headings.push({ level: hashes.length, title });
    return `\n${title}\n`;
  });

  return { cleaned, headings };
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(WHITESPACE_REGEX, " ")
    .replace(/\n +/g, "\n")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Markdown text extractor.
 *
 * Strips markdown formatting (bold, italic, links, images, code blocks,
 * blockquotes, lists, horizontal rules) while preserving code block
 * content and heading structure.
 */
export class MarkdownExtractor implements Extractor {
  static readonly mimeTypes = [
    "text/markdown",
    "text/x-markdown",
    "text/md",
  ];

  readonly strategy = "md-strip";
  readonly mimeTypes = MarkdownExtractor.mimeTypes;

  extract(raw: string, options?: ExtractionOptions): ExtractionResult {
    const start = performance.now();

    if (!raw || raw.length === 0) {
      return {
        text: "",
        textLength: 0,
        sections: [],
        metadata: { word_count: 0 },
        mimeType: "text/markdown",
        strategy: this.strategy,
        durationMs: Math.round(performance.now() - start),
      };
    }

    const { cleaned: headingProcessed, headings } = options?.preserveSections
      ? extractHeadings(raw)
      : { cleaned: raw, headings: [] };

    const stripped = stripMarkdownSyntax(headingProcessed);
    let cleaned = normalizeWhitespace(stripped);

    if (options?.maxLength && options.maxLength > 0) {
      cleaned = cleaned.slice(0, options.maxLength);
    }

    const sections: DocumentSection[] = [];
    if (options?.preserveSections && headings.length > 0) {
      let runningOffset = 0;
      for (let i = 0; i < headings.length; i++) {
        const current = headings[i];
        const next = headings[i + 1];
        const headingIndex = cleaned.indexOf(current.title, runningOffset);
        const startOffset = headingIndex >= 0 ? headingIndex : runningOffset;
        const contentEnd = next
          ? cleaned.indexOf(next.title, startOffset + current.title.length)
          : cleaned.length;

        const content = cleaned.slice(
          startOffset + current.title.length,
          contentEnd > startOffset ? contentEnd : cleaned.length,
        ).trim();

        sections.push({
          heading: current.title,
          level: current.level,
          content,
          start_offset: startOffset,
          end_offset: contentEnd > startOffset ? contentEnd : startOffset + content.length,
        });

        runningOffset = contentEnd > startOffset ? contentEnd : startOffset + content.length;
      }
    }

    const wordCount = cleaned
      ? cleaned.split(/\s+/).filter(Boolean).length
      : 0;

    return {
      text: cleaned,
      textLength: cleaned.length,
      sections,
      metadata: { word_count: wordCount },
      mimeType: "text/markdown",
      strategy: this.strategy,
      durationMs: Math.round(performance.now() - start),
    };
  }
}
