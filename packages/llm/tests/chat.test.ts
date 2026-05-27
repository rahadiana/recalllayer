import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChatMessage, ModelResult } from "../src/types.js";

vi.mock("openai", () => {
  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  const OpenAI = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  }));
  OpenAI.APIError = APIError;
  return { default: OpenAI };
});

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
    APIError: class APIError extends Error {
      status: number;
      constructor(status: number, message: string) {
        super(message);
        this.status = status;
      }
    },
  };
});

vi.mock("@memory-platform/observability", () => {
  const mockLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };

  return {
    createLogger: vi.fn().mockReturnValue(mockLogger),
    recordMetric: vi.fn(),
    getCorrelationId: vi.fn().mockReturnValue(null),
  };
});

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  OpenAIChatProvider,
  AnthropicChatProvider,
  setDefaultChatProvider,
  generateChat,
  streamChat,
} from "../src/providers/chat.js";

const mockOpenAICreate = vi.fn();
const mockAnthropicCreate = vi.fn();
(OpenAI as unknown as vi.Mock).mockImplementation(() => ({
  chat: { completions: { create: mockOpenAICreate } },
}));
(Anthropic as unknown as vi.Mock).mockImplementation(() => ({
  messages: { create: mockAnthropicCreate },
}));

const messages: ChatMessage[] = [
  { role: "system", content: "You are helpful." },
  { role: "user", content: "Hello" },
];

describe("OpenAIChatProvider", () => {
  let provider: OpenAIChatProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIChatProvider({ apiKey: "test-key" });
  });

  it("generates a chat completion", async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Hi there!" } }],
      model: "gpt-4o",
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const result = await provider.generateChat(messages);

    expect(result.data).toBe("Hi there!");
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o");
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
  });

  it("passes options to the API", async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: "ok" } }],
      model: "gpt-4o",
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    await provider.generateChat(messages, {
      temperature: 0.5,
      maxTokens: 100,
      topP: 0.9,
    });

    expect(mockOpenAICreate).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.5,
        max_tokens: 100,
        top_p: 0.9,
      }),
    );
  });

  it("streams chat chunks", async () => {
    mockOpenAICreate.mockResolvedValueOnce(
      (async function* () {
        yield { choices: [{ delta: { content: "Hello" } }] };
        yield { choices: [{ delta: { content: " world" } }] };
        yield { choices: [{ delta: { content: "!" } }] };
      })(),
    );

    const chunks: string[] = [];
    for await (const chunk of provider.streamChat(messages)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello", " world", "!"]);
  });

  it("retries on 429 errors", async () => {
    const rateLimitError = new OpenAI.APIError(429, "rate limit");
    mockOpenAICreate
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({
        choices: [{ message: { content: "retried" } }],
        model: "gpt-4o",
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

    const result = await provider.generateChat(messages);
    expect(result.data).toBe("retried");
    expect(mockOpenAICreate).toHaveBeenCalledTimes(2);
  }, 10000);
});

describe("AnthropicChatProvider", () => {
  let provider: AnthropicChatProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AnthropicChatProvider({ apiKey: "test-key" });
  });

  it("generates a chat completion", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Hello from Claude" }],
      model: "claude-sonnet-4-20250514",
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await provider.generateChat(messages);

    expect(result.data).toBe("Hello from Claude");
    expect(result.provider).toBe("anthropic");
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
  });

  it("handles system messages correctly", async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }],
      model: "claude-sonnet-4-20250514",
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const msgs: ChatMessage[] = [
      { role: "system", content: "System prompt" },
      { role: "user", content: "User message" },
    ];

    await provider.generateChat(msgs);

    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "System prompt",
        messages: [{ role: "user", content: "User message" }],
      }),
    );
  });

  it("streams chat chunks", async () => {
    mockAnthropicCreate.mockResolvedValueOnce(
      (async function* () {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "a" } };
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "b" } };
      })(),
    );

    const chunks: string[] = [];
    for await (const chunk of provider.streamChat(messages)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["a", "b"]);
  });
});

describe("convenience functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generateChat uses default provider", async () => {
    const mockProvider = {
      name: "mock",
      generateChat: vi.fn().mockResolvedValue({
        data: "mock response",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        model: "mock",
        provider: "mock",
        latencyMs: 0,
      }),
      streamChat: vi.fn(),
    };

    setDefaultChatProvider(mockProvider);

    const result = await generateChat(messages);
    expect(result.data).toBe("mock response");
  });

  it("streamChat uses default provider", async () => {
    const mockProvider = {
      name: "mock",
      generateChat: vi.fn(),
      streamChat: vi.fn().mockImplementation(async function* () {
        yield "a";
        yield "b";
      }),
    };

    setDefaultChatProvider(mockProvider);

    const chunks: string[] = [];
    for await (const chunk of streamChat(messages)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(["a", "b"]);
  });
});
