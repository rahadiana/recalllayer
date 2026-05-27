/**
 * Core type definitions for the LLM package.
 *
 * Provider-neutral interfaces for embedding, chat/completion, reranking,
 * and token counting across different LLM providers.
 */

// ─── Provider Configuration ────────────────────────────────────────────────────

export interface ProviderConfig {
  /** API key for the provider */
  apiKey?: string;
  /** Base URL override (e.g. for proxies or self-hosted models) */
  baseUrl?: string;
  /** Organization identifier (OpenAI) */
  organization?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum number of retries for transient failures */
  maxRetries?: number;
  /** Additional provider-specific options */
  [key: string]: unknown;
}

// ─── Chat / Completion ─────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "function" | "tool";
  content: string;
  /** Optional name of the author for function/tool messages */
  name?: string;
  /** Tool calls made by the assistant */
  tool_calls?: unknown[];
  /** Tool call ID this message responds to */
  tool_call_id?: string;
}

export interface ChatOptions {
  /** Model identifier (e.g. "gpt-4o", "claude-sonnet-4-20250514") */
  model?: string;
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum tokens in the completion */
  maxTokens?: number;
  /** Nucleus sampling parameter */
  topP?: number;
  /** Stop sequences */
  stop?: string[];
  /** Frequency penalty (-2 to 2) — OpenAI only */
  frequencyPenalty?: number;
  /** Presence penalty (-2 to 2) — OpenAI only */
  presencePenalty?: number;
  /** Stream mode flag */
  stream?: boolean;
  /** Tool/function definitions */
  tools?: unknown[];
  /** Tool choice strategy */
  toolChoice?: string | Record<string, unknown>;
  /** Additional provider-specific parameters */
  [key: string]: unknown;
}

// ─── Embedding ─────────────────────────────────────────────────────────────────

export interface EmbeddingOptions {
  /** Model identifier (e.g. "text-embedding-3-small") */
  model?: string;
  /** Desired embedding dimension (only for models that support it) */
  dimensions?: number;
  /** User identifier for abuse monitoring (OpenAI) */
  user?: string;
}

// ─── Reranker ──────────────────────────────────────────────────────────────────

export interface RerankerOptions {
  /** Model identifier */
  model?: string;
  /** Number of top results to return */
  topK?: number;
  /** Whether to include document text in the response */
  returnDocuments?: boolean;
}

export interface RerankerResult {
  /** Original index in the input documents array */
  index: number;
  /** The document text (if returnDocuments is true) */
  document?: string;
  /** Relevance score (higher = more relevant) */
  relevanceScore: number;
}

// ─── Generic Result ────────────────────────────────────────────────────────────

export interface TokenUsage {
  /** Tokens in the prompt/input */
  promptTokens: number;
  /** Tokens in the completion/output */
  completionTokens: number;
  /** Total tokens consumed */
  totalTokens: number;
}

export interface ModelResult<T> {
  /** The model output data */
  data: T;
  /** Token usage information */
  usage: TokenUsage;
  /** Model identifier used for this request */
  model: string;
  /** Provider name (e.g. "openai", "anthropic") */
  provider: string;
  /** End-to-end latency in milliseconds */
  latencyMs: number;
}
