/**
 * Text Sanitization Helpers
 *
 * Pure utility functions for text manipulation and sanitization.
 * Zero external dependencies.
 */

// ─── Truncate ────────────────────────────────────────────────────────────────

/**
 * Truncate a string to a maximum length, appending an ellipsis if truncated.
 *
 * The result will never exceed `maxLength` characters.
 * If the text is shorter than or equal to `maxLength`, it is returned unchanged.
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum length of the result (including ellipsis)
 * @param ellipsis - The ellipsis string (default: "…")
 * @returns Truncated text, or the original if it fits
 */
export function truncate(text: string, maxLength: number, ellipsis = "…"): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  if (maxLength <= ellipsis.length) return ellipsis.slice(0, maxLength);
  const availableForText = maxLength - ellipsis.length;
  if (availableForText <= 0) return ellipsis.slice(0, maxLength);
  return text.slice(0, availableForText) + ellipsis;
}

// ─── Slugify ─────────────────────────────────────────────────────────────────

/**
 * Convert a string into a URL-friendly slug.
 *
 * Transforms to lowercase, replaces non-alphanumeric characters with hyphens,
 * collapses consecutive hyphens, and trims leading/trailing hyphens.
 *
 * @param text - The string to slugify
 * @param separator - Word separator (default: "-")
 * @returns A URL-safe slug string
 */
export function slugify(text: string, separator = "-"): string {
  if (!text) return "";

  return text
    .toString()
    .normalize("NFKD") // Decompose combined characters (e.g. accented chars)
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_\-]+/g, separator)
    .replace(new RegExp(`^${escapeRegExp(separator)}+|${escapeRegExp(separator)}+$`, "g"), "");
}

// ─── Strip HTML ──────────────────────────────────────────────────────────────

const HTML_TAG_REGEX = /<[^>]*>/g;
const HTML_ENTITY_REGEX = /&(?:[a-z\d]+|#\d+|#x[a-f\d]+);/gi;

// Common HTML entities map
const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&#160;": " ",
};

/**
 * Strip HTML tags from a string and decode common HTML entities.
 *
 * @param html - The HTML string to clean
 * @returns Plain text with tags removed and entities decoded
 */
export function stripHtml(html: string): string {
  if (!html) return "";

  let text = html.replace(HTML_TAG_REGEX, "");

  text = text.replace(HTML_ENTITY_REGEX, (entity) => {
    if (HTML_ENTITIES[entity]) return HTML_ENTITIES[entity];

    const decMatch = entity.match(/^&#(\d+);$/);
    if (decMatch) {
      const code = parseInt(decMatch[1], 10);
      return String.fromCodePoint(code);
    }

    const hexMatch = entity.match(/^&#x([a-f\d]+);$/i);
    if (hexMatch) {
      const code = parseInt(hexMatch[1], 16);
      return String.fromCodePoint(code);
    }

    return entity;
  });

  text = text.replace(/\s+/g, " ").trim();

  return text;
}

// ─── Sanitize for Storage ────────────────────────────────────────────────────

/**
 * Sanitize text for safe storage in a database or log system.
 *
 * Performs multiple cleaning operations:
 * - Trims whitespace
 * - Removes null bytes and other control characters (except newlines/tabs)
 * - Normalizes Unicode
 * - Collapses excessive whitespace
 * - Optionally truncates to a maximum length
 *
 * @param text - The text to sanitize
 * @param maxLength - Optional maximum length (truncation applied after cleaning)
 * @returns Cleaned text safe for storage
 */
export function sanitizeForStorage(text: string, maxLength?: number): string {
  if (!text) return "";

  let cleaned = text
    .normalize("NFC")
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[^\S\n\t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (maxLength !== undefined && cleaned.length > maxLength) {
    cleaned = truncate(cleaned, maxLength);
  }

  return cleaned;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
