/**
 * Chat Provider
 *
 * Provider-neutral chat/completion interface with OpenAI and Anthropic implementations.
 * Supports both synchronous generate and async streaming.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { retry, type RetryConfig } from "@memory-platform/shared-utils";
import { createLogger, recordMetric, type Logger } from "@memory-platform/observability";
import type {
  ProviderConfig,
  ChatMessage,
  ChatOptions,
  ModelResult,
  TokenUsage,
} from "../types.js";

// ─── Chat Provider Interface ───────────────────────────────────────────────────

export interface ChatProvider {
  /** Human-readable provider name */
  readonly name: string;

  /**
   * Generate a chat completion for a list of messages.
   *
   * @param messages - The conversation messages (system, user, assistant)
   * @param options  - Model selection, temperature, max tokens, etc.
   * @returns A ModelResult containing the assistant's response text
   */
  generateChat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ModelResult<string>>;

  /**
   * Stream a chat completion, yielding content chunks as they arrive.
   *
   * @param messages - The conversation messages
   * @param options  - Model selection, temperature, max tokens, etc.
   * @returns An async iterable of content string chunks
   */
  streamChat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncIterable<string>;
}

// ─── Helper: Map Provider-Agnostic Messages to OpenAI Format ───────────────────

function toOpenAIMessages(
  messages: ChatMessage[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((msg) => {
    const base = {
      role: msg.role as OpenAI.Chat.ChatCompletionMessageParam["role"],
      content: msg.content,
    };

    if (msg.name) {
      (base as Record<string, unknown>).name = msg.name;
    }
    if (msg.tool_calls) {
      (base as Record<string, unknown>).tool_calls = msg.tool_calls;
    }
    if (msg.tool_call_id) {
      (base as Record<string, unknown>).tool_call_id = msg.tool_call_id;
    }

    return base as OpenAI.Chat.ChatCompletionMessageParam;
  });
}

// ─── OpenAI Chat Provider ──────────────────────────────────────────────────────

const DEFAULT_CHAT_MODEL_OPENAI = "gpt-4o";
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitterFactor: 0.1,
  strategy: "exponential",
};

/** Retryable error check: retry on rate-limit and server errors */
function isRetryableError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    const e = error;
    return e.status === 429 || e.status === 500 || e.status === 502 || e.status === 503;
  }
  return false;
}

export class OpenAIChatProvider implements ChatProvider {
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
      maxRetries: 0,
    });
    this.defaultModel = (config.model as string) ?? DEFAULT_CHAT_MODEL_OPENAI;
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...retryConfig,
      shouldRetry: (error: unknown) => isRetryableError(error),
    };
    this.logger = createLogger("llm:chat:openai");
  }

  async generateChat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<ModelResult<string>> {
    const startTime = Date.now();
    const model = options.model ?? this.defaultModel;

    this.logger.debug("Generating chat completion", {
      model,
      messageCount: messages.length,
    });

    const response = await retry(
      async () => {
        return this.client.chat.completions.create({
          model,
          messages: toOpenAIMessages(messages),
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          top_p: options.topP,
          stop: options.stop,
          frequency_penalty: options.frequencyPenalty,
          presence_penalty: options.presencePenalty,
          tools: options.tools as OpenAI.Chat.ChatCompletionTool[],
          tool_choice: options.toolChoice as OpenAI.Chat.ChatCompletionToolChoiceOption,
        });
      },
      this.retryConfig,
    );

    const latencyMs = Date.now() - startTime;

    recordMetric("llm.chat.requests", 1, {
      provider: "openai",
      model,
    });
    recordMetric("llm.chat.latency_ms", latencyMs, {
      provider: "openai",
      model,
    }, "histogram");

    const choice = response.choices[0];
    const usage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    return {
      data: choice.message.content ?? "",
      usage,
      model: response.model,
      provider: this.name,
      latencyMs,
    };
  }

  async *streamChat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<string> {
    const model = options.model ?? this.defaultModel;

    this.logger.debug("Streaming chat completion", {
      model,
      messageCount: messages.length,
    });

    const stream = await this.client.chat.completions.create({
      model,
      messages: toOpenAIMessages(messages),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      stop: options.stop,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}

// ─── Anthropic Chat Provider ───────────────────────────────────────────────────

const DEFAULT_CHAT_MODEL_ANTHROPIC = "claude-sonnet-4-20250514";

function toAnthropicMessages(
  messages: ChatMessage[],
): { system?: string; messages: Anthropic.MessageParam[] } {
  let systemPrompt: string | undefined;
  const anthropicMessages: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // Anthropic uses a top-level system parameter, but multiple system messages
      // can also be interleaved; we collect the last one as the canonical system prompt
      systemPrompt = msg.content;
    } else if (msg.role === "user") {
      anthropicMessages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      anthropicMessages.push({ role: "assistant", content: msg.content });
    }
    // function/tool messages are not directly supported by Anthropic in the basic interface;
    // they would need tool_use blocks — omitted for the basic chat layer
  }

  return { system: systemPrompt, messages: anthropicMessages };
}

