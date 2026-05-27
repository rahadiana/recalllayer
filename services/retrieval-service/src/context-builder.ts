import { createLogger, type Logger } from "@memory-platform/observability";
import { countTokens } from "@memory-platform/llm";
import { generateId } from "@memory-platform/shared-utils";
import type { ContextWindow, ContextChunk } from "@memory-platform/shared-schemas";
import type { Timestamp } from "@memory-platform/shared-schemas";
import type { ContextRequest, ContextPassageRequest } from "./types.js";

export interface ContextAssemblerConfig {
  defaultMaxTokens?: number;
  defaultModel?: string;
}

export interface ContextWindowResult {
  contextWindow: ContextWindow;
  truncatedCount: number;
}

export class ContextAssembler {
  private readonly logger: Logger;
  private readonly defaultMaxTokens: number;
  private readonly defaultModel: string;

  constructor(config: ContextAssemblerConfig = {}) {
    this.logger = createLogger("retrieval:context");
    this.defaultMaxTokens = config.defaultMaxTokens ?? 4096;
    this.defaultModel = config.defaultModel ?? "gpt-4o";
  }

  assemble(request: ContextRequest): ContextWindowResult {
    const startTime = Date.now();

    const maxTokens = request.max_tokens ?? this.defaultMaxTokens;
    const model = request.model ?? this.defaultModel;

    this.logger.debug("Assembling context window", {
      workspaceId: request.workspace_id,
      passagesCount: request.passages.length,
      maxTokens,
      model,
    });

    const usedTokens: ContextChunk[] = [];
    const excessPassages: ContextPassageRequest[] = [];
    let totalTokens = 0;

    const separator = "\n\n---\n\n";
    const separatorTokens = countTokens(separator, model);

    for (const passage of request.passages) {
      const sourceHeader = `[Source: ${passage.document_title} | Score: ${passage.score.toFixed(4)} | Chunk: ${passage.chunk_id}]\n`;
      const fullText = sourceHeader + passage.text;

      const passageTokens = countTokens(fullText, model);
      const additionalTokens = usedTokens.length > 0 ? separatorTokens + passageTokens : passageTokens;

      if (totalTokens + additionalTokens <= maxTokens) {
        usedTokens.push({
          chunk_id: passage.chunk_id,
          document_title: passage.document_title,
          text: passage.text,
          score: passage.score,
          position: usedTokens.length,
        });
        totalTokens += additionalTokens;
      } else {
        excessPassages.push(passage);
      }
    }

    const assembledText = usedTokens
      .map((c) => {
        const header = `[Source: ${c.document_title} | Score: ${c.score.toFixed(4)} | Chunk: ${c.chunk_id}]`;
        return header + "\n" + c.text;
      })
      .join(separator);

    const windowId = generateId("ctx_");
    const now = new Date().toISOString() as Timestamp;

    const contextWindow: ContextWindow = {
      id: windowId,
      query_id: request.query,
      workspace_id: request.workspace_id,
      chunks: usedTokens,
      assembled_text: assembledText,
      token_count: totalTokens,
      max_tokens: maxTokens,
      created_at: now,
    };

    const latencyMs = Date.now() - startTime;

    this.logger.info("Context window assembled", {
      workspaceId: request.workspace_id,
      chunksIncluded: usedTokens.length,
      totalTokens,
      truncatedCount: excessPassages.length,
      latencyMs,
    });

    return {
      contextWindow,
      truncatedCount: excessPassages.length,
    };
  }
}
