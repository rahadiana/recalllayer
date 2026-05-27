// ─── Types ────────────────────────────────────────────────────────────────
export type {
  ProviderConfig,
  ChatMessage,
  ChatOptions,
  EmbeddingOptions,
  RerankerOptions,
  RerankerResult,
  TokenUsage,
  ModelResult,
} from "./types.js";

// ─── Embedding ─────────────────────────────────────────────────────────────
export {
  OpenAIEmbeddingProvider,
  setDefaultEmbeddingProvider,
  generateEmbedding,
  generateEmbeddings,
} from "./providers/embedding.js";
export type { EmbeddingProvider } from "./providers/embedding.js";

// ─── Chat ──────────────────────────────────────────────────────────────────
export {
  OpenAIChatProvider,
  AnthropicChatProvider,
  setDefaultChatProvider,
  generateChat,
  streamChat,
} from "./providers/chat.js";
export type { ChatProvider } from "./providers/chat.js";

// ─── Reranker ──────────────────────────────────────────────────────────────
export {
  SimpleReranker,
  setDefaultReranker,
  rerank,
} from "./providers/reranker.js";
export type { RerankerProvider } from "./providers/reranker.js";

// ─── Token Counter ─────────────────────────────────────────────────────────
export {
  tokenCounter,
  countTokens,
  estimateTokens,
  tokenLimit,
  safeTokenLimit,
} from "./token-counter.js";
export type { TokenCounter } from "./token-counter.js";

// ─── Provider Registry ─────────────────────────────────────────────────────
export {
  ProviderRegistry,
  getProviderRegistry,
  registerProvider,
  getProvider,
  listProviders,
} from "./provider-registry.js";
export type { ProviderType, AnyProvider, ProviderTypeMap } from "./provider-registry.js";

// ─── Rate Limiter ──────────────────────────────────────────────────────────
export {
  TokenBucket,
  withRateLimit,
} from "./rate-limiter.js";
export type { RateLimitConfig } from "./rate-limiter.js";
