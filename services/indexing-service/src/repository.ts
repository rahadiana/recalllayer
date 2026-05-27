import { createLogger, recordMetric, type Logger } from "@memory-platform/observability";
import type { PostgresPool } from "@memory-platform/db";
import type { Chunk, EmbeddingRecord, IndexRecord, DocumentId, WorkspaceId } from "./types.js";

interface ChunkRow {
  id: string;
  document_id: string;
  workspace_id: string;
  sequence_number: number;
  text: string;
  text_length: number;
  metadata: string;
  created_at: string;
}

interface EmbeddingRow {
  id: string;
  target_id: string;
  target_type: string;
  dimensions: number;
  model: string;
  workspace_id: string;
  created_at: string;
}

interface KeywordIndexRow {
  id: string;
  chunk_id: string;
  document_id: string;
  workspace_id: string;
  field: string;
  tokens: string[];
  boost: number;
  created_at: string;
  search_vector: string;
}

export class IndexRepository {
  private readonly logger: Logger;
  private readonly postgres: PostgresPool | null;

  constructor(postgres: PostgresPool | null) {
    this.postgres = postgres;
    this.logger = createLogger("indexing:repository");
  }

  async saveChunks(chunks: Chunk[]): Promise<number> {
    if (!this.postgres || chunks.length === 0) return 0;

    try {
      const rows: ChunkRow[] = chunks.map((c) => ({
        id: c.id,
        document_id: c.document_id,
        workspace_id: c.workspace_id,
        sequence_number: c.sequence_number,
        text: c.text,
        text_length: c.text_length,
        metadata: JSON.stringify(c.metadata),
        created_at: c.created_at,
      }));

      await this.postgres.sql`
        INSERT INTO chunks ${this.postgres.sql(rows as any, "id", "document_id", "workspace_id", "sequence_number", "text", "text_length", "metadata", "created_at")}
        ON CONFLICT (id) DO UPDATE SET
          text = EXCLUDED.text,
          text_length = EXCLUDED.text_length,
          metadata = EXCLUDED.metadata
      `;

      this.logger.debug("Chunks saved to repository", { count: rows.length });
      recordMetric("indexing.repository.chunks_saved", rows.length);

      return rows.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to save chunks", { error: message });
      throw error;
    }
  }

  async saveEmbeddings(embeddings: EmbeddingRecord[]): Promise<number> {
    if (!this.postgres || embeddings.length === 0) return 0;

    try {
      const rows: EmbeddingRow[] = embeddings.map((e) => ({
        id: e.id,
        target_id: e.target_id,
        target_type: e.target_type,
        dimensions: e.dimensions,
        model: e.model,
        workspace_id: e.workspace_id,
        created_at: e.created_at,
      }));

      await this.postgres.sql`
        INSERT INTO embeddings ${this.postgres.sql(rows as any, "id", "target_id", "target_type", "dimensions", "model", "workspace_id", "created_at")}
        ON CONFLICT (id) DO UPDATE SET
          dimensions = EXCLUDED.dimensions,
          model = EXCLUDED.model
      `;

      this.logger.debug("Embedding records saved to repository", { count: rows.length });
      recordMetric("indexing.repository.embeddings_saved", rows.length);

      return rows.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to save embeddings", { error: message });
      throw error;
    }
  }

  async saveKeywordIndexes(records: IndexRecord[]): Promise<number> {
    if (!this.postgres || records.length === 0) return 0;

    try {
      const rows: KeywordIndexRow[] = records.map((r) => ({
        id: r.id,
        chunk_id: r.chunk_id,
        document_id: r.document_id,
        workspace_id: r.workspace_id,
        field: r.field,
        tokens: r.tokens,
        boost: r.boost ?? 1.0,
        created_at: r.created_at,
        search_vector: r.tokens.join(" "),
      }));

      await this.postgres.sql`
        INSERT INTO keyword_index_records ${this.postgres.sql(rows as any, "id", "chunk_id", "document_id", "workspace_id", "field", "tokens", "boost", "created_at", "search_vector")}
        ON CONFLICT (id) DO UPDATE SET
          tokens = EXCLUDED.tokens,
          search_vector = EXCLUDED.search_vector,
          boost = EXCLUDED.boost
      `;

      this.logger.debug("Keyword index records saved", { count: rows.length });
      recordMetric("indexing.repository.keyword_records_saved", rows.length);

      return rows.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to save keyword index records", { error: message });
      throw error;
    }
  }

  async updateDocumentStatus(
    documentId: DocumentId,
    status: string,
    chunkCount?: number,
  ): Promise<void> {
    if (!this.postgres) return;

    try {
      await this.postgres.sql`
        UPDATE documents
        SET
          status = ${status},
          chunk_count = COALESCE(${chunkCount ?? null}, chunk_count),
          updated_at = ${new Date().toISOString()}
        WHERE id = ${documentId}
      `;

      this.logger.debug("Document status updated", {
        documentId,
        status,
        chunkCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to update document status", {
        documentId,
        error: message,
      });
      throw error;
    }
  }

  async getChunksByDocument(documentId: DocumentId): Promise<Chunk[]> {
    if (!this.postgres) return [];

    try {
      const rows = await this.postgres.sql<ChunkRow[]>`
        SELECT * FROM chunks WHERE document_id = ${documentId} ORDER BY sequence_number ASC
      `;

      return rows.map((row: ChunkRow) => {
        let metadata: Record<string, unknown> = {};
        try {
          metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>);
        } catch { /* ignore parse errors */ }

        return {
          id: row.id,
          document_id: row.document_id as DocumentId,
          workspace_id: row.workspace_id as WorkspaceId,
          sequence_number: row.sequence_number,
          text: row.text,
          text_length: row.text_length,
          metadata,
          created_at: row.created_at,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to get chunks by document", {
        documentId,
        error: message,
      });
      return [];
    }
  }

  async deleteDocumentChunks(documentId: DocumentId): Promise<void> {
    if (!this.postgres) return;

    try {
      await this.postgres.sql`
        DELETE FROM keyword_index_records WHERE document_id = ${documentId}
      `;
      await this.postgres.sql`
        DELETE FROM embeddings WHERE target_id IN (
          SELECT id FROM chunks WHERE document_id = ${documentId}
        )
      `;
      await this.postgres.sql`
        DELETE FROM chunks WHERE document_id = ${documentId}
      `;

      this.logger.info("Document chunks deleted", { documentId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to delete document chunks", {
        documentId,
        error: message,
      });
      throw error;
    }
  }
}

export function createIndexRepository(postgres: PostgresPool | null): IndexRepository {
  return new IndexRepository(postgres);
}
