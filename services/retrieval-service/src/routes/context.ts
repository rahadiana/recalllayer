import { Router, type Request, type Response } from "express";
import { createLogger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { ContextRequest } from "../types.js";
import { ContextAssembler } from "../context-builder.js";

export function createContextRouter(): Router {
  const router = Router();
  const logger = createLogger("retrieval:routes:context");
  const assembler = new ContextAssembler();

  router.post("/internal/context", async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const body = req.body as ContextRequest;

      if (!body.passages || body.passages.length === 0) {
        res.status(400).json({
          code: "INVALID_INPUT",
          message: "At least one passage is required",
          error_id: generateId("err_"),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.info("Context assembly request received", {
        workspaceId: body.workspace_id,
        passagesCount: body.passages.length,
        maxTokens: body.max_tokens,
      });

      const result = assembler.assemble(body);

      const latencyMs = Date.now() - startTime;

      logger.info("Context assembly completed", {
        workspaceId: body.workspace_id,
        chunksIncluded: result.contextWindow.chunks.length,
        truncatedCount: result.truncatedCount,
        tokenCount: result.contextWindow.token_count,
        latencyMs,
      });

      res.json({
        context_window: result.contextWindow,
        truncated_count: result.truncatedCount,
        latency_ms: latencyMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Context assembly failed", { error: message });
      res.status(500).json({
        code: "INTERNAL_ERROR",
        message: "Context assembly failed",
        details: message,
        error_id: generateId("err_"),
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}
