/**
 * Pagination Helpers
 *
 * Pure utility functions for cursor-based and offset-based pagination.
 * Zero external dependencies.
 */

export interface PaginationParams {
  /** Maximum number of items to return */
  limit?: number;
  /** Offset for offset-based pagination */
  offset?: number;
  /** Opaque cursor for cursor-based pagination */
  cursor?: string;
  /** Sort direction */
  sort?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  /** The items for the current page */
  items: T[];
  /** Total count of all items (when available) */
  total?: number;
  /** Cursor to fetch the next page. `null` when there are no more pages. */
  nextCursor: string | null;
  /** Cursor to fetch the previous page. `null` when on the first page. */
  prevCursor: string | null;
  /** Whether there are more items after this page */
  hasMore: boolean;
  /** The actual limit used for this page */
  limit: number;
  /** The actual offset used for this page */
  offset: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function createCursor(data: unknown): string {
  if (data === null || data === undefined) {
    return "";
  }
  const json = JSON.stringify(data);
  return toBase64(json);
}

/**
 * Decode an opaque cursor string back to its original value.
 *
 * @param cursor - The base64-encoded cursor string
 * @returns The decoded value, or `null` if the cursor is invalid
 */
export function parseCursor<T = unknown>(cursor: string): T | null {
  if (!cursor) return null;
  try {
    const json = fromBase64(cursor);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function toBase64(input: string): string {
  try {
    const binary = encodeURIComponent(input).replace(
      /%([0-9A-F]{2})/g,
      (_match, hex) => String.fromCharCode(parseInt(hex, 16)),
    );
    return btoa(binary);
  } catch {
    return "";
  }
}

function fromBase64(input: string): string {
  try {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

export interface ApplyPaginationOptions {
  /** Field name used for cursor-based pagination (must be sortable) */
  cursorField?: string;
  /** Default sort direction */
  sort?: "asc" | "desc";
}

/**
 * Apply cursor-based and offset-based pagination to an array of items.
 *
 * This is designed for in-memory paging or as a reference implementation
 * for database-level pagination patterns.
 *
 * When a `cursor` is provided, items are filtered to those AFTER the cursor value
 * (for ascending sort) or BEFORE it (for descending). The cursor value is compared
 * against the specified `cursorField` on each item.
 *
 * @param items - The full array of items
 * @param params - Pagination parameters (limit, offset, cursor, sort)
 * @param options - Additional options (cursorField, default sort)
 * @returns A `PaginatedResult<T>` with the paged items and metadata
 */
export function applyPagination<T>(
  items: T[],
  params: PaginationParams = {},
  options: ApplyPaginationOptions = {},
): PaginatedResult<T> {
  const limit = Math.min(Math.max(1, params.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, params.offset ?? 0);
  const sort = params.sort ?? options.sort ?? "desc";
  const cursorField = options.cursorField;
  let cursorValue: unknown = null;
  if (params.cursor && cursorField) {
    cursorValue = parseCursor(params.cursor);
  }

  let filtered = items;
  if (cursorValue !== null && cursorValue !== undefined && cursorField) {
    filtered = items.filter((item) => {
      const val = (item as Record<string, unknown>)[cursorField];
      if (val === undefined || val === null) return false;
      if (sort === "desc") {
        return (val as number | string) < (cursorValue as number | string);
      }
      return (val as number | string) > (cursorValue as number | string);
    });
  }

  const sliced = filtered.slice(offset, offset + limit + 1);
  const hasMore = sliced.length > limit;
  const pageItems = sliced.slice(0, limit);
  let nextCursor: string | null = null;
  let prevCursor: string | null = null;

  if (hasMore && cursorField && pageItems.length > 0) {
    const lastItem = pageItems[pageItems.length - 1];
    nextCursor = createCursor((lastItem as Record<string, unknown>)[cursorField]);
  }

  if (offset > 0 && cursorField && pageItems.length > 0) {
    const firstItem = pageItems[0];
    prevCursor = createCursor((firstItem as Record<string, unknown>)[cursorField]);
  }

  return {
    items: pageItems,
    total: items.length,
    nextCursor,
    prevCursor,
    hasMore,
    limit,
    offset,
  };
}