/** Check if an Anthropic error is retryable */
function isAnthropicRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    const e = error;
    return e.status === 429 || e.status === 500 || e.status === 502 || e.status === 503 || e.status === 529;
  }
  return false;
}

export class AnthropicChatProvider implements ChatProvider {
  readonly name = "anthropic";

  private readonly client: Anthropic;
  private readonly defaultModel: string;
  private readonly retryConfig: RetryConfig;
  private readonly logger: Logger;

  constructor(
    config: ProviderConfig = {},
    retryConfig: RetryConfig = {},
  ) {
    this.client = new Anthropic({
      apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY,
      baseURL: config.baseUrl,
      timeout: config.timeout,
      maxRetries: 0,
    });
    this.defaultModel = (config.model as string) ?? DEFAULT_CHAT_MODEL_ANTHROPIC;
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...retryConfig,
      shouldRetry: (error: unknown) => isAnthropicRetryable(error),
    };
    this.logger = createLogger("llm:chat:anthropic");
  }

  async generateChat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<ModelResult<string>> {
    const startTime = Date.now();
    const model = options.model ?? this.defaultModel;
    const { system, messages: antMessages } = toAnthropicMessages(messages);

    this.logger.debug("Generating chat completion (Anthropic)", {
      model,
      messageCount: antMessages.length,
    });

    const response = await retry(
      async () => {
        return this.client.messages.create({
          model,
          system: system,
          messages: antMessages,
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature,
          top_p: options.topP,
          stop_sequences: options.stop,
        });
      },
      this.retryConfig,
    );

    const latencyMs = Date.now() - startTime;

    recordMetric("llm.chat.requests", 1, {
      provider: "anthropic",
      model,
    });
    recordMetric("llm.chat.latency_ms", latencyMs, {
      provider: "anthropic",
      model,
    }, "histogram");

    const usage: TokenUsage = {
      promptTokens: response.usage?.input_tokens ?? 0,
      completionTokens: response.usage?.output_tokens ?? 0,
      totalTokens:
        (response.usage?.input_tokens ?? 0) +
        (response.usage?.output_tokens ?? 0),
    };

    // Extract the first text block content
    const textBlocks = response.content.filter(
      (block: Anthropic.ContentBlock): block is Anthropic.TextBlock => block.type === "text",
    );
    const data = textBlocks.map((b: Anthropic.TextBlock) => b.text).join("");

    return {
      data,
      usage,
      model: response.model,
      provider: this.name,
      latencyMs,
    };
  }

  async *streamChat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<string> {
    const model = options.model ?? this.defaultModel;
    const { system, messages: antMessages } = toAnthropicMessages(messages);

    this.logger.debug("Streaming chat completion (Anthropic)", {
      model,
      messageCount: antMessages.length,
    });

    const stream = await this.client.messages.create({
      model,
      system: system,
      messages: antMessages,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
      top_p: options.topP,
      stop_sequences: options.stop,
      stream: true,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }
}

// ─── Convenience Functions ─────────────────────────────────────────────────────

let _defaultChatProvider: ChatProvider | null = null;

/**
 * Set the default chat provider used by the convenience functions.
 * Call once during application bootstrap.
 */
export function setDefaultChatProvider(provider: ChatProvider): void {
  _defaultChatProvider = provider;
}

function getDefaultChatProvider(): ChatProvider {
  if (!_defaultChatProvider) {
    _defaultChatProvider = new OpenAIChatProvider();
  }
  return _defaultChatProvider;
}

/**
 * Generate a chat completion using the default provider.
 *
 * @param messages - The conversation messages
 * @param options  - Model selection, temperature, max tokens, etc.
 * @returns A ModelResult containing the assistant's response text
 */
export async function generateChat(
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<ModelResult<string>> {
  return getDefaultChatProvider().generateChat(messages, options);
}

/**
 * Stream a chat completion using the default provider.
 *
 * @param messages - The conversation messages
 * @param options  - Model selection, temperature, max tokens, etc.
 * @returns An async iterable of content string chunks
 */
export async function* streamChat(
  messages: ChatMessage[],
  options?: ChatOptions,
): AsyncIterable<string> {
  yield* getDefaultChatProvider().streamChat(messages, options);
}
