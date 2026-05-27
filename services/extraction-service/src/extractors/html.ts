import { performance } from "node:perf_hooks";
import type {
  Extractor,
  ExtractionOptions,
  ExtractionResult,
} from "../types.js";
import type { DocumentSection } from "@memory-platform/shared-schemas";

const HEADING_REGEX = /<h([1-6])(?:\s[^>]*)?>(.*?)<\/h\1>/gis;
const SCRIPT_STYLE_REGEX = /<(script|style|noscript|iframe|svg|canvas|template)\b[\s\S]*?<\/\1>/gi;
const COMMENT_REGEX = /<!--[\s\S]*?-->/g;
const TAG_REGEX = /<[^>]*>/g;
const ENTITY_REGEX = /&(?:[a-z\d]+|#\d+|#x[a-f\d]+);/gi;
const WHITESPACE_REGEX = /\s+/g;

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&#160;": " ",
  "&copy;": "\u00a9",
  "&reg;": "\u00ae",
  "&trade;": "\u2122",
  "&mdash;": "\u2014",
  "&ndash;": "\u2013",
  "&lsquo;": "\u2018",
  "&rsquo;": "\u2019",
  "&ldquo;": "\u201c",
  "&rdquo;": "\u201d",
  "&hellip;": "\u2026",
  "&laquo;": "\u00ab",
  "&raquo;": "\u00bb",
  "&middot;": "\u00b7",
  "&bull;": "\u2022",
};

const BLOCK_ELEMENTS = new Set([
  "div",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "dd",
  "dt",
  "td",
  "th",
  "blockquote",
  "pre",
  "article",
  "section",
  "header",
  "footer",
  "nav",
  "aside",
  "main",
  "figure",
  "figcaption",
  "fieldset",
  "form",
  "hr",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "ol",
  "ul",
  "dl",
]);

function decodeEntities(text: string): string {
  return text.replace(ENTITY_REGEX, (entity) => {
    if (HTML_ENTITIES[entity]) return HTML_ENTITIES[entity];
    const decMatch = entity.match(/^&#(\d+);$/);
    if (decMatch) {
      const code = parseInt(decMatch[1], 10);
      if (code > 0 && code <= 0x10ffff) return String.fromCodePoint(code);
    }
    const hexMatch = entity.match(/^&#x([a-f\d]+);$/i);
    if (hexMatch) {
      const code = parseInt(hexMatch[1], 16);
      if (code > 0 && code <= 0x10ffff) return String.fromCodePoint(code);
    }
    return entity;
  });
}

function extractBodyContent(html: string): string {
  const bodyMatch = html.match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1];
  return html;
}

function removeNonContent(html: string): string {
  return html
    .replace(COMMENT_REGEX, "")
    .replace(SCRIPT_STYLE_REGEX, "");
}

function insertBlockBreaks(html: string): string {
  return html.replace(
    /<\/(div|p|h[1-6]|li|dd|dt|td|th|blockquote|pre|article|section|header|footer|nav|aside|main|figure|figcaption|fieldset|form|hr|table|tr)\s*>/gi,
    "\n",
  ).replace(/<br\s*\/?>/gi, "\n");
}

function extractHeadings(html: string): { text: string; headings: { level: number; title: string; offset: number }[] } {
  const headings: { level: number; title: string; offset: number }[] = [];
  let cleanText = removeNonContent(html);

  HEADING_REGEX.lastIndex = 0;
  cleanText = cleanText.replace(HEADING_REGEX, (match, level: string, content: string) => {
    const plainContent = decodeEntities(content.replace(TAG_REGEX, "").trim());
    headings.push({
      level: parseInt(level, 10),
      title: plainContent,
      offset: 0,
    });
    return `\n${plainContent}\n`;
  });

  return { text: cleanText, headings };
}

function stripTags(html: string): string {
  return html.replace(TAG_REGEX, "");
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
 * HTML/XML content extractor.
 *
 * Strips tags, decodes HTML entities, removes scripts/styles/comments,
 * extracts body text, and preserves heading structure as DocumentSection[].
 */
export class HtmlExtractor implements Extractor {
  static readonly mimeTypes = [
    "text/html",
    "text/html; charset=utf-8",
    "application/xhtml+xml",
    "application/xml",
    "text/xml",
  ];

  readonly strategy = "html-cleanse";
  readonly mimeTypes = HtmlExtractor.mimeTypes;

  extract(raw: string, options?: ExtractionOptions): ExtractionResult {
    const start = performance.now();

    if (!raw || raw.length === 0) {
      return {
        text: "",
        textLength: 0,
        sections: [],
        metadata: { word_count: 0, tag_count: 0 },
        mimeType: "text/html",
        strategy: this.strategy,
        durationMs: Math.round(performance.now() - start),
      };
    }

    const bodyContent = extractBodyContent(raw);

    const tagMatches = raw.match(/<\/?[a-z][a-z0-9]*/gi) ?? [];
    const tagCount = tagMatches.length;

    const { text: headingProcessed, headings } = options?.preserveSections
      ? extractHeadings(bodyContent)
      : { text: bodyContent, headings: [] };

    const noScripts = removeNonContent(headingProcessed);
    const withBreaks = insertBlockBreaks(noScripts);
    const noTags = stripTags(withBreaks);
    const decoded = decodeEntities(noTags);
    let cleaned = normalizeWhitespace(decoded);

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
      metadata: { word_count: wordCount, tag_count: tagCount },
      mimeType: "text/html",
      strategy: this.strategy,
      durationMs: Math.round(performance.now() - start),
    };
  }
}
