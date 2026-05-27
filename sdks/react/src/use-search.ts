import { useCallback, useRef, useState } from "react";
import type { SearchResponse } from "@memory-platform/sdk-typescript";
import { useMemoryClientContext } from "./provider.js";
import type {
  UseMemorySearchReturn,
  UseMemorySearchState,
  SearchQueryOptions,
} from "./types.js";

const initialState: UseMemorySearchState = {
  results: null,
  loading: false,
  error: null,
  totalHits: 0,
  latencyMs: null,
};

export function useMemorySearch(): UseMemorySearchReturn {
  const client = useMemoryClientContext();
  const [state, setState] = useState<UseMemorySearchState>(initialState);
  const latestRequestId = useRef(0);

  const search = useCallback(
    async (query: string, options?: SearchQueryOptions): Promise<SearchResponse> => {
      const requestId = ++latestRequestId.current;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const response = await client.search.query({
          query,
          topK: options?.topK,
          similarityThreshold: options?.similarityThreshold,
          filters: options?.filters,
          hybrid: options?.hybrid,
          workspaceId: options?.workspaceId,
        });

        if (requestId !== latestRequestId.current) {
          return response;
        }

        setState({
          results: response.results,
          loading: false,
          error: null,
          totalHits: response.total_hits,
          latencyMs: response.latency_ms,
        });

        return response;
      } catch (err) {
        if (requestId !== latestRequestId.current) {
          throw err;
        }

        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }));

        throw err;
      }
    },
    [client],
  );

  const reset = useCallback(() => {
    latestRequestId.current = 0;
    setState(initialState);
  }, []);

  return {
    ...state,
    search,
    reset,
  };
}
