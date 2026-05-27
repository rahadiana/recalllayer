/**
 * Common / foundational types used across all domains.
 *
 * These types provide consistent primitives for identifiers, timestamps,
 * pagination, and generic metadata payloads used by every service.
 *
 * @module common
 */

// ─── Branded identifier types ───────────────────────────────────────────────

/**
 * Brand for workspace-level unique identifiers.
 * Use `WorkspaceId` to distinguish workspace-scoped IDs from raw strings.
 */
declare const WorkspaceIdBrand: unique symbol;
/** Branded workspace ID string. */
export type WorkspaceId = string & { [WorkspaceIdBrand]: true };

/**
 * Brand for document-level unique identifiers.
 */
declare const DocumentIdBrand: unique symbol;
/** Branded document ID string. */
export type DocumentId = string & { [DocumentIdBrand]: true };

/** A ULID or UUID used as a globally unique entity identifier. */
export type EntityId = string;

/** A ULID or UUID used as a globally unique user identifier. */
export type UserId = string;

/** A short unique identifier for a tenant / organisation. */
export type TenantId = string;

// ─── Timestamp ───────────────────────────────────────────────────────────────

/**
 * ISO-8601 UTC timestamp string.
 *
 * All services MUST emit and consume timestamps in this format.
 *
 * @example "2026-05-14T09:30:00.000Z"
 */
export type Timestamp = string;

// ─── Pagination ──────────────────────────────────────────────────────────────

/**
 * Standard pagination parameters for list endpoints.
 */
export interface PaginationParams {
  /** Maximum number of items to return (1–1000). */
  limit: number;
  /** Opaque cursor for the next page (first request omits). */
  cursor?: string;
}

/**
 * Paginated response wrapper.
 *
 * @template T - Item type being paginated.
 */
export interface PaginatedResponse<T> {
  /** The current page of items. */
  items: T[];
  /** Opaque cursor for the next page, or `null` when exhausted. */
  next_cursor: string | null;
  /** Total number of items (optional – may be omitted for some stores). */
  total?: number;
}

// ─── Metadata ────────────────────────────────────────────────────────────────

/**
 * Generic key-value metadata bag.
 *
 * Used for extensible user-defined or connector-supplied metadata
 * attached to documents, chunks, entities, etc.
 */
export type Metadata = Record<string, unknown>;

// ─── Sorting ─────────────────────────────────────────────────────────────────

/** Sort direction. */
export type SortDirection = "asc" | "desc";

/** A single sort descriptor. */
export interface SortField {
  /** Field name to sort by. */
  field: string;
  /** Sort direction. */
  direction: SortDirection;
}
