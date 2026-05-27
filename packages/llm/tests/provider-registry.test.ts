import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ProviderRegistry,
  getProviderRegistry,
  registerProvider,
  getProvider,
  listProviders,
} from "../src/provider-registry.js";
import type { EmbeddingProvider } from "../src/providers/embedding.js";
import type { ChatProvider } from "../src/providers/chat.js";
import type { RerankerProvider } from "../src/providers/reranker.js";
import type { TokenCounter } from "../src/token-counter.js";

function mockEmbeddingProvider(name: string): EmbeddingProvider {
  return {
    name,
    generateEmbedding: vi.fn(),
    generateEmbeddings: vi.fn(),
  };
}

function mockChatProvider(name: string): ChatProvider {
  return {
    name,
    generateChat: vi.fn(),
    streamChat: vi.fn(),
  };
}

function mockRerankerProvider(name: string): RerankerProvider {
  return {
    name,
    rerank: vi.fn(),
  };
}

function mockTokenCounter(name: string): TokenCounter {
  return {
    countTokens: vi.fn(),
    estimateTokens: vi.fn(),
    tokenLimit: vi.fn(),
  };
}

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it("registers and retrieves a provider", () => {
    const provider = mockEmbeddingProvider("openai");
    registry.register("embedding", "openai", provider);
    expect(registry.get("embedding", "openai")).toBe(provider);
  });

  it("throws when registering duplicate", () => {
    const provider = mockEmbeddingProvider("openai");
    registry.register("embedding", "openai", provider);
    expect(() => registry.register("embedding", "openai", provider)).toThrow(
      "Provider already registered",
    );
  });

  it("throws when getting non-existent provider", () => {
    expect(() => registry.get("embedding", "missing")).toThrow(
      "Provider not found",
    );
  });

  it("checks if a provider exists with has()", () => {
    const provider = mockChatProvider("openai");
    registry.register("chat", "openai", provider);
    expect(registry.has("chat", "openai")).toBe(true);
    expect(registry.has("chat", "anthropic")).toBe(false);
  });

  it("lists providers with optional type filter", () => {
    registry.register("embedding", "openai", mockEmbeddingProvider("openai"));
    registry.register("chat", "openai", mockChatProvider("openai"));
    registry.register("chat", "anthropic", mockChatProvider("anthropic"));

    const all = registry.list();
    expect(all).toHaveLength(3);

    const chatOnly = registry.list("chat");
    expect(chatOnly).toHaveLength(2);
    expect(chatOnly.map((e) => e.name)).toEqual(["openai", "anthropic"]);
  });

  it("lists provider names for a type", () => {
    registry.register("chat", "openai", mockChatProvider("openai"));
    registry.register("chat", "anthropic", mockChatProvider("anthropic"));
    expect(registry.listNames("chat")).toEqual(["openai", "anthropic"]);
  });

  it("unregisters a provider", () => {
    const provider = mockEmbeddingProvider("openai");
    registry.register("embedding", "openai", provider);
    expect(registry.unregister("embedding", "openai")).toBe(true);
    expect(registry.has("embedding", "openai")).toBe(false);
  });

  it("returns false when unregistering non-existent", () => {
    expect(registry.unregister("embedding", "missing")).toBe(false);
  });

  it("clears all providers", () => {
    registry.register("embedding", "openai", mockEmbeddingProvider("openai"));
    registry.register("chat", "openai", mockChatProvider("openai"));
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.list()).toHaveLength(0);
  });

  it("tracks correct size", () => {
    expect(registry.size).toBe(0);
    registry.register("embedding", "openai", mockEmbeddingProvider("openai"));
    expect(registry.size).toBe(1);
    registry.register("chat", "openai", mockChatProvider("openai"));
    expect(registry.size).toBe(2);
  });
});

describe("Global singleton helpers", () => {
  beforeEach(() => {
    const r = getProviderRegistry();
    r.clear();
  });

  it("registerProvider and getProvider work via globals", () => {
    const provider = mockTokenCounter("default");
    registerProvider("token-counter", "default", provider);
    expect(getProvider("token-counter", "default")).toBe(provider);
  });

  it("listProviders returns correct entries", () => {
    registerProvider("embedding", "a", mockEmbeddingProvider("a"));
    registerProvider("reranker", "b", mockRerankerProvider("b"));
    const list = listProviders();
    expect(list).toHaveLength(2);
  });

  it("getProviderRegistry returns the same instance", () => {
    const a = getProviderRegistry();
    const b = getProviderRegistry();
    expect(a).toBe(b);
  });
});
