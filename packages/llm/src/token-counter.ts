/**
 * Token Counter
 *
 * tiktoken-style token counting utilities for estimating and counting tokens
 * across different models. Uses character-based heuristics with model-specific
 * calibration factors when a proper tokenizer is not available.
 */

// ─── Token Counter Interface ───────────────────────────────────────────────────

export interface TokenCounter {
  /**
   * Count the approximate number of tokens in a text string for a given model.
   *
   * Uses model-specific heuristics based on character-to-token ratios.
   *
   * @param text  - The input text
   * @param model - Model identifier (e.g. "gpt-4o", "claude-sonnet-4-20250514")
   * @returns Approximate token count
   */
  countTokens(text: string, model?: string): number;

  /**
   * Quick token estimate using a simple character-based heuristic (chars / 4).
   * Useful when a rough estimate is sufficient.
   *
   * @param text - The input text
   * @returns Approximate token count
   */
  estimateTokens(text: string): number;

  /**
   * Get the maximum token limit (context window) for a known model.
   *
   * @param model - Model identifier
   * @returns The token limit, or a safe default if the model is unknown
   */
  tokenLimit(model: string): number;
}

// ─── Model-Specific Character-Per-Token Ratios ─────────────────────────────────

/**
 * Average characters per token for common models.
 * Based on empirical measurements — English text averages ~4 chars/token,
 * but varies by model and tokenizer.
 */
const MODEL_CHAR_PER_TOKEN: Record<string, number> = {
  // OpenAI
  "gpt-4": 3.7,
  "gpt-4-turbo": 3.7,
  "gpt-4o": 3.7,
  "gpt-4o-mini": 3.7,
  "gpt-3.5-turbo": 3.8,
  "text-embedding-3-small": 4.0,
  "text-embedding-3-large": 4.0,
  "text-embedding-ada-002": 4.0,
  // Anthropic
  "claude-3-opus-20240229": 3.9,
  "claude-3-sonnet-20240229": 3.9,
  "claude-3-haiku-20240307": 3.9,
  "claude-sonnet-4-20250514": 3.9,
  "claude-opus-4-20250514": 3.9,
};

const DEFAULT_CHAR_PER_TOKEN = 4.0;

// ─── Context Window Limits ─────────────────────────────────────────────────────

/**
 * Maximum token limits (context windows) for known models.
 */
const MODEL_TOKEN_LIMITS: Record<string, number> = {
  // OpenAI
  "gpt-4": 8192,
  "gpt-4-32k": 32768,
  "gpt-4-turbo": 128000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-3.5-turbo": 16385,
  "gpt-3.5-turbo-16k": 16385,
  "text-embedding-3-small": 8191,
  "text-embedding-3-large": 8191,
  "text-embedding-ada-002": 8191,
  // Anthropic
  "claude-3-opus-20240229": 200000,
  "claude-3-sonnet-20240229": 200000,
  "claude-3-haiku-20240307": 200000,
  "claude-sonnet-4-20250514": 200000,
  "claude-opus-4-20250514": 200000,
};

const DEFAULT_TOKEN_LIMIT = 8192;
const SAFE_TOKEN_LIMIT = 4096;

// ─── Token Counter Implementation ──────────────────────────────────────────────

/**
 * Default token counter using character-based heuristics.
 *
 * For production use with precise token counts, replace with a tiktoken-based
 * counter (e.g. `js-tiktoken` or `@anthropic-ai/tokenizer`).
 */
export const tokenCounter: TokenCounter = {
  countTokens(text: string, model?: string): number {
    if (!text) return 0;

    const charPerToken = model
      ? MODEL_CHAR_PER_TOKEN[model] ?? DEFAULT_CHAR_PER_TOKEN
      : DEFAULT_CHAR_PER_TOKEN;

    return Math.ceil(text.length / charPerToken);
  },

  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / DEFAULT_CHAR_PER_TOKEN);
  },

  tokenLimit(model: string): number {
    return MODEL_TOKEN_LIMITS[model] ?? DEFAULT_TOKEN_LIMIT;
  },
};

// ─── Convenience Functions ─────────────────────────────────────────────────────

/**
 * Count the approximate number of tokens in a text string for a given model.
 *
 * @param text  - The input text
 * @param model - Model identifier (optional, uses default ratio if omitted)
 * @returns Approximate token count
 */
export function countTokens(text: string, model?: string): number {
  return tokenCounter.countTokens(text, model);
}

/**
 * Quick token estimate using a simple character-based heuristic (chars / 4).
 *
 * @param text - The input text
 * @returns Approximate token count
 */
export function estimateTokens(text: string): number {
  return tokenCounter.estimateTokens(text);
}

/**
 * Get the maximum token limit (context window) for a known model.
 *
 * @param model - Model identifier
 * @returns The token limit, or a safe default if the model is unknown
 */
export function tokenLimit(model: string): number {
  return tokenCounter.tokenLimit(model);
}

/**
 * Get a safe conservative token limit for use when the model is unknown.
 */
export function safeTokenLimit(): number {
  return SAFE_TOKEN_LIMIT;
}
