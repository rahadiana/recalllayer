import { generateId } from "@memory-platform/shared-utils";
import { createLogger, type Logger } from "@memory-platform/observability";
import type { Chunk, ChunkingConfig, DocumentId, WorkspaceId, Metadata } from "./types.js";
import type { ChunkerOptions, ChunkMetadata } from "./types.js";
import { DEFAULT_CHUNKER_OPTIONS } from "./types.js";

export interface ChunkStrategy {
  readonly name: string;

  chunk(
    text: string,
    documentId: DocumentId,
    workspaceId: WorkspaceId,
    options: ChunkerOptions,
    baseMetadata?: Metadata,
  ): Chunk[];
}

export class FixedSizeChunker implements ChunkStrategy {
  readonly name = "fixed";

  private readonly logger: Logger;

  constructor() {
    this.logger = createLogger("indexing:chunker:fixed");
  }

  chunk(
    text: string,
    documentId: DocumentId,
    workspaceId: WorkspaceId,
    options: ChunkerOptions,
    baseMetadata: Metadata = {},
  ): Chunk[] {
    const opts = { ...DEFAULT_CHUNKER_OPTIONS, ...options };

    if (!text || text.trim().length === 0) {
      this.logger.debug("Empty text received — no chunks produced", { documentId });
      return [];
    }

    const splits = opts.preserveSentences
      ? this.splitBySeparators(text, opts)
      : this.splitFixedSize(text, opts.maxChunkSize);

    const chunks: Chunk[] = [];
    const now = new Date().toISOString();
    let seq = 0;

    const merged = this.mergeSplitsWithOverlap(splits, opts);
    for (const chunkText of merged) {
      const trimmed = chunkText.trim();
      if (trimmed.length === 0) continue;

      const metadata: ChunkMetadata = {
        ...baseMetadata,
        position: seq,
      };

      chunks.push({
        id: generateId("chunk_"),
        document_id: documentId,
        workspace_id: workspaceId,
        sequence_number: seq,
        text: trimmed,
        text_length: trimmed.length,
        metadata,
        created_at: now,
      });
      seq++;
    }

    this.logger.info("Chunking complete", {
      documentId,
      chunkCount: chunks.length,
      totalChars: text.length,
      strategy: opts.strategy,
    });

    return chunks;
  }

  toConfig(options: ChunkerOptions): ChunkingConfig {
    return {
      max_chunk_size: options.maxChunkSize,
      overlap_size: options.overlapSize,
      strategy: options.strategy,
      separators: options.separators,
    };
  }

  private splitBySeparators(text: string, options: ChunkerOptions): string[] {
    const { maxChunkSize, separators } = options;
    const result: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxChunkSize) {
        result.push(remaining);
        break;
      }

      let splitIndex = maxChunkSize;
      let found = false;

      for (const sep of separators) {
        if (!sep) {
          splitIndex = maxChunkSize;
          found = true;
          break;
        }

        const slice = remaining.slice(0, maxChunkSize);
        const lastSep = slice.lastIndexOf(sep);
        if (lastSep > maxChunkSize * 0.3) {
          splitIndex = lastSep + sep.length;
          found = true;
          break;
        }
      }

      if (!found) {
        splitIndex = maxChunkSize;
      }

      result.push(remaining.slice(0, splitIndex));
      remaining = remaining.slice(splitIndex);
    }

    return result;
  }

  private splitFixedSize(text: string, maxChunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxChunkSize) {
      chunks.push(text.slice(i, i + maxChunkSize));
    }
    return chunks;
  }

  private mergeSplitsWithOverlap(splits: string[], options: ChunkerOptions): string[] {
    if (splits.length <= 1 || options.overlapSize <= 0) {
      return splits;
    }

    const merged: string[] = [];
    merged.push(splits[0]);

    for (let i = 1; i < splits.length; i++) {
      const prev = merged[merged.length - 1];
      const overlap = prev.slice(-options.overlapSize);
      const current = overlap + splits[i];

      if (current.length <= options.maxChunkSize) {
        merged[merged.length - 1] = current;
      } else {
        merged.push(splits[i]);
      }
    }

    return merged;
  }
}

export function createChunker(strategy?: string): ChunkStrategy {
  const strategyName = strategy ?? "fixed";

  switch (strategyName) {
    case "fixed":
      return new FixedSizeChunker();
    default:
      throw new Error(`Unknown chunking strategy: ${strategyName}`);
  }
}

export const defaultChunker: ChunkStrategy = new FixedSizeChunker();
