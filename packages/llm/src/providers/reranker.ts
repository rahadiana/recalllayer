/**
 * Reranker Provider
 *
 * Provider-neutral reranking interface with a cross-encoder style implementation
 * that scores document relevance against a query. Designed to be swappable
 * with Cohere, Voyage, or self-hosted rerankers.
 */

import { createLogger, recordMetric, type Logger } from "@memory-platform/observability";
import type {
  ProviderConfig,
  RerankerOptions,
  RerankerResult,
  ModelResult,
  TokenUsage,
} from "../types.js";

// ─── Reranker Provider Interface ───────────────────────────────────────────────

export interface RerankerProvider {
  /** Human-readable provider name */
  readonly name: string;

  /**
   * Rerank a list of documents by relevance to a query.
   *
   * Returns documents sorted by relevance score (descending), limited to `topK`.
   *
   * @param query     - The search query
   * @param documents - Candidate documents to rerank
   * @param options   - Model selection, topK, returnDocuments
   * @returns A ModelResult containing the reranked results
   */
  rerank(
    query: string,
    documents: string[],
    options?: RerankerOptions,
  ): Promise<ModelResult<RerankerResult[]>>;
}

// ─── Simple Reranker (Cross-Encoder Style) ─────────────────────────────────────

/**
 * A simple cross-encoder style reranker.
 *
 * This implementation uses a scoring heuristic based on token overlap (Jaccard-like)
 * with TF-IDF weighting. It is intended as a lightweight default that can be
 * replaced with a proper model-backed reranker (Cohere, cross-encoder, etc.).
 *
 * For production, swap in a provider that calls an actual reranking API.
 */
export class SimpleReranker implements RerankerProvider {
  readonly name = "simple";

  private readonly defaultTopK: number;
  private readonly logger: Logger;

  constructor(config: ProviderConfig = {}) {
    this.defaultTopK = (config.topK as number) ?? 10;
    this.logger = createLogger("llm:reranker:simple");
  }

  async rerank(
    query: string,
    documents: string[],
    options: RerankerOptions = {},
  ): Promise<ModelResult<RerankerResult[]>> {
    const startTime = Date.now();
    const topK = options.topK ?? this.defaultTopK;
    const returnDocuments = options.returnDocuments ?? true;

    this.logger.debug("Reranking documents", {
      queryLength: query.length,
      documentCount: documents.length,
      topK,
    });

    // Tokenize query for TF-IDF scoring
    const queryTokens = tokenize(query);
    const queryTf = termFrequency(queryTokens);
    const queryVector = new Map<string, number>();
    for (const [term, freq] of Object.entries(queryTf)) {
      queryVector.set(term, freq);
    }

    // Score each document
    const scored: RerankerResult[] = documents.map((doc, index) => {
      const docTokens = tokenize(doc);
      const docTf = termFrequency(docTokens);
      const score = cosineSimilarity(queryVector, docTf);

      return {
        index,
        document: returnDocuments ? doc : undefined,
        relevanceScore: score,
      };
    });

    // Sort by relevance descending and limit to topK
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topResults = scored.slice(0, Math.min(topK, scored.length));

    const latencyMs = Date.now() - startTime;

    recordMetric("llm.reranker.requests", 1, {
      provider: "simple",
    });
    recordMetric("llm.reranker.latency_ms", latencyMs, {
      provider: "simple",
    }, "histogram");

    const usage: TokenUsage = {
      promptTokens: query.length + documents.reduce((sum, d) => sum + d.length, 0),
      completionTokens: 0,
      totalTokens: query.length + documents.reduce((sum, d) => sum + d.length, 0),
    };

    return {
      data: topResults,
      usage,
      model: "simple-tfidf",
      provider: this.name,
      latencyMs,
    };
  }
}

// ─── Scoring Helpers ───────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function termFrequency(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const token of tokens) {
    tf[token] = (tf[token] ?? 0) + 1;
  }
  // Normalize by document length
  const norm = tokens.length || 1;
  for (const key of Object.keys(tf)) {
    tf[key] /= norm;
  }
  return tf;
}

function cosineSimilarity(
  queryVec: Map<string, number>,
  docTf: Record<string, number>,
): number {
  let dotProduct = 0;
  let queryMag = 0;
  let docMag = 0;

  for (const [term, qWeight] of queryVec) {
    queryMag += qWeight * qWeight;
    const dWeight = docTf[term] ?? 0;
    dotProduct += qWeight * dWeight;
  }

  for (const weight of Object.values(docTf)) {
    docMag += weight * weight;
  }

  if (queryMag === 0 || docMag === 0) return 0;
  return dotProduct / (Math.sqrt(queryMag) * Math.sqrt(docMag));
}

// ─── Convenience Functions ─────────────────────────────────────────────────────

let _defaultReranker: RerankerProvider | null = null;

/**
 * Set the default reranker provider used by the convenience function.
 * Call once during application bootstrap.
 */
export function setDefaultReranker(provider: RerankerProvider): void {
  _defaultReranker = provider;
}

function getDefaultReranker(): RerankerProvider {
  if (!_defaultReranker) {
    _defaultReranker = new SimpleReranker();
  }
  return _defaultReranker;
}

/**
 * Rerank documents by relevance to a query using the default provider.
 *
 * @param query     - The search query
 * @param documents - Candidate documents to rerank
 * @param topK      - Number of top results to return (overrides options.topK)
 * @param options   - Additional reranker options
 * @returns A ModelResult containing the reranked results
 */
export async function rerank(
  query: string,
  documents: string[],
  topK?: number,
  options?: RerankerOptions,
): Promise<ModelResult<RerankerResult[]>> {
  const mergedOptions: RerankerOptions = {
    ...options,
    topK: topK ?? options?.topK,
  };
  return getDefaultReranker().rerank(query, documents, mergedOptions);
}
