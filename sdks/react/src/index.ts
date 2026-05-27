export { MemoryProvider } from "./provider.js";
export type { MemoryProviderProps } from "./provider.js";

export { useMemoryClient } from "./hooks.js";
export { useMemorySearch } from "./use-search.js";
export { useDocuments } from "./use-documents.js";
export { useConnectorStatus } from "./use-connectors.js";

export type {
  UseMemorySearchState,
  UseMemorySearchActions,
  SearchQueryOptions,
  UseMemorySearchReturn,
  UseDocumentsState,
  UseDocumentsActions,
  DocumentListHookParams,
  UseDocumentsReturn,
  UseConnectorStatusState,
  UseConnectorStatusActions,
  ConnectorSyncOptions,
  UseConnectorStatusReturn,
  UseMemoryClientReturn,
} from "./types.js";
