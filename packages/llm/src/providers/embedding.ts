/**
 * Embedding Provider
 *
 * Provider-neutral embedding interface with an OpenAI implementation.
 * Produces vector representations of text.
 */

import OpenAI from "openai";
import { retry, type RetryConfig } from "@memory-platform/shared-utils";
import { createLogger, recordMetric, type Logger } from "@memory-platform/observability";
import type {
  ProviderConfig,
  EmbeddingOptions,
  ModelResult,
  TokenUsage,
} from "../types.js";

// ─── Embedding Provider Interface ──────────────────────────────────────────────

export interface EmbeddingProvider {
  /** Human-readable provider name */
  readonly name: string;

  /**
   * Generate an embedding vector for a single text input.
   *
   * @param text    - The input text to embed
   * @param options - Model selection and dimension overrides
   * @returns A ModelResult containing the embedding vector
   */
  generateEmbedding(
    text: string,
    options?: EmbeddingOptions,
  ): Promise<ModelResult<number[]>>;

  /**
   * Generate embedding vectors for a batch of text inputs.
   *
   * @param texts   - Array of input texts to embed
   * @param options - Model selection and dimension overrides
   * @returns A ModelResult containing an array of embedding vectors
   */
  generateEmbeddings(
    texts: string[],
    options?: EmbeddingOptions,
  ): Promise<ModelResult<number[][]>>;
}

// ─── OpenAI Embedding Provider ─────────────────────────────────────────────────

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitterFactor: 0.1,
  strategy: "exponential",
};

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";

  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly retryConfig: RetryConfig;
  private readonly logger: Logger;

  constructor(
    config: ProviderConfig = {},
    retryConfig: RetryConfig = {},
  ) {
    this.client = new OpenAI({
      apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
      baseURL: config.baseUrl,
      organization: config.organization,
      timeout: config.timeout,
      maxRetries: 0, // We handle retries ourselves
    });
    this.defaultModel = (config.model as string) ?? DEFAULT_EMBEDDING_MODEL;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    this.logger = createLogger("llm:embedding:openai");
  }

  async generateEmbedding(
    text: string,
    options: EmbeddingOptions = {},
  ): Promise<ModelResult<number[]>> {
    const startTime = Date.now();
    const model = options.model ?? this.defaultModel;

    this.logger.debug("Generating embedding", { model, textLength: text.length });

    const response = await retry(
      async () => {
        return this.client.embeddings.create({
          model,
          input: text,
          dimensions: options.dimensions,
          user: options.user,
        });
      },
      this.retryConfig,
    );

    const latencyMs = Date.now() - startTime;

    recordMetric("llm.embedding.requests", 1, {
      provider: "openai",
      model,
    });
    recordMetric("llm.embedding.latency_ms", latencyMs, {
      provider: "openai",
      model,
    }, "histogram");

    const usage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    return {
      data: response.data[0].embedding,
      usage,
      model: response.model,
      provider: this.name,
      latencyMs,
    };
  }

  async generateEmbeddings(
    texts: string[],
    options: EmbeddingOptions = {},
  ): Promise<ModelResult<number[][]>> {
    const startTime = Date.now();
    const model = options.model ?? this.defaultModel;

    this.logger.debug("Generating batch embeddings", {
      model,
      batchSize: texts.length,
    });

    const response = await retry(
      async () => {
        return this.client.embeddings.create({
          model,
          input: texts,
          dimensions: options.dimensions,
          user: options.user,
        });
      },
      this.retryConfig,
    );

    const latencyMs = Date.now() - startTime;

    recordMetric("llm.embedding.requests", texts.length, {
      provider: "openai",
      model,
    });
    recordMetric("llm.embedding.latency_ms", latencyMs, {
      provider: "openai",
      model,
    }, "histogram");

    const usage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    return {
      data: response.data.map((d: OpenAI.Embeddings.Embedding) => d.embedding),
      usage,
      model: response.model,
      provider: this.name,
      latencyMs,
    };
  }
}

// ─── Convenience Functions ─────────────────────────────────────────────────────

let _defaultEmbeddingProvider: EmbeddingProvider | null = null;

/**
 * Set the default embedding provider used by the convenience functions.
 * Call once during application bootstrap.
 */
export function setDefaultEmbeddingProvider(
  provider: EmbeddingProvider,
): void {
  _defaultEmbeddingProvider = provider;
}

function getDefaultEmbeddingProvider(): EmbeddingProvider {
  if (!_defaultEmbeddingProvider) {
    _defaultEmbeddingProvider = new OpenAIEmbeddingProvider();
  }
  return _defaultEmbeddingProvider;
}

/**
 * Generate an embedding vector for a single text using the default provider.
 *
 * @param text    - The input text to embed
 * @param options - Model selection and dimension overrides
 * @returns A ModelResult containing the embedding vector
 */
export async function generateEmbedding(
  text: string,
  options?: EmbeddingOptions,
): Promise<ModelResult<number[]>> {
  return getDefaultEmbeddingProvider().generateEmbedding(text, options);
}

/**
 * Generate embedding vectors for a batch of texts using the default provider.
 *
 * @param texts   - Array of input texts to embed
 * @param options - Model selection and dimension overrides
 * @returns A ModelResult containing an array of embedding vectors
 */
export async function generateEmbeddings(
  texts: string[],
  options?: EmbeddingOptions,
): Promise<ModelResult<number[][]>> {
  return getDefaultEmbeddingProvider().generateEmbeddings(texts, options);
}
