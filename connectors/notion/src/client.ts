/**
 * Notion API client wrapper.
 *
 * Wraps the Notion REST API v1 with minimal HTTP logic:
 * - List pages / databases (search)
 * - Get page content
 * - Get database content
 * - List block children
 *
 * All calls include automatic rate-limit handling (retry-after).
 * Raw responses are returned — no mapping/extraction happens here.
 */

import type {
  NotionPage,
  NotionDatabase,
  NotionBlock,
  NotionBlockChildrenResponse,
  NotionSearchResponse,
  NotionRateLimitState,
  NotionPaginatedResponse,
} from "./types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2022-06-28";
const DEFAULT_PAGE_SIZE = 100;
const MAX_RETRIES = 5;

// ─── Client ──────────────────────────────────────────────────────────────────

export class NotionClient {
  private readonly accessToken: string;
  private rateLimit: NotionRateLimitState = {
    remaining: 3,
    resetTimestamp: 0,
    lastRequestTime: 0,
  };

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  // ─── Search ──────────────────────────────────────────────────────────────

  /**
   * Search for pages and databases.
   *
   * @param query - Optional search query
   * @param filter - Filter by object type ("page" or "database")
   * @param cursor - Pagination cursor
   * @param pageSize - Results per page (max 100)
   */
  async search(params: {
    query?: string;
    filter?: "page" | "database";
    cursor?: string;
    pageSize?: number;
  }): Promise<NotionSearchResponse> {
    const body: Record<string, unknown> = {
      page_size: params.pageSize ?? DEFAULT_PAGE_SIZE,
    };

    if (params.query) body.query = params.query;
    if (params.filter) {
      body.filter = { property: "object", value: params.filter };
    }
    if (params.cursor) body.start_cursor = params.cursor;

    const response = await this.request<NotionSearchResponse>(
      "/search",
      { method: "POST", body },
    );

    return response;
  }

  /**
   * List pages accessible to the integration.
   */
  async listPages(params: {
    cursor?: string;
    pageSize?: number;
  } = {}): Promise<{ pages: NotionPage[]; nextCursor: string | null; hasMore: boolean }> {
    const response = await this.search({
      filter: "page",
      cursor: params.cursor,
      pageSize: params.pageSize,
    });

    const pages = response.results.filter(
      (r): r is NotionPage => r.object === "page",
    );

    return {
      pages,
      nextCursor: response.next_cursor,
      hasMore: response.has_more,
    };
  }

  /**
   * List databases accessible to the integration.
   */
  async listDatabases(params: {
    cursor?: string;
    pageSize?: number;
  } = {}): Promise<{ databases: NotionDatabase[]; nextCursor: string | null; hasMore: boolean }> {
    const response = await this.search({
      filter: "database",
      cursor: params.cursor,
      pageSize: params.pageSize,
    });

    const databases = response.results.filter(
      (r): r is NotionDatabase => r.object === "database",
    );

    return {
      databases,
      nextCursor: response.next_cursor,
      hasMore: response.has_more,
    };
  }

  // ─── Pages ───────────────────────────────────────────────────────────────

  /**
   * Get a page by ID.
   */
  async getPage(pageId: string): Promise<NotionPage> {
    return this.request<NotionPage>(`/pages/${pageId}`);
  }

  /**
   * Get block children of a page or block.
   */
  async getBlockChildren(params: {
    blockId: string;
    cursor?: string;
    pageSize?: number;
  }): Promise<{
    blocks: NotionBlock[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const url = `/blocks/${params.blockId}/children`;
    const searchParams = new URLSearchParams();
    searchParams.set("page_size", String(params.pageSize ?? DEFAULT_PAGE_SIZE));
    if (params.cursor) searchParams.set("start_cursor", params.cursor);

    const response = await this.request<NotionBlockChildrenResponse>(
      `${url}?${searchParams.toString()}`,
    );

    return {
      blocks: response.results,
      nextCursor: response.next_cursor,
      hasMore: response.has_more,
    };
  }

  /**
   * Get all block children recursively for a page/block.
   */
  async getAllBlockChildren(
    blockId: string,
  ): Promise<NotionBlock[]> {
    const allBlocks: NotionBlock[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.getBlockChildren({
        blockId,
        cursor,
      });
      allBlocks.push(...result.blocks);

      // Recurse into blocks that have children
      for (const block of result.blocks) {
        if (block.has_children) {
          const childBlocks = await this.getAllBlockChildren(block.id);
          allBlocks.push(...childBlocks);
        }
      }

      cursor = result.nextCursor ?? undefined;
    } while (cursor);

    return allBlocks;
  }

  // ─── Databases ─────────────────────────────────────────────────────────══

  /**
   * Get a database by ID.
   */
  async getDatabase(databaseId: string): Promise<NotionDatabase> {
    return this.request<NotionDatabase>(`/databases/${databaseId}`);
  }

  /**
   * Query a database (list pages within it).
   */
  async queryDatabase(params: {
    databaseId: string;
    cursor?: string;
    pageSize?: number;
    filter?: Record<string, unknown>;
    sorts?: Array<{
      property?: string;
      timestamp?: "created_time" | "last_edited_time";
      direction: "ascending" | "descending";
    }>;
  }): Promise<{
    pages: NotionPage[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const body: Record<string, unknown> = {
      page_size: params.pageSize ?? DEFAULT_PAGE_SIZE,
    };

    if (params.cursor) body.start_cursor = params.cursor;
    if (params.filter) body.filter = params.filter;
    if (params.sorts) body.sorts = params.sorts;

    const response = await this.request<
      NotionPaginatedResponse<NotionPage>
    >(`/databases/${params.databaseId}/query`, { method: "POST", body });

    return {
      pages: response.results,
      nextCursor: response.next_cursor,
      hasMore: response.has_more,
    };
  }

  // ─── HTTP Layer ─────────────────────────────────────────────────────────═

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const url = `${NOTION_API_BASE}${path}`;
    const method = options.method ?? "GET";

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
      ...options.headers,
    };

    let retries = 0;

    while (true) {
      await this.waitForRateLimit();

      const response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      this.updateRateLimit(response);

      if (response.ok) {
        return (await response.json()) as T;
      }

      // Rate limited (429)
      if (response.status === 429) {
        if (retries >= MAX_RETRIES) {
          throw new Error(
            `Notion API rate limit exceeded after ${MAX_RETRIES} retries`,
          );
        }
        retries++;
        const retryAfter = parseInt(
          response.headers.get("retry-after") ?? "1",
          10,
        );
        await this.sleep(retryAfter * 1000);
        continue;
      }

      // Other errors
      const errorBody = await response.text();
      throw new Error(
        `Notion API error: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }
  }

  // ─── Rate Limiting ─────────────────────────────────────────────────────

  private updateRateLimit(response: Response): void {
    const remaining = response.headers.get("ratelimit-remaining");
    const reset = response.headers.get("ratelimit-reset");
    this.rateLimit = {
      remaining: remaining ? parseInt(remaining, 10) : this.rateLimit.remaining,
      resetTimestamp: reset
        ? parseInt(reset, 10)
        : this.rateLimit.resetTimestamp,
      lastRequestTime: Date.now(),
    };
  }

  private async waitForRateLimit(): Promise<void> {
    if (this.rateLimit.remaining <= 0) {
      const waitMs =
        Math.max(this.rateLimit.resetTimestamp * 1000 - Date.now(), 0) + 100;
      await this.sleep(waitMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
