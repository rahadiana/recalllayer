import { describe, it, expect, beforeEach, vi } from "vitest";
import { DocumentRepository } from "../src/repository.js";
import type { PostgresPool } from "@memory-platform/db";
import type { DocumentId, WorkspaceId } from "@memory-platform/shared-schemas";

function makeMockPool(): PostgresPool {
  const sql = vi.fn() as unknown as PostgresPool["sql"];
  return {
    sql,
    health: vi.fn().mockResolvedValue({ status: "healthy", latencyMs: 1, checkedAt: new Date() }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe("DocumentRepository", () => {
  let repo: DocumentRepository;
  let pool: PostgresPool;

  beforeEach(() => {
    pool = makeMockPool();
    repo = new DocumentRepository(pool);
  });

  describe("createDocument", () => {
    it("creates a document and returns the mapped record", async () => {
      const dbRow = {
        id: "doc_test123",
        workspace_id: "ws_test",
        title: "Test Document",
        description: null,
        status: "pending",
        source_type: "upload",
        source_connector: null,
        source_location: null,
        source_filename: "test.txt",
        source_mime_type: "text/plain",
        source_size_bytes: 1024,
        metadata: "{}",
        tags: [],
        created_by: "user_xyz",
        chunk_count: null,
        error_message: null,
        created_at: "2026-05-14T00:00:00.000Z",
        updated_at: "2026-05-14T00:00:00.000Z",
      };

      (pool.sql as ReturnType<typeof vi.fn>).mockResolvedValue([dbRow]);

      const result = await repo.createDocument({
        workspaceId: "ws_test" as WorkspaceId,
        dto: {
          title: "Test Document",
          source: {
            type: "upload",
            filename: "test.txt",
            mime_type: "text/plain",
            size_bytes: 1024,
          },
        },
        createdBy: "user_xyz",
      });

      expect(result.id).toBe("doc_test123" as DocumentId);
      expect(result.title).toBe("Test Document");
      expect(result.status).toBe("pending");
      expect(result.source.type).toBe("upload");
      expect(result.source.filename).toBe("test.txt");
    });

    it("handles JSON metadata fields", async () => {
      const dbRow = {
        id: "doc_json1",
        workspace_id: "ws_test",
        title: "JSON Doc",
        description: null,
        status: "pending",
        source_type: "api",
        source_connector: null,
        source_location: null,
        source_filename: null,
        source_mime_type: null,
        source_size_bytes: null,
        metadata: '{"author":"Jane","lang":"en"}',
        tags: ["test"],
        created_by: "api_key",
        chunk_count: null,
        error_message: null,
        created_at: "2026-05-14T00:00:00.000Z",
        updated_at: "2026-05-14T00:00:00.000Z",
      };

      (pool.sql as ReturnType<typeof vi.fn>).mockResolvedValue([dbRow]);

      const result = await repo.createDocument({
        workspaceId: "ws_test" as WorkspaceId,
        dto: {
          title: "JSON Doc",
          source: { type: "api" },
          metadata: { author: "Jane", lang: "en" },
          tags: ["test"],
        },
        createdBy: "api_key",
      });

      expect(result.metadata).toEqual({ author: "Jane", lang: "en" });
      expect(result.tags).toEqual(["test"]);
    });

    it("returns all document fields correctly mapped", async () => {
      const dbRow = {
        id: "doc_full",
        workspace_id: "ws_test",
        title: "Full Doc",
        description: "A description",
        status: "pending",
        source_type: "connector",
        source_connector: "slack",
        source_location: "C123",
        source_filename: "message.txt",
        source_mime_type: "text/plain",
        source_size_bytes: 500,
        metadata: '{"channel":"general"}',
        tags: ["slack", "archived"],
        created_by: "user_abc",
        chunk_count: null,
        error_message: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };

      (pool.sql as ReturnType<typeof vi.fn>).mockResolvedValue([dbRow]);

      const result = await repo.createDocument({
        workspaceId: "ws_test" as WorkspaceId,
        dto: {
          title: "Full Doc",
          description: "A description",
          source: {
            type: "connector",
            connector: "slack",
            location: "C123",
            filename: "message.txt",
            mime_type: "text/plain",
            size_bytes: 500,
          },
          metadata: { channel: "general" },
          tags: ["slack", "archived"],
        },
        createdBy: "user_abc",
      });

      expect(result.id).toBe("doc_full");
      expect(result.description).toBe("A description");
      expect(result.source.connector).toBe("slack");
      expect(result.source.location).toBe("C123");
      expect(result.tags).toEqual(["slack", "archived"]);
      expect(result.created_by).toBe("user_abc");
    });
  });

  describe("getDocument", () => {
    it("returns document when found", async () => {
      const dbRow = {
        id: "doc_found",
        workspace_id: "ws_test",
        title: "Found Doc",
        description: null,
        status: "ready",
        source_type: "upload",
        source_connector: null,
        source_location: null,
        source_filename: "file.pdf",
        source_mime_type: "application/pdf",
        source_size_bytes: 2048,
        metadata: "{}",
        tags: [],
        created_by: "user_xyz",
        chunk_count: 5,
        error_message: null,
        created_at: "2026-05-14T00:00:00.000Z",
        updated_at: "2026-05-14T00:00:00.000Z",
      };

      (pool.sql as ReturnType<typeof vi.fn>).mockResolvedValue([dbRow]);

      const result = await repo.getDocument("doc_found" as DocumentId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe("doc_found");
      expect(result!.status).toBe("ready");
      expect(result!.chunk_count).toBe(5);
    });

    it("returns null when not found", async () => {
      (pool.sql as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await repo.getDocument("doc_missing" as DocumentId);

      expect(result).toBeNull();
    });
  });

  describe("listDocuments", () => {
    it("returns paginated results", async () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({
        id: `doc_${i}`,
        workspace_id: "ws_test",
        title: `Document ${i}`,
        description: null,
        status: "pending" as const,
        source_type: "upload" as const,
        source_connector: null,
        source_location: null,
        source_filename: null,
        source_mime_type: null,
        source_size_bytes: null,
        metadata: "{}",
        tags: [],
        created_by: "user",
        chunk_count: null,
        error_message: null,
        created_at: `2026-05-14T0${i}:00:00.000Z`,
        updated_at: `2026-05-14T0${i}:00:00.000Z`,
      }));

      (pool.sql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await repo.listDocuments("ws_test" as WorkspaceId, {
        limit: 5,
      });

      expect(result.items).toHaveLength(5);
      expect(result.items[0].id).toBe("doc_0");
    });

    it("returns next cursor when more results exist", async () => {
      const rows = Array.from({ length: 4 }, (_, i) => ({
        id: `doc_${i}`,
        workspace_id: "ws_test",
        title: `Document ${i}`,
        description: null,
        status: "pending" as const,
        source_type: "upload" as const,
        source_connector: null,
        source_location: null,
        source_filename: null,
        source_mime_type: null,
        source_size_bytes: null,
        metadata: "{}",
        tags: [],
        created_by: "user",
        chunk_count: null,
        error_message: null,
        created_at: `2026-05-14T0${i}:00:00.000Z`,
        updated_at: `2026-05-14T0${i}:00:00.000Z`,
      }));

      (pool.sql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await repo.listDocuments("ws_test" as WorkspaceId, {
        limit: 3,
      });

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).not.toBeNull();
    });

    it("returns null next cursor when no more results", async () => {
      const rows = [
        {
          id: "doc_0",
          workspace_id: "ws_test",
          title: "Document 0",
          description: null,
          status: "pending" as const,
          source_type: "upload" as const,
          source_connector: null,
          source_location: null,
          source_filename: null,
          source_mime_type: null,
          source_size_bytes: null,
          metadata: "{}",
          tags: [],
          created_by: "user",
          chunk_count: null,
          error_message: null,
          created_at: "2026-05-14T00:00:00.000Z",
          updated_at: "2026-05-14T00:00:00.000Z",
        },
      ];

      (pool.sql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await repo.listDocuments("ws_test" as WorkspaceId, {
        limit: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it("returns empty list when no documents", async () => {
      (pool.sql as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await repo.listDocuments("ws_test" as WorkspaceId);

      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe("updateStatus", () => {
    it("updates document status", async () => {
      const dbRow = {
        id: "doc_status",
        workspace_id: "ws_test",
        title: "Status Doc",
        description: null,
        status: "ingesting",
        source_type: "upload",
        source_connector: null,
        source_location: null,
        source_filename: null,
        source_mime_type: null,
        source_size_bytes: null,
        metadata: "{}",
        tags: [],
        created_by: "user",
        chunk_count: null,
        error_message: null,
        created_at: "2026-05-14T00:00:00.000Z",
        updated_at: "2026-05-14T10:00:00.000Z",
      };

      (pool.sql as ReturnType<typeof vi.fn>).mockResolvedValue([dbRow]);

      const result = await repo.updateStatus(
        "doc_status" as DocumentId,
        "ingesting",
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe("ingesting");
    });

    it("updates status with error message", async () => {
      const dbRow = {
        id: "doc_err",
        workspace_id: "ws_test",
        title: "Error Doc",
        description: null,
        status: "error",
        source_type: "upload",
        source_connector: null,
        source_location: null,
        source_filename: null,
        source_mime_type: null,
        source_size_bytes: null,
        metadata: "{}",
        tags: [],
        created_by: "user",
        chunk_count: null,
        error_message: "Processing failed",
        created_at: "2026-05-14T00:00:00.000Z",
        updated_at: "2026-05-14T10:00:00.000Z",
      };

      (pool.sql as ReturnType<typeof vi.fn>).mockResolvedValue([dbRow]);

      const result = await repo.updateStatus(
        "doc_err" as DocumentId,
        "error",
        "Processing failed",
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe("error");
      expect(result!.error_message).toBe("Processing failed");
    });

    it("returns null for non-existent document", async () => {
      (pool.sql as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await repo.updateStatus(
        "doc_missing" as DocumentId,
        "ready",
      );

      expect(result).toBeNull();
    });
  });
});
