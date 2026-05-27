import { useCallback, useRef, useState } from "react";
import type { SyncJob } from "@memory-platform/sdk-typescript";
import { useMemoryClientContext } from "./provider.js";
import type {
  UseConnectorStatusReturn,
  UseConnectorStatusState,
  ConnectorSyncOptions,
} from "./types.js";

const initialState: UseConnectorStatusState = {
  status: null,
  lastSyncedAt: null,
  lastJob: null,
  loading: false,
  error: null,
};

export function useConnectorStatus(): UseConnectorStatusReturn {
  const client = useMemoryClientContext();
  const [state, setState] = useState<UseConnectorStatusState>(initialState);
  const latestRequestId = useRef(0);

  const fetchStatus = useCallback(
    async (connectorType: string, workspaceId?: string): Promise<void> => {
      const requestId = ++latestRequestId.current;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const response = await client.connectors.status(connectorType, workspaceId);

        if (requestId !== latestRequestId.current) {
          return;
        }

        setState((prev) => ({
          ...prev,
          status: response.status,
          lastSyncedAt: response.lastSyncedAt ?? null,
          loading: false,
          error: null,
        }));
      } catch (err) {
        if (requestId !== latestRequestId.current) {
          return;
        }

        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
      }
    },
    [client],
  );

  const sync = useCallback(
    async (connectorType: string, options?: ConnectorSyncOptions): Promise<SyncJob> => {
      const requestId = ++latestRequestId.current;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const response = await client.connectors.sync(connectorType, {
          syncMode: options?.syncMode,
          workspaceId: options?.workspaceId,
        });

        if (requestId !== latestRequestId.current) {
          return response;
        }

        setState((prev) => ({
          ...prev,
          lastJob: response,
          loading: false,
          error: null,
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
    },
    [client],
  );

  const reset = useCallback(() => {
    latestRequestId.current = 0;
    setState(initialState);
  }, []);

  return {
    ...state,
    fetchStatus,
    sync,
    reset,
  };
}
