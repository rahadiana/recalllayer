/**
 * Notion sync logic.
 *
 * Handles delta detection, pagination, and rate-limit-aware syncing
 * of Notion pages and databases into ExternalItem records.
 *
 * Sync modes:
 *  - "full" — Fetch all pages and databases recursively.
 *  - "incremental" — Only fetch items changed since the last sync cursor.
 */

import type { ConnectorConfig, Timestamp, Metadata } from "@memory-platform/shared-schemas";
import type { ExternalItem, SyncResult } from "./types.js";
import { NotionClient } from "./client.js";
import { mapPageToExternalItem, mapDatabaseToExternalItem, buildSyncResult } from "./mapper.js";

// ─── Sync Parameters ─────────────────────────────────────────────────────────

export interface NotionSyncParams {
  accessToken: string;
  config: ConnectorConfig;
  cursor?: string;
  since?: Timestamp;
}

// ─── Sync ─────────────────────────────────────────────────────────────────══──

/**
 * Execute a sync operation against Notion.
 *
 * @returns SyncResult with discovered items and pagination cursor.
 */
export async function syncNotion(params: NotionSyncParams): Promise<SyncResult> {
  const client = new NotionClient(params.accessToken);
  const items: ExternalItem[] = [];
  const metadata: Metadata = {
    startTime: new Date().toISOString(),
    mode: params.cursor ? "incremental" : "full",
  };

  // Determine sync mode from cursor presence
  const isIncremental = !!params.cursor;

  try {
    // ── Sync Pages ──────────────────────────────────────────────────────
    const pageResult = await syncPages(client, {
      cursor: params.cursor ? parsePageCursor(params.cursor) : undefined,
      since: params.since,
      isIncremental,
    });
    items.push(...pageResult.items);

    // ── Sync Databases ──────────────────────────────────────────────────
    const dbResult = await syncDatabases(client, {
      cursor: params.cursor ? parseDatabaseCursor(params.cursor) : undefined,
      since: params.since,
      isIncremental,
    });
    items.push(...dbResult.items);

    const hasMore = pageResult.hasMore || dbResult.hasMore;
    const nextCursor = hasMore
      ? serializeCursor({
          pageCursor: pageResult.nextCursor,
          databaseCursor: dbResult.nextCursor,
        })
      : undefined;

    metadata.itemCount = items.length;
    metadata.pageCount = pageResult.items.length;
    metadata.databaseCount = dbResult.items.length;
    metadata.endTime = new Date().toISOString();

    return buildSyncResult({
      items,
      cursor: nextCursor,
      hasMore,
      metadata,
    });
  } catch (error) {
    metadata.error = error instanceof Error ? error.message : "Unknown error";
    metadata.endTime = new Date().toISOString();

    return buildSyncResult({ items, metadata });
  }
}

// ─── Page Sync ───────────────────────────────────────────────────────────────

interface PageSyncOptions {
  cursor?: string;
  since?: Timestamp;
  isIncremental: boolean;
}

interface PageSyncResult {
  items: ExternalItem[];
  nextCursor?: string;
  hasMore: boolean;
}

async function syncPages(
  client: NotionClient,
  options: PageSyncOptions,
): Promise<PageSyncResult> {
  const items: ExternalItem[] = [];
  let pageCursor = options.cursor;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore) {
    const result = await client.listPages({
      cursor: pageCursor,
      pageSize: 100,
    });

    for (const page of result.pages) {
      // Filter by "since" for incremental sync
      if (options.since && page.last_edited_time < options.since) {
        continue;
      }

      // Skip archived if not explicitly filtered for
      const shouldSkipArchived =
        !options.isIncremental && page.archived;
      if (shouldSkipArchived) continue;

      items.push(mapPageToExternalItem(page));
      pageCount++;
    }

    pageCursor = result.nextCursor ?? undefined;
    hasMore = result.hasMore;
  }

  return { items, nextCursor: pageCursor, hasMore };
}

// ─── Database Sync ───────────────────────────────────────────────────────────

interface DatabaseSyncOptions {
  cursor?: string;
  since?: Timestamp;
  isIncremental: boolean;
}

interface DatabaseSyncResult {
  items: ExternalItem[];
  nextCursor?: string;
  hasMore: boolean;
}

async function syncDatabases(
  client: NotionClient,
  options: DatabaseSyncOptions,
): Promise<DatabaseSyncResult> {
  const items: ExternalItem[] = [];
  let dbCursor = options.cursor;
  let hasMore = true;
  let dbCount = 0;

  while (hasMore) {
    const result = await client.listDatabases({
      cursor: dbCursor,
      pageSize: 100,
    });

    for (const database of result.databases) {
      // Filter by "since" for incremental sync
      if (options.since && database.last_edited_time < options.since) {
        continue;
      }

      if (database.archived && !options.isIncremental) continue;

      items.push(mapDatabaseToExternalItem(database));
      dbCount++;

      // Optionally sync pages within this database
      if (options.since) {
        // Only sync pages changed since the last run
        const dbPages = await client.queryDatabase({
          databaseId: database.id,
          sorts: [
            {
              timestamp: "last_edited_time",
              direction: "descending",
            },
          ],
        });

        for (const dbPage of dbPages.pages) {
          if (options.since && dbPage.last_edited_time < options.since) {
            continue;
          }
          items.push(mapPageToExternalItem(dbPage));
          dbCount++;
        }
      }
    }

    dbCursor = result.nextCursor ?? undefined;
    hasMore = result.hasMore;
  }

  return { items, nextCursor: dbCursor, hasMore };
}

// ─── Cursor Serialization ────────────────────────────────────────────────────

interface NotionCursor {
  pageCursor?: string;
  databaseCursor?: string;
}

function serializeCursor(cursor: NotionCursor): string {
  return JSON.stringify(cursor);
}

function parsePageCursor(cursor: string): string | undefined {
  try {
    const parsed = JSON.parse(cursor) as NotionCursor;
    return parsed.pageCursor;
  } catch {
    return undefined;
  }
}

function parseDatabaseCursor(cursor: string): string | undefined {
  try {
    const parsed = JSON.parse(cursor) as NotionCursor;
    return parsed.databaseCursor;
  } catch {
    return undefined;
  }
}
