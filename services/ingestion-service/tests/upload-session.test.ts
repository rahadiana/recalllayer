import { describe, it, expect, beforeEach } from "vitest";
import { UploadSessionHandler, UploadSessionError } from "../src/handlers/upload-session.js";
import type { WorkspaceId } from "@memory-platform/shared-schemas";

describe("UploadSessionHandler", () => {
  let handler: UploadSessionHandler;

  beforeEach(() => {
    handler = new UploadSessionHandler();
  });

  const validParams = {
    workspace_id: "ws_test" as WorkspaceId,
    filename: "document.pdf",
    mime_type: "application/pdf",
    total_size: 1024 * 1024,
    total_chunks: 4,
    created_by: "user_test",
  };

  describe("handleCreateUploadSession", () => {
    it("creates a new upload session", () => {
      const session = handler.handleCreateUploadSession(validParams);

      expect(session.id).toMatch(/^upload_/);
      expect(session.workspace_id).toBe("ws_test");
      expect(session.filename).toBe("document.pdf");
      expect(session.mime_type).toBe("application/pdf");
      expect(session.total_size).toBe(1024 * 1024);
      expect(session.total_chunks).toBe(4);
      expect(session.chunks_received).toBe(0);
      expect(session.status).toBe("active");
      expect(session.created_by).toBe("user_test");
      expect(session.created_at).toBeTruthy();
      expect(session.updated_at).toBeTruthy();
    });

    it("rejects unsupported MIME type", () => {
      expect(() =>
        handler.handleCreateUploadSession({
          ...validParams,
          mime_type: "application/octet-stream",
        }),
      ).toThrow(UploadSessionError);

      try {
        handler.handleCreateUploadSession({
          ...validParams,
          mime_type: "application/octet-stream",
        });
      } catch (err) {
        expect(err).toBeInstanceOf(UploadSessionError);
        expect((err as UploadSessionError).errorCode).toBe("UNSUPPORTED_FILE_TYPE");
      }
    });

    it("rejects zero total_size", () => {
      expect(() =>
        handler.handleCreateUploadSession({
          ...validParams,
          total_size: 0,
        }),
      ).toThrow(UploadSessionError);
    });

    it("rejects oversized upload", () => {
      expect(() =>
        handler.handleCreateUploadSession({
          ...validParams,
          total_size: 600 * 1024 * 1024,
        }),
      ).toThrow(UploadSessionError);
    });

    it("rejects zero total_chunks", () => {
      expect(() =>
        handler.handleCreateUploadSession({
          ...validParams,
          total_chunks: 0,
        }),
      ).toThrow(UploadSessionError);
    });

    it("creates sessions with unique IDs", () => {
      const s1 = handler.handleCreateUploadSession(validParams);
      const s2 = handler.handleCreateUploadSession(validParams);
      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe("handleUploadChunk", () => {
    it("accepts a valid chunk", () => {
      const session = handler.handleCreateUploadSession(validParams);

      const updated = handler.handleUploadChunk(session.id, {
        index: 0,
        size: 256 * 1024,
      });

      expect(updated.chunks_received).toBe(1);
      expect(updated.status).toBe("active");
    });

    it("completes session when all chunks received", () => {
      const session = handler.handleCreateUploadSession({
        ...validParams,
        total_chunks: 2,
      });

      const after1 = handler.handleUploadChunk(session.id, {
        index: 0,
        size: 512 * 1024,
      });
      expect(after1.status).toBe("active");
      expect(after1.chunks_received).toBe(1);

      const after2 = handler.handleUploadChunk(session.id, {
        index: 1,
        size: 512 * 1024,
      });
      expect(after2.status).toBe("completed");
      expect(after2.chunks_received).toBe(2);
    });

    it("rejects chunk for non-existent session", () => {
      expect(() =>
        handler.handleUploadChunk("non-existent", {
          index: 0,
          size: 1024,
        }),
      ).toThrow(UploadSessionError);
    });

    it("rejects chunk for completed session", () => {
      const session = handler.handleCreateUploadSession({
        ...validParams,
        total_chunks: 1,
      });

      handler.handleUploadChunk(session.id, { index: 0, size: 1024 });

      expect(() =>
        handler.handleUploadChunk(session.id, {
          index: 0,
          size: 1024,
        }),
      ).toThrow(UploadSessionError);
    });

    it("rejects chunk with negative index", () => {
      const session = handler.handleCreateUploadSession(validParams);

      expect(() =>
        handler.handleUploadChunk(session.id, {
          index: -1,
          size: 1024,
        }),
      ).toThrow(UploadSessionError);
    });

    it("rejects chunk with index beyond total", () => {
      const session = handler.handleCreateUploadSession(validParams);

      expect(() =>
        handler.handleUploadChunk(session.id, {
          index: 4,
          size: 1024,
        }),
      ).toThrow(UploadSessionError);
    });

    it("rejects chunk with zero size", () => {
      const session = handler.handleCreateUploadSession(validParams);

      expect(() =>
        handler.handleUploadChunk(session.id, {
          index: 0,
          size: 0,
        }),
      ).toThrow(UploadSessionError);
    });
  });

  describe("getSession", () => {
    it("returns session by ID", () => {
      const created = handler.handleCreateUploadSession(validParams);
      const found = handler.getSession(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it("returns undefined for non-existent session", () => {
      expect(handler.getSession("non-existent")).toBeUndefined();
    });

    it("returns a copy (not reference)", () => {
      const created = handler.handleCreateUploadSession(validParams);
      const found = handler.getSession(created.id);

      found!.filename = "modified.pdf";

      const foundAgain = handler.getSession(created.id);
      expect(foundAgain!.filename).toBe("document.pdf");
    });
  });

  describe("abortSession", () => {
    it("aborts an active session", () => {
      const session = handler.handleCreateUploadSession(validParams);

      const aborted = handler.abortSession(session.id);
      expect(aborted.status).toBe("aborted");
    });

    it("rejects abort for non-existent session", () => {
      expect(() => handler.abortSession("non-existent")).toThrow(
        UploadSessionError,
      );
    });

    it("rejects abort for already completed session", () => {
      const session = handler.handleCreateUploadSession({
        ...validParams,
        total_chunks: 1,
      });
      handler.handleUploadChunk(session.id, { index: 0, size: 1024 });

      expect(() => handler.abortSession(session.id)).toThrow(
        UploadSessionError,
      );
    });

    it("rejects abort for already aborted session", () => {
      const session = handler.handleCreateUploadSession(validParams);
      handler.abortSession(session.id);

      expect(() => handler.abortSession(session.id)).toThrow(
        UploadSessionError,
      );
    });
  });
});
