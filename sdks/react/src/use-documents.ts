import { useCallback, useRef, useState } from "react";
import type { Document, CreateDocumentDto, PaginatedResponse } from "@memory-platform/sdk-typescript";
import { useMemoryClientContext } from "./provider.js";
import type {
  UseDocumentsReturn,
  UseDocumentsState,
  DocumentListHookParams,
} from "./types.js";

const initialState: UseDocumentsState = {
  documents: null,
  loading: false,
  error: null,
  nextCursor: null,
  total: undefined,
};

export function useDocuments(): UseDocumentsReturn {
  const client = useMemoryClientContext();
  const [state, setState] = useState<UseDocumentsState>(initialState);
  const latestRequestId = useRef(0);
  const cursorRef = useRef<string | null>(null);

  const list = useCallback(
    async (params?: DocumentListHookParams): Promise<PaginatedResponse<Document>> => {
      const requestId = ++latestRequestId.current;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const response = await client.documents.list(params ?? {});
        cursorRef.current = response.next_cursor;

        if (requestId !== latestRequestId.current) {
          return response;
        }

        setState({
          documents: response.items,
          loading: false,
          error: null,
          nextCursor: response.next_cursor,
          total: response.total,
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

  const get = useCallback(
    async (id: string, workspaceId?: string): Promise<Document> => {
      const response = await client.documents.get(id, workspaceId);
      return response;
    },
    [client],
  );

  const add = useCallback(
    async (payload: CreateDocumentDto & { workspaceId?: string }): Promise<Document> => {
      const response = await client.documents.add(payload);
      return response;
    },
    [client],
  );

  const loadMore = useCallback(async (): Promise<PaginatedResponse<Document> | null> => {
    const next = cursorRef.current;
    if (!next) return null;

    const requestId = ++latestRequestId.current;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await client.documents.list({ cursor: next });
      cursorRef.current = response.next_cursor;

      if (requestId !== latestRequestId.current) {
        return response;
      }

      setState((prev) => ({
        documents: [...(prev.documents ?? []), ...response.items],
        loading: false,
        error: null,
        nextCursor: response.next_cursor,
        total: response.total,
      }));

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
  }, [client]);

  const reset = useCallback(() => {
    latestRequestId.current = 0;
    cursorRef.current = null;
    setState(initialState);
  }, []);

  return {
    ...state,
    list,
    get,
    add,
    loadMore,
    reset,
  };
}
