import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { MemoryClient } from "@memory-platform/sdk-typescript";
import type { MemoryClientOptions } from "@memory-platform/sdk-typescript";

const MemoryContext = createContext<MemoryClient | null>(null);

export interface MemoryProviderProps {
  /** MemoryClient configuration options. */
  config: MemoryClientOptions;
  /** React children that will have access to the MemoryClient instance. */
  children: ReactNode;
}

/**
 * React context provider that creates and exposes a MemoryClient instance
 * to all descendant components via the useMemoryClient() hook.
 */
export function MemoryProvider({ config, children }: MemoryProviderProps) {
  const client = useMemo(() => new MemoryClient(config), [
    config.apiKey,
    config.baseUrl,
    config.workspaceId,
    config.timeoutMs,
    config.maxRetries,
  ]);

  return (
    <MemoryContext.Provider value={client}>
      {children}
    </MemoryContext.Provider>
  );
}

export function useMemoryClientContext(): MemoryClient {
  const client = useContext(MemoryContext);
  if (!client) {
    throw new Error(
      "useMemoryClient() must be used within a <MemoryProvider>. " +
      "Wrap your component tree with <MemoryProvider config={{ apiKey: '...' }}>.",
    );
  }
  return client;
}
