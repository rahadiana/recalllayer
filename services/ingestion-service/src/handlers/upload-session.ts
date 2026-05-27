import type { WorkspaceId } from "@memory-platform/shared-schemas";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import { MAX_UPLOAD_SESSION_SIZE, ALLOWED_MIME_TYPES } from "../validation.js";
import type { UploadSession, UploadChunk } from "../types.js";

export class UploadSessionHandler {
  #sessions: Map<string, UploadSession>;
  #log: Logger;

  constructor() {
    this.#sessions = new Map();
    this.#log = createLogger("ingestion:upload-session");
  }

  handleCreateUploadSession(params: {
    workspace_id: WorkspaceId;
    filename: string;
    mime_type: string;
    total_size: number;
    total_chunks: number;
    created_by: string;
  }): UploadSession {
    if (!ALLOWED_MIME_TYPES.has(params.mime_type)) {
      throw new UploadSessionError(
        `Unsupported MIME type: ${params.mime_type}`,
        "UNSUPPORTED_FILE_TYPE",
      );
    }

    if (params.total_size <= 0) {
      throw new UploadSessionError(
        "total_size must be greater than 0",
        "INVALID_INPUT",
      );
    }

    if (params.total_size > MAX_UPLOAD_SESSION_SIZE) {
      throw new UploadSessionError(
        `Total size ${params.total_size} exceeds maximum allowed size of ${MAX_UPLOAD_SESSION_SIZE} bytes`,
        "DOCUMENT_TOO_LARGE",
      );
    }

    if (params.total_chunks <= 0) {
      throw new UploadSessionError(
        "total_chunks must be greater than 0",
        "INVALID_INPUT",
      );
    }

    const now = new Date().toISOString();
    const session: UploadSession = {
      id: `upload_${generateId()}`,
      workspace_id: params.workspace_id,
      filename: params.filename,
      mime_type: params.mime_type,
      total_size: params.total_size,
      chunks_received: 0,
      total_chunks: params.total_chunks,
      status: "active",
      created_by: params.created_by,
      created_at: now,
      updated_at: now,
    };

    this.#sessions.set(session.id, session);

    this.#log.info("Upload session created", {
      sessionId: session.id,
      filename: session.filename,
      totalSize: session.total_size,
      totalChunks: session.total_chunks,
    });

    return { ...session };
  }

  handleUploadChunk(
    sessionId: string,
    chunk: UploadChunk,
  ): UploadSession {
    const session = this.#sessions.get(sessionId);

    if (!session) {
      throw new UploadSessionError(
        `Upload session not found: ${sessionId}`,
        "NOT_FOUND",
      );
    }

    if (session.status !== "active") {
      throw new UploadSessionError(
        `Upload session is not active: ${session.status}`,
        "CONFLICT",
      );
    }

    if (chunk.index < 0 || chunk.index >= session.total_chunks) {
      throw new UploadSessionError(
        `Invalid chunk index: ${chunk.index}. Expected 0–${session.total_chunks - 1}`,
        "INVALID_INPUT",
      );
    }

    if (chunk.size <= 0) {
      throw new UploadSessionError(
        "Chunk size must be greater than 0",
        "INVALID_INPUT",
      );
    }

    const updated: UploadSession = {
      ...session,
      chunks_received: session.chunks_received + 1,
      updated_at: new Date().toISOString(),
    };

    if (updated.chunks_received >= updated.total_chunks) {
      updated.status = "completed";
    }

    this.#sessions.set(sessionId, updated);

    this.#log.debug("Chunk received", {
      sessionId,
      chunkIndex: chunk.index,
      chunksReceived: updated.chunks_received,
      totalChunks: updated.total_chunks,
      completed: updated.status === "completed",
    });

    if (updated.status === "completed") {
      this.#log.info("Upload session completed", {
        sessionId,
        filename: session.filename,
        chunksReceived: updated.chunks_received,
      });
    }

    return { ...updated };
  }

  getSession(sessionId: string): UploadSession | undefined {
    const session = this.#sessions.get(sessionId);
    return session ? { ...session } : undefined;
  }

  abortSession(sessionId: string): UploadSession {
    const session = this.#sessions.get(sessionId);

    if (!session) {
      throw new UploadSessionError(
        `Upload session not found: ${sessionId}`,
        "NOT_FOUND",
      );
    }

    if (session.status !== "active") {
      throw new UploadSessionError(
        `Cannot abort session with status: ${session.status}`,
        "CONFLICT",
      );
    }

    const updated: UploadSession = {
      ...session,
      status: "aborted",
      updated_at: new Date().toISOString(),
    };

    this.#sessions.set(sessionId, updated);

    this.#log.info("Upload session aborted", {
      sessionId,
      chunksReceived: session.chunks_received,
    });

    return { ...updated };
  }
}

export class UploadSessionError extends Error {
  public readonly errorCode: string;

  constructor(message: string, errorCode: string) {
    super(message);
    this.name = "UploadSessionError";
    this.errorCode = errorCode;
  }
}
