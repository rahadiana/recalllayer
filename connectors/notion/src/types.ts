/**
 * Notion-specific types for the Notion connector plugin.
 *
 * These types model the Notion API concepts (blocks, pages, databases)
 * and are used internally by the client, mapper, and sync modules.
 */

import type { Timestamp, Metadata } from "@memory-platform/shared-schemas";

// ─── Notion Object Types ────────────────────────────────────────────────────

/** Notion object types that the connector can process. */
export type NotionObjectType = "page" | "database" | "block";

/** Supported Notion block types. */
export type NotionBlockType =
  | "paragraph"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "bulleted_list_item"
  | "numbered_list_item"
  | "to_do"
  | "toggle"
  | "child_page"
  | "child_database"
  | "image"
  | "code"
  | "quote"
  | "callout"
  | "divider"
  | "table"
  | "table_row"
  | "bookmark"
  | "link_preview"
  | "video"
  | "file"
  | "pdf"
  | "embed"
  | "equation"
  | "unsupported";

// ─── Notion Block ────────────────────────────────────────────────────────────

/** Rich text annotation formatting. */
export interface NotionRichTextAnnotations {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  code: boolean;
  color: string;
}

/** A single rich text element within a block. */
export interface NotionRichText {
  type: "text" | "mention" | "equation";
  plain_text: string;
  href: string | null;
  annotations: NotionRichTextAnnotations;
  text?: {
    content: string;
    link: { url: string } | null;
  };
  mention?: Metadata;
  equation?: { expression: string };
}

/** A Notion block object from the API. */
export interface NotionBlock {
  object: "block";
  id: string;
  parent: {
    type: "page_id" | "database_id" | "block_id";
    page_id?: string;
    database_id?: string;
    block_id?: string;
  };
  created_time: Timestamp;
  last_edited_time: Timestamp;
  created_by: { object: "user"; id: string };
  last_edited_by: { object: "user"; id: string };
  has_children: boolean;
  archived: boolean;
  type: NotionBlockType;
  [blockContent: string]: unknown;
}

/** Raw block content for a specific block type. */
export interface NotionBlockContent {
  rich_text?: NotionRichText[];
  children?: NotionBlock[];
  checked?: boolean;
  expression?: string;
  language?: string;
  caption?: NotionRichText[];
  file?: {
    type: "external" | "file";
    external?: { url: string };
    file?: { url: string; expiry_time: string };
    name?: string;
  };
  external?: { url: string };
}

// ─── Notion Page / Database ──────────────────────────────────────────────────

/** A Notion page object. */
export interface NotionPage {
  object: "page";
  id: string;
  created_time: Timestamp;
  last_edited_time: Timestamp;
  created_by: { object: "user"; id: string };
  last_edited_by: { object: "user"; id: string };
  archived: boolean;
  icon: { type: "emoji" | "external" | "file"; emoji?: string; external?: { url: string }; file?: { url: string } } | null;
  cover: { type: "external" | "file"; external?: { url: string }; file?: { url: string } } | null;
  properties: Record<string, NotionPageProperty>;
  parent: {
    type: "database_id" | "page_id" | "workspace" | "block_id";
    database_id?: string;
    page_id?: string;
    workspace?: boolean;
    block_id?: string;
  };
  url: string;
  public_url: string | null;
}

/** A single property value on a Notion page. */
export interface NotionPageProperty {
  id: string;
  type: PropertyType;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  number?: number | null;
  select?: { id: string; name: string; color: string } | null;
  multi_select?: Array<{ id: string; name: string; color: string }>;
  date?: { start: string; end: string | null; time_zone: string | null } | null;
  checkbox?: boolean;
  url?: string | null;
  email?: string | null;
  phone_number?: string | null;
  formula?: Metadata;
  relation?: Array<{ id: string }>;
  rollup?: Metadata;
  status?: { id: string; name: string; color: string } | null;
  files?: Array<{
    name: string;
    type: "external" | "file";
    external?: { url: string };
    file?: { url: string; expiry_time: Timestamp };
  }>;
}

export type PropertyType =
  | "title"
  | "rich_text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "phone_number"
  | "formula"
  | "relation"
  | "rollup"
  | "status"
  | "files"
  | "people"
  | "created_time"
  | "last_edited_time"
  | "created_by"
  | "last_edited_by";

/** A Notion database object. */
export interface NotionDatabase {
  object: "database";
  id: string;
  created_time: Timestamp;
  last_edited_time: Timestamp;
  created_by: { object: "user"; id: string };
  last_edited_by: { object: "user"; id: string };
  title: NotionRichText[];
  description: NotionRichText[];
  icon: NotionPage["icon"];
  cover: NotionPage["cover"];
  properties: Record<string, NotionDatabaseProperty>;
  parent: {
    type: "page_id" | "workspace" | "block_id";
    page_id?: string;
    workspace?: boolean;
    block_id?: string;
  };
  url: string;
  public_url: string | null;
  archived: boolean;
  is_inline: boolean;
}

/** A database property definition. */
export interface NotionDatabaseProperty {
  id: string;
  name: string;
  type: PropertyType;
  title?: Record<string, never>;
  rich_text?: Record<string, never>;
  number?: { format: string };
  select?: { options: Array<{ id: string; name: string; color: string }> };
  multi_select?: { options: Array<{ id: string; name: string; color: string }> };
  date?: Record<string, never>;
  checkbox?: Record<string, never>;
  url?: Record<string, never>;
  email?: Record<string, never>;
  phone_number?: Record<string, never>;
  formula?: { expression: string };
  relation?: { database_id: string; synced_property_name?: string; synced_property_id?: string };
  status?: { options: Array<{ id: string; name: string; color: string }>; groups: Array<{ id: string; name: string; color: string; option_ids: string[] }> };
  files?: Record<string, never>;
  people?: Record<string, never>;
}

// ─── API Response Types ──────────────────────────────────────────────────────

/** Paginated response from list endpoints. */
export interface NotionPaginatedResponse<T> {
  object: "list";
  results: T[];
  next_cursor: string | null;
  has_more: boolean;
  type: string;
}

/** Search request body. */
export interface NotionSearchRequest {
  query?: string;
  sort?: {
    direction: "ascending" | "descending";
    timestamp: "last_edited_time" | "created_time";
  };
  filter?: {
    property: "object";
    value: "page" | "database";
  };
  start_cursor?: string;
  page_size?: number;
}

/** Search response from Notion API. */
export interface NotionSearchResponse {
  object: "list";
  results: Array<NotionPage | NotionDatabase>;
  next_cursor: string | null;
  has_more: boolean;
}

/** Block children list response. */
export interface NotionBlockChildrenResponse extends NotionPaginatedResponse<NotionBlock> {
  block: Record<string, unknown>;
}

// ─── Rate Limit ──────────────────────────────────────────────────────────────

/** Rate limit tracking state. */
export interface NotionRateLimitState {
  remaining: number;
  resetTimestamp: number;
  lastRequestTime: number;
}
