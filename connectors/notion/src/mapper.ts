/**
 * Notion-to-DocumentSource mapper.
 *
 * Maps Notion pages, databases, and blocks to the platform's
 * ExternalItem and DocumentSource schemas. No extraction/parsing
 * of content — only metadata mapping.
 */

import type { DocumentSource, Timestamp, Metadata } from "@memory-platform/shared-schemas";
import type { ExternalItem, SyncResult } from "./types.js";
import type {
  NotionPage,
  NotionDatabase,
  NotionBlock,
  NotionRichText,
} from "./types.js";

// ─── Rich Text Helpers ───────────────────────────────────────────────────────

/** Extract plain text from an array of rich text objects. */
export function richTextToPlain(richText: NotionRichText[]): string {
  return richText.map((rt) => rt.plain_text).join("");
}

// ─── Page Mapping ────────────────────────────────────────────────────────────

/**
 * Map a Notion page to an ExternalItem.
 */
export function mapPageToExternalItem(page: NotionPage): ExternalItem {
  const title = extractPageTitle(page);
  const checksum = computeChecksum(page.last_edited_time, page.id);

  return {
    externalId: page.id,
    name: title,
    mimeType: "application/x-notion-page",
    sizeBytes: undefined,
    updatedAt: page.last_edited_time as Timestamp,
    createdAt: page.created_time as Timestamp,
    parentRef: page.parent.database_id ?? page.parent.page_id ?? undefined,
    checksum,
    externalUrl: page.url,
    isDeleted: page.archived,
    raw: {
      object: page.object,
      archived: page.archived,
      icon: page.icon ?? undefined,
      cover: page.cover ?? undefined,
      properties: page.properties,
      parentType: page.parent.type,
      publicUrl: page.public_url,
    },
  };
}

/**
 * Map a Notion page to a DocumentSource.
 */
export function mapPageToDocumentSource(page: NotionPage): DocumentSource {
  const title = extractPageTitle(page);

  return {
    type: "connector",
    connector: "notion",
    location: page.url,
    filename: `${title}.notion`,
    mime_type: "application/x-notion-page",
    size_bytes: undefined,
  };
}

/**
 * Extract the title from a Notion page's properties.
 *
 * Notion pages have a "title" property in their property bag.
 * Returns the page ID as fallback.
 */
export function extractPageTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title" && prop.title && prop.title.length > 0) {
      return richTextToPlain(prop.title);
    }
  }
  return page.id;
}

// ─── Database Mapping ────────────────────────────────────────────────────────

/**
 * Map a Notion database to an ExternalItem.
 */
export function mapDatabaseToExternalItem(
  database: NotionDatabase,
): ExternalItem {
  const title = richTextToPlain(database.title);
  const checksum = computeChecksum(database.last_edited_time, database.id);

  return {
    externalId: database.id,
    name: title || database.id,
    mimeType: "application/x-notion-database",
    sizeBytes: undefined,
    updatedAt: database.last_edited_time as Timestamp,
    createdAt: database.created_time as Timestamp,
    parentRef: database.parent.page_id ?? undefined,
    checksum,
    externalUrl: database.url,
    isDeleted: database.archived,
    raw: {
      object: database.object,
      archived: database.archived,
      icon: database.icon ?? undefined,
      cover: database.cover ?? undefined,
      properties: database.properties,
      isInline: database.is_inline,
      description: richTextToPlain(database.description),
    },
  };
}

/**
 * Map a Notion database to a DocumentSource.
 */
export function mapDatabaseToDocumentSource(
  database: NotionDatabase,
): DocumentSource {
  const title = richTextToPlain(database.title);

  return {
    type: "connector",
    connector: "notion",
    location: database.url,
    filename: `${title || database.id}.notion-db`,
    mime_type: "application/x-notion-database",
    size_bytes: undefined,
  };
}

// ─── Block Mapping ───────────────────────────────────────────────────────────

/**
 * Map a Notion block to an ExternalItem (for standalone block tracking).
 */
export function mapBlockToExternalItem(block: NotionBlock): ExternalItem {
  const plainText = extractBlockText(block);
  const checksum = computeChecksum(block.last_edited_time, block.id);

  return {
    externalId: block.id,
    name: plainText ? truncate(plainText, 100) : `Block ${block.id}`,
    mimeType: `application/x-notion-${block.type}`,
    sizeBytes: undefined,
    updatedAt: block.last_edited_time as Timestamp,
    createdAt: block.created_time as Timestamp,
    parentRef:
      block.parent.page_id ??
      block.parent.database_id ??
      block.parent.block_id,
    checksum,
    externalUrl: undefined,
    isDeleted: block.archived,
    raw: {
      object: block.object,
      type: block.type,
      archived: block.archived,
      hasChildren: block.has_children,
      parentType: block.parent.type,
      createdBy: block.created_by,
      lastEditedBy: block.last_edited_by,
    },
  };
}

/** Extract plain text from a block for naming purposes. */
function extractBlockText(block: NotionBlock): string {
  const content = block[block.type] as Record<string, unknown> | undefined;
  if (content?.rich_text) {
    const richText = content.rich_text as NotionRichText[];
    return richTextToPlain(richText);
  }
  return "";
}

// ─── Sync Result Helpers ─────────────────────────────────────────────────────

/**
 * Build a SyncResult from a list of mapped items.
 */
export function buildSyncResult(params: {
  items: ExternalItem[];
  cursor?: string;
  hasMore?: boolean;
  metadata?: Metadata;
}): SyncResult {
  return {
    items: params.items,
    cursor: params.cursor,
    hasMore: params.hasMore ?? false,
    metadata: {
      connectorType: "notion",
      itemCount: params.items.length,
      ...params.metadata,
    },
  };
}

// ─── Checksum ────────────────────────────────────────────────────────────────

/**
 * Compute a simple checksum for change detection.
 *
 * Uses a hash of the resource ID and last-edited timestamp.
 * In a production environment, this should use a cryptographic hash.
 */
export function computeChecksum(
  lastEditedTime: string,
  externalId: string,
): string {
  return `${externalId}:${lastEditedTime}`;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
