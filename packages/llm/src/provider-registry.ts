/**
 * Provider Registry
 *
 * Central registry for managing LLM provider instances.
 * Supports registering, looking up, and listing providers by type and name.
 */

import type { EmbeddingProvider } from "./providers/embedding.js";
import type { ChatProvider } from "./providers/chat.js";
import type { RerankerProvider } from "./providers/reranker.js";
import type { TokenCounter } from "./token-counter.js";

// ─── Registry Types ────────────────────────────────────────────────────────────

/** Supported provider types in the registry */
export type ProviderType = "embedding" | "chat" | "reranker" | "token-counter";

/** Union of all provider interfaces */
export type AnyProvider =
  | EmbeddingProvider
  | ChatProvider
  | RerankerProvider
  | TokenCounter;

/** Map of provider type to its interface */
export interface ProviderTypeMap {
  embedding: EmbeddingProvider;
  chat: ChatProvider;
  reranker: RerankerProvider;
  "token-counter": TokenCounter;
}

// ─── Provider Entry ────────────────────────────────────────────────────────────

interface ProviderEntry<T extends ProviderType> {
  type: T;
  name: string;
  provider: ProviderTypeMap[T];
}

// ─── Provider Registry ─────────────────────────────────────────────────────────

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderEntry<ProviderType>>();

  /**
   * Register a provider instance under a given type and name.
   *
   * @param type     - Provider type ("embedding", "chat", "reranker", "token-counter")
   * @param name     - Unique name for this provider instance (e.g. "openai", "anthropic")
   * @param provider - The provider instance
   */
  register<T extends ProviderType>(
    type: T,
    name: string,
    provider: ProviderTypeMap[T],
  ): void {
    const key = buildKey(type, name);
    if (this.providers.has(key)) {
      throw new Error(
        `Provider already registered: type="${type}" name="${name}"`,
      );
    }
    this.providers.set(key, { type, name, provider } as ProviderEntry<ProviderType>);
  }

  /**
   * Retrieve a registered provider by type and name.
   *
   * @param type - Provider type
   * @param name - Provider name
   * @returns The provider instance
   * @throws If no provider is registered under the given type and name
   */
  get<T extends ProviderType>(
    type: T,
    name: string,
  ): ProviderTypeMap[T] {
    const key = buildKey(type, name);
    const entry = this.providers.get(key);
    if (!entry) {
      throw new Error(
        `Provider not found: type="${type}" name="${name}"`,
      );
    }
    return entry.provider as ProviderTypeMap[T];
  }

  /**
   * Check if a provider is registered.
   *
   * @param type - Provider type
   * @param name - Provider name
   */
  has(type: ProviderType, name: string): boolean {
    const key = buildKey(type, name);
    return this.providers.has(key);
  }

  /**
   * Remove a registered provider.
   *
   * @param type - Provider type
   * @param name - Provider name
   * @returns true if the provider was removed, false if it didn't exist
   */
  unregister(type: ProviderType, name: string): boolean {
    const key = buildKey(type, name);
    return this.providers.delete(key);
  }

  /**
   * List all registered providers, optionally filtered by type.
   *
   * @param type - Optional provider type filter
   * @returns Array of provider entries
   */
  list(type?: ProviderType): Array<{ type: ProviderType; name: string }> {
    const results: Array<{ type: ProviderType; name: string }> = [];
    for (const entry of this.providers.values()) {
      if (!type || entry.type === type) {
        results.push({ type: entry.type, name: entry.name });
      }
    }
    return results;
  }

  /**
   * List provider names for a specific type.
   *
   * @param type - Provider type
   * @returns Array of provider names
   */
  listNames(type: ProviderType): string[] {
    return this.list(type).map((e) => e.name);
  }

  /**
   * Remove all registered providers.
   */
  clear(): void {
    this.providers.clear();
  }

  /**
   * Get the number of registered providers.
   */
  get size(): number {
    return this.providers.size;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

const _globalRegistry = new ProviderRegistry();

/**
 * Get the global singleton ProviderRegistry instance.
 */
export function getProviderRegistry(): ProviderRegistry {
  return _globalRegistry;
}

/**
 * Register a provider in the global registry.
 *
 * @param type     - Provider type
 * @param name     - Unique provider name
 * @param provider - The provider instance
 */
export function registerProvider<T extends ProviderType>(
  type: T,
  name: string,
  provider: ProviderTypeMap[T],
): void {
  _globalRegistry.register(type, name, provider);
}

/**
 * Get a provider from the global registry.
 *
 * @param type - Provider type
 * @param name - Provider name
 * @returns The provider instance
 */
export function getProvider<T extends ProviderType>(
  type: T,
  name: string,
): ProviderTypeMap[T] {
  return _globalRegistry.get(type, name);
}

/**
 * List providers in the global registry, optionally filtered by type.
 *
 * @param type - Optional provider type filter
 */
export function listProviders(
  type?: ProviderType,
): Array<{ type: ProviderType; name: string }> {
  return _globalRegistry.list(type);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildKey(type: ProviderType, name: string): string {
  return `${type}:${name}`;
}
