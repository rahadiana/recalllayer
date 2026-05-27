import { Router } from "express";
import type { Request, Response } from "express";
import type { WorkspaceId, DocumentId } from "@memory-platform/shared-schemas";
import { createLogger } from "@memory-platform/observability";
import { withCorrelationIdAsync, type CorrelationId } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import { DocumentRepository } from "../repository.js";
import { DocumentIngestHandler, IngestValidationError } from "../handlers/ingest.js";
import {
  UploadSessionHandler,
  UploadSessionError,
} from "../handlers/upload-session.js";
import { validateListDocumentsQuery } from "../validation.js";
import type { IngestDocumentResponse } from "../types.js";

export function createDocumentRoutes(
  repo: DocumentRepository,
  ingestHandler: DocumentIngestHandler,
  uploadHandler: UploadSessionHandler,
): Router {
  const router = Router();
  const log = createLogger("ingestion:routes");

  router.post(
    "/internal/documents",
    async (req: Request, res: Response) => {
      const correlationId =
        (req.headers["x-correlation-id"] as string) ?? generateId();

      await withCorrelationIdAsync(correlationId as CorrelationId, async () => {
        const start = Date.now();
        log.info("POST /internal/documents requested");

        try {
          const result: IngestDocumentResponse =
            await ingestHandler.handleIngestDocument(req.body);

          log.info("POST /internal/documents completed", {
            documentId: result.document.id as string,
            latencyMs: Date.now() - start,
          });

          res.status(201).json({
            document: result.document,
            event_id: result.event_id,
          });
        } catch (err) {
          if (err instanceof IngestValidationError) {
            log.warn("POST /internal/documents validation error", {
              errors: err.errors,
              latencyMs: Date.now() - start,
            });

            res.status(422).json({
              code: "VALIDATION_ERROR",
              message: err.message,
              fields: err.errors.map((e) => ({
                field: e.field,
                message: e.message,
              })),
              error_id: generateId(),
              timestamp: new Date().toISOString(),
              path: "/internal/documents",
            });
            return;
          }

          log.error("POST /internal/documents failed", {
            error: err instanceof Error ? err.message : String(err),
            latencyMs: Date.now() - start,
          });

          res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred while ingesting the document",
            error_id: generateId(),
            timestamp: new Date().toISOString(),
            path: "/internal/documents",
          });
        }
      });
    },
  );

  router.get(
    "/internal/documents/:id",
    async (req: Request, res: Response) => {
      const start = Date.now();
      const { id } = req.params;

      log.debug("GET /internal/documents/:id requested", { documentId: id });

      const doc = await repo.getDocument(id as DocumentId);

      if (!doc) {
        res.status(404).json({
          code: "DOCUMENT_NOT_FOUND",
          message: `Document not found: ${id}`,
          error_id: generateId(),
          timestamp: new Date().toISOString(),
          path: `/internal/documents/${id}`,
        });
        return;
      }

      log.debug("GET /internal/documents/:id completed", {
        documentId: id,
        latencyMs: Date.now() - start,
      });

      res.json({ document: doc });
    },
  );

  router.get(
    "/internal/documents",
    async (req: Request, res: Response) => {
      const start = Date.now();
      const workspaceId = req.query.workspace_id as string | undefined;

      if (!workspaceId) {
        res.status(400).json({
          code: "MISSING_REQUIRED_FIELD",
          message: "workspace_id query parameter is required",
          error_id: generateId(),
          timestamp: new Date().toISOString(),
          path: "/internal/documents",
        });
        return;
      }

      const validation = validateListDocumentsQuery(req.query);

      if (!validation.valid) {
        res.status(422).json({
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          fields: validation.errors.map((e) => ({
            field: e.field,
            message: e.message,
          })),
          error_id: generateId(),
          timestamp: new Date().toISOString(),
          path: "/internal/documents",
        });
        return;
      }

      log.debug("GET /internal/documents requested", {
        workspaceId,
        limit: validation.data?.limit,
      });

      const result = await repo.listDocuments(
        workspaceId as WorkspaceId,
        validation.data,
      );

      log.debug("GET /internal/documents completed", {
        workspaceId,
        items: result.items.length,
        latencyMs: Date.now() - start,
      });

      res.json({
        items: result.items,
        next_cursor: result.nextCursor,
      });
    },
  );

  router.post(
    "/internal/upload-sessions",
    async (req: Request, res: Response) => {
      const start = Date.now();
      const {
        workspace_id,
        filename,
        mime_type,
        total_size,
        total_chunks,
        created_by,
      } = req.body;

      if (!workspace_id) {
        res.status(400).json({
          code: "MISSING_REQUIRED_FIELD",
          message: "workspace_id is required",
          error_id: generateId(),
          timestamp: new Date().toISOString(),
          path: "/internal/upload-sessions",
        });
        return;
      }

      try {
        const session = uploadHandler.handleCreateUploadSession({
          workspace_id: workspace_id as WorkspaceId,
          filename: filename ?? "unknown",
          mime_type: mime_type ?? "application/octet-stream",
          total_size: total_size ?? 0,
          total_chunks: total_chunks ?? 0,
          created_by: created_by ?? "unknown",
        });

        log.info("Upload session created via API", {
          sessionId: session.id,
          latencyMs: Date.now() - start,
        });

        res.status(201).json({ session });
      } catch (err) {
        if (err instanceof UploadSessionError) {
          res.status(422).json({
            code: err.errorCode,
            message: err.message,
            error_id: generateId(),
            timestamp: new Date().toISOString(),
            path: "/internal/upload-sessions",
          });
          return;
        }

        log.error("Upload session creation failed", {
          error: err instanceof Error ? err.message : String(err),
        });

        res.status(500).json({
          code: "INTERNAL_ERROR",
          message: "Failed to create upload session",
          error_id: generateId(),
          timestamp: new Date().toISOString(),
          path: "/internal/upload-sessions",
        });
      }
    },
  );

  router.post(
    "/internal/upload-sessions/:id/chunks",
    async (req: Request, res: Response) => {
      const { id: sessionId } = req.params as { id: string };
      const { index, size } = req.body as { index: number; size: number };

      try {
        const session = uploadHandler.handleUploadChunk(sessionId, {
          index: index ?? -1,
          size: size ?? 0,
        });

        log.debug("Chunk uploaded via API", {
          sessionId,
          chunkIndex: index,
        });

        res.json({ session });
      } catch (err) {
        if (err instanceof UploadSessionError) {
          const statusCode =
            err.errorCode === "NOT_FOUND" ? 404
            : err.errorCode === "CONFLICT" ? 409
            : 422;

          res.status(statusCode).json({
            code: err.errorCode,
            message: err.message,
            error_id: generateId(),
            timestamp: new Date().toISOString(),
            path: `/internal/upload-sessions/${sessionId}/chunks`,
          });
          return;
        }

        log.error("Chunk upload failed", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });

        res.status(500).json({
          code: "INTERNAL_ERROR",
          message: "Failed to upload chunk",
          error_id: generateId(),
          timestamp: new Date().toISOString(),
          path: `/internal/upload-sessions/${sessionId}/chunks`,
        });
      }
    },
  );

  router.get(
    "/internal/upload-sessions/:id",
    async (req: Request, res: Response) => {
      const { id: sessionId } = req.params as { id: string };
      const session = uploadHandler.getSession(sessionId);

      if (!session) {
        res.status(404).json({
          code: "NOT_FOUND",
          message: `Upload session not found: ${sessionId}`,
          error_id: generateId(),
          timestamp: new Date().toISOString(),
          path: `/internal/upload-sessions/${sessionId}`,
        });
        return;
      }

      res.json({ session });
    },
  );

  router.delete(
    "/internal/upload-sessions/:id",
    async (req: Request, res: Response) => {
      const { id: sessionId } = req.params as { id: string };

      try {
        const session = uploadHandler.abortSession(sessionId);

        log.info("Upload session aborted via API", {
          sessionId,
        });

        res.json({ session });
      } catch (err) {
        if (err instanceof UploadSessionError) {
          const statusCode =
            err.errorCode === "NOT_FOUND" ? 404
            : err.errorCode === "CONFLICT" ? 409
            : 422;

          res.status(statusCode).json({
            code: err.errorCode,
            message: err.message,
            error_id: generateId(),
            timestamp: new Date().toISOString(),
            path: `/internal/upload-sessions/${sessionId}`,
          });
          return;
        }

        log.error("Upload session abort failed", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });

        res.status(500).json({
          code: "INTERNAL_ERROR",
          message: "Failed to abort upload session",
          error_id: generateId(),
          timestamp: new Date().toISOString(),
          path: `/internal/upload-sessions/${sessionId}`,
        });
      }
    },
  );

  return router;
}
