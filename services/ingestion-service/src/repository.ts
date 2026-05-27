import type { PostgresPool } from "@memory-platform/db";
import type {
  DocumentId,
  DocumentStatus,
  WorkspaceId,
  CreateDocumentDto,
} from "@memory-platform/shared-schemas";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { DocumentRecord, ListDocumentsQuery } from "./types.js";

export interface CreateDocumentParams {
  workspaceId: WorkspaceId;
  dto: CreateDocumentDto;
  createdBy: string;
}

export interface ListDocumentsResult {
  items: DocumentRecord[];
  nextCursor: string | null;
}

export class DocumentRepository {
  #pool: PostgresPool;
  #log: Logger;

  constructor(pool: PostgresPool) {
    this.#pool = pool;
    this.#log = createLogger("ingestion:repository");
  }

  async createDocument(params: CreateDocumentParams): Promise<DocumentRecord> {
    const id = `doc_${generateId()}` as DocumentId;
    const now = new Date().toISOString();

    const source = params.dto.source;
    const metadata = params.dto.metadata ?? {};
    const tags = params.dto.tags ?? [];

    const [row] = await this.#pool.sql<[Record<string, unknown>]>`
      INSERT INTO documents (
        id, workspace_id, title, description, status, source_type,
        source_connector, source_location, source_filename, source_mime_type,
        source_size_bytes, metadata, tags, created_by, created_at, updated_at
      ) VALUES (
        ${id}, ${params.workspaceId}, ${params.dto.title}, ${params.dto.description ?? null},
        ${"pending"}, ${source.type}, ${source.connector ?? null},
        ${source.location ?? null}, ${source.filename ?? null},
        ${source.mime_type ?? null}, ${source.size_bytes ?? null},
        ${JSON.stringify(metadata)}, ${tags},
        ${params.createdBy}, ${now}, ${now}
      )
      RETURNING *
    `;

    this.#log.info("Document created", {
      documentId: row.id as string,
      workspaceId: params.workspaceId as string,
      title: params.dto.title,
    });

    return this.#mapRow(row);
  }

  async checkQuota(workspaceId: string, newDocSize: number): Promise<{ allowed: boolean; reason?: string; quota?: { max: number; used: number; docs: number; maxDocs: number } }> {
    const [row] = await this.#pool.sql<[Record<string, unknown> | undefined]>`
      SELECT max_storage_bytes, storage_used_bytes, max_documents, document_count
      FROM workspace_quotas WHERE workspace_id = ${workspaceId}
    `;
    if (!row) return { allowed: true };
    const max = Number((row as any).maxStorageBytes ?? row.max_storage_bytes ?? 0);
    const used = Number((row as any).storageUsedBytes ?? row.storage_used_bytes ?? 0);
    const maxDocs = Number((row as any).maxDocuments ?? row.max_documents ?? 0);
    const docs = Number((row as any).documentCount ?? row.document_count ?? 0);
    if (docs >= maxDocs) return { allowed: false, reason: `Document limit reached (${docs}/${maxDocs})`, quota: { max, used, docs, maxDocs } };
    if (used + newDocSize > max) return { allowed: false, reason: `Storage quota exceeded`, quota: { max, used, docs, maxDocs } };
    return { allowed: true, quota: { max, used, docs, maxDocs } };
  }

  async updateUsage(workspaceId: string, sizeBytes: number): Promise<void> {
    await this.#pool.sql`
      UPDATE workspace_quotas SET storage_used_bytes = storage_used_bytes + ${sizeBytes}, document_count = document_count + 1, updated_at = NOW() WHERE workspace_id = ${workspaceId}
    `;
  }

  async getDocument(id: DocumentId): Promise<DocumentRecord | null> {
    const [row] = await this.#pool.sql<[Record<string, unknown> | undefined]>`
      SELECT * FROM documents WHERE id = ${id}
    `;

    if (!row) {
      this.#log.debug("Document not found", { documentId: id as string });
      return null;
    }

    return this.#mapRow(row);
  }

  async listDocuments(
    workspaceId: WorkspaceId,
    query?: ListDocumentsQuery,
  ): Promise<ListDocumentsResult> {
    const limit = query?.limit ?? 20;
    const cursor = query?.cursor;
    const statusFilter = query?.status;
    const fetchLimit = limit + 1;

    const rows = await this.#pool.sql<Record<string, unknown>[]>`
      SELECT * FROM documents
      WHERE workspace_id = ${workspaceId}
      ${statusFilter ? this.#pool.sql`AND status = ${statusFilter}` : this.#pool.sql``}
      ${cursor ? this.#pool.sql`AND created_at < ${cursor}` : this.#pool.sql``}
      ORDER BY created_at DESC
      LIMIT ${fetchLimit}
    `;

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => this.#mapRow(r));

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = lastItem.created_at;
    }

    return { items, nextCursor };
  }

  async updateStatus(
    id: DocumentId,
    status: DocumentStatus,
    errorMessage?: string,
  ): Promise<DocumentRecord | null> {
    const now = new Date().toISOString();

    const [row] = await this.#pool.sql<[Record<string, unknown> | undefined]>`
      UPDATE documents
      SET status = ${status},
          error_message = ${errorMessage ?? null},
          updated_at = ${now}
      WHERE id = ${id}
      RETURNING *
    `;

    if (!row) {
      this.#log.warn("Document not found for status update", {
        documentId: id as string,
        newStatus: status,
      });
      return null;
    }

    this.#log.info("Document status updated", {
      documentId: id as string,
      status,
    });

    return this.#mapRow(row);
  }

  #mapRow(row: Record<string, unknown>): DocumentRecord {
    const metadata = typeof row.metadata === "string"
      ? JSON.parse(row.metadata as string)
      : (row.metadata ?? {});

    return {
      id: row.id as DocumentId,
      workspace_id: row.workspace_id as WorkspaceId,
      title: row.title as string,
      description: (row.description as string) ?? undefined,
      status: row.status as DocumentStatus,
      source: {
        type: row.source_type as "upload" | "url" | "connector" | "api",
        connector: (row.source_connector as string) ?? undefined,
        location: (row.source_location as string) ?? undefined,
        filename: (row.source_filename as string) ?? undefined,
        mime_type: (row.source_mime_type as string) ?? undefined,
        size_bytes: (row.source_size_bytes as number) ?? undefined,
      },
      metadata,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      created_by: row.created_by as string,
      chunk_count: (row.chunk_count as number) ?? undefined,
      error_message: (row.error_message as string) ?? undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
