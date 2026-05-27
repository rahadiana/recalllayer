import type { SearchFilters } from "@memory-platform/shared-schemas";
import type { VectorSearchResult, KeywordSearchResult } from "./types.js";

export interface FilterBuilder {
  buildQdrantFilter(filters: SearchFilters, workspaceId: string): Record<string, unknown>;
  buildPostgresConditions(filters: SearchFilters, workspaceId: string): {
    conditions: string[];
    params: unknown[];
  };
}

function buildMustConditions(
  filters: SearchFilters,
  workspaceId: string,
): Record<string, unknown>[] {
  const must: Record<string, unknown>[] = [
    { key: "workspace_id", match: { value: workspaceId } },
  ];

  if (filters.document_ids && filters.document_ids.length > 0) {
    if (filters.document_ids.length === 1) {
      must.push({ key: "document_id", match: { value: filters.document_ids[0] } });
    } else {
      must.push({
        key: "document_id",
        match: { any: filters.document_ids },
      });
    }
  }

  if (filters.tags && filters.tags.length > 0) {
    must.push({
      key: "tags",
      match: { any: filters.tags },
    });
  }

  return must;
}

function buildMustNotConditions(
  _filters: SearchFilters,
): Record<string, unknown>[] {
  return [];
}

function buildRangeFilter(
  filters: SearchFilters,
): Record<string, unknown> | undefined {
  const range: Record<string, unknown> = {};
  if (filters.created_after) {
    range.gte = filters.created_after;
  }
  if (filters.created_before) {
    range.lte = filters.created_before;
  }
  if (Object.keys(range).length > 0) {
    return { key: "created_at", range };
  }
  return undefined;
}

export const filterBuilder: FilterBuilder = {
  buildQdrantFilter(
    filters: SearchFilters,
    workspaceId: string,
  ): Record<string, unknown> {
    const must = buildMustConditions(filters, workspaceId);
    const must_not = buildMustNotConditions(filters);
    const rangeFilter = buildRangeFilter(filters);

    const filter: Record<string, unknown> = { must };
    if (must_not.length > 0) {
      filter.must_not = must_not;
    }
    if (rangeFilter) {
      must.push(rangeFilter);
    }

    if (filters.metadata && Object.keys(filters.metadata).length > 0) {
      for (const [key, value] of Object.entries(filters.metadata)) {
        must.push({
          key: `metadata.${key}`,
          match: { value },
        });
      }
    }

    return filter;
  },

  buildPostgresConditions(
    filters: SearchFilters,
    workspaceId: string,
  ) {
    let paramIndex = 1;
    const conditions: string[] = [`workspace_id = $${paramIndex++}`];
    const params: unknown[] = [workspaceId];

    if (filters.document_ids && filters.document_ids.length > 0) {
      const placeholders = filters.document_ids.map(() => `$${paramIndex++}`);
      conditions.push(`document_id IN (${placeholders.join(", ")})`);
      params.push(...filters.document_ids);
    }

    if (filters.tags && filters.tags.length > 0) {
      const placeholders = filters.tags.map(() => `$${paramIndex++}`);
      conditions.push(
        `EXISTS (SELECT 1 FROM unnest(tags) t WHERE t IN (${placeholders.join(", ")}))`,
      );
      params.push(...filters.tags);
    }

    if (filters.created_after) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.created_after);
    }

    if (filters.created_before) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.created_before);
    }

    if (filters.metadata && Object.keys(filters.metadata).length > 0) {
      for (const [key, value] of Object.entries(filters.metadata)) {
        conditions.push(`metadata ->> '${key}' = $${paramIndex++}`);
        params.push(String(value));
      }
    }

    return { conditions, params };
  },
};

export function applyFiltersToVector(
  results: VectorSearchResult[],
  filters: SearchFilters,
  workspaceId: string,
): VectorSearchResult[] {
  return results.filter((r) => {
    if (r.workspace_id !== workspaceId) return false;

    if (filters.document_ids?.length && !filters.document_ids.includes(r.document_id)) {
      return false;
    }

    if (filters.created_after && r.metadata?.created_at) {
      if (String(r.metadata.created_at) < filters.created_after) return false;
    }

    if (filters.created_before && r.metadata?.created_at) {
      if (String(r.metadata.created_at) > filters.created_before) return false;
    }

    if (filters.metadata) {
      for (const [key, value] of Object.entries(filters.metadata)) {
        if (r.metadata[key] !== value) return false;
      }
    }

    return true;
  });
}

export function applyFiltersToKeyword(
  results: KeywordSearchResult[],
  filters: SearchFilters,
  workspaceId: string,
): KeywordSearchResult[] {
  return results.filter((r) => {
    if (r.workspace_id !== workspaceId) return false;

    if (filters.document_ids?.length && !filters.document_ids.includes(r.document_id)) {
      return false;
    }

    if (filters.created_after && r.metadata?.created_at) {
      if (String(r.metadata.created_at) < filters.created_after) return false;
    }

    if (filters.created_before && r.metadata?.created_at) {
      if (String(r.metadata.created_at) > filters.created_before) return false;
    }

    if (filters.metadata) {
      for (const [key, value] of Object.entries(filters.metadata)) {
        if (r.metadata[key] !== value) return false;
      }
    }

    return true;
  });
}
