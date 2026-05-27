import { createLogger, recordMetric, type Logger } from "@memory-platform/observability";
import type { PostgresPool } from "@memory-platform/db";
import type { SearchFilters } from "@memory-platform/shared-schemas";
import type { KeywordSearchResult } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";
import { filterBuilder } from "../filters.js";

export interface KeywordSearchConfig {
  tableName?: string;
}

export class KeywordSearch {
  private readonly logger: Logger;
  private readonly tableName: string;

  constructor(
    private readonly postgresPool: PostgresPool,
    config: KeywordSearchConfig = {},
  ) {
    this.logger = createLogger("retrieval:keyword");
    this.tableName = config.tableName ?? DEFAULT_CONFIG.keyword_table;
  }

  async search(
    query: string,
    workspaceId: string,
    filters: SearchFilters,
    topK: number,
  ): Promise<KeywordSearchResult[]> {
    const startTime = Date.now();

    const { conditions, params } = filterBuilder.buildPostgresConditions(
      filters,
      workspaceId,
    );

    let paramIndex = params.length + 1;

    const whereClause = conditions.join(" AND ");

    const queryTextPlain = query.replace(/[^\w\s]/g, " ").trim();
    const tsqueryInput = queryTextPlain
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => `${word}:*`)
      .join(" & ");

    const sqlQuery = `
      SELECT
        id AS chunk_id,
        document_id,
        workspace_id,
        text,
        ts_rank(search_vector, to_tsquery('english', $${paramIndex++})) AS score,
        ts_headline('english', text, to_tsquery('english', $${paramIndex++}), 'MaxWords=50, MinWords=20, StartSel=<mark>, StopSel=</mark>') AS headline,
        metadata
      FROM ${this.tableName}
      WHERE ${whereClause}
        AND search_vector @@ to_tsquery('english', $${paramIndex++})
      ORDER BY score DESC
      LIMIT $${paramIndex++}
    `;

    const allParams = [...params, tsqueryInput, tsqueryInput, tsqueryInput, topK];

    this.logger.debug("Executing keyword search", {
      workspaceId,
      table: this.tableName,
      topK,
      tsquery: tsqueryInput,
    });

    const rows = await this.postgresPool.sql.unsafe(
      sqlQuery,
      allParams as Parameters<typeof this.postgresPool.sql.unsafe>[1],
    ) as Record<string, unknown>[];

    const results: KeywordSearchResult[] = rows.map((row) => ({
      chunk_id: String(row.chunk_id ?? ""),
      document_id: String(row.document_id ?? "") as KeywordSearchResult["document_id"],
      workspace_id: String(row.workspace_id ?? "") as KeywordSearchResult["workspace_id"],
      text: String(row.text ?? ""),
      score: Number(row.score ?? 0),
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      headline: row.headline ? String(row.headline) : undefined,
    }));

    const latencyMs = Date.now() - startTime;

    recordMetric("retrieval.keyword.search.requests", 1, {
      workspace_id: workspaceId,
    });
    recordMetric("retrieval.keyword.search.latency_ms", latencyMs, {
      workspace_id: workspaceId,
    }, "histogram");
    recordMetric("retrieval.keyword.search.results", results.length, {
      workspace_id: workspaceId,
    });

    this.logger.info("Keyword search completed", {
      workspaceId,
      resultCount: results.length,
      latencyMs,
    });

    return results;
  }
}
