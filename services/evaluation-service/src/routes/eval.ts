import { Router, type Request, type Response } from "express";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { EvalRepository } from "../repository.js";
import type { EvalRunner } from "../eval-runner.js";
import type { EvalEventPublisher } from "../events.js";
import type { EvalRunConfig } from "@memory-platform/shared-schemas";

export function createEvalRouter(
  repository: EvalRepository,
  evalRunner: EvalRunner,
  events: EvalEventPublisher,
): Router {
  const router = Router();
  const logger: Logger = createLogger("evaluation:routes:eval");

  router.post("/internal/eval/runs", async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        workspace_id: string;
        dataset_id: string;
        config: EvalRunConfig;
      };

      if (!body.workspace_id || !body.dataset_id || !body.config) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Missing required fields: workspace_id, dataset_id, config",
          error_id: generateId("err_"),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const dataset = await repository.getDataset(body.dataset_id);
      if (!dataset) {
        res.status(404).json({
          code: "DATASET_NOT_FOUND",
          message: `Dataset ${body.dataset_id} not found`,
          error_id: generateId("err_"),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const run = await repository.createRun(
        body.workspace_id,
        body.dataset_id,
        body.config,
        "api",
      );

      logger.info("Eval run triggered", {
        runId: run.id,
        datasetId: body.dataset_id,
        workspaceId: body.workspace_id,
      });

      void evalRunner
        .executeRun(
          run.id,
          body.workspace_id,
          body.dataset_id,
          body.config,
          "api",
        )
        .catch((err) => {
          logger.error("Async eval run failed", {
            runId: run.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });

      res.status(201).json({
        id: run.id,
        workspace_id: run.workspace_id,
        dataset_id: run.dataset_id,
        config: run.config,
        status: run.status,
        created_at: run.created_at,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Failed to create eval run", { error: message });
      res.status(500).json({
        code: "INTERNAL_ERROR",
        message: "Failed to create evaluation run",
        details: message,
        error_id: generateId("err_"),
        timestamp: new Date().toISOString(),
      });
    }
  });

  router.get("/internal/eval/runs/:id", async (req: Request, res: Response) => {
    try {
      const runId = req.params.id as string;
      const run = await repository.getRun(runId);

      if (!run) {
        res.status(404).json({
          code: "EVAL_RUN_NOT_FOUND",
          message: `Evaluation run ${runId} not found`,
          error_id: generateId("err_"),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const scores = await repository.getRetrievalScores(run.id);

      res.json({
        run,
        scores,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Failed to get eval run", { error: message });
      res.status(500).json({
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve evaluation run",
        details: message,
        error_id: generateId("err_"),
        timestamp: new Date().toISOString(),
      });
    }
  });

  router.get("/internal/eval/scores", async (req: Request, res: Response) => {
    try {
      const runId = (req.query.run_id as string) ?? undefined;
      const workspaceId = (req.query.workspace_id as string) ?? undefined;

      if (runId) {
        const scores = await repository.getRetrievalScores(runId);
        res.json({ scores, total: scores.length });
        return;
      }

      if (workspaceId) {
        const runs = await repository.listRuns(workspaceId, undefined, 20, 0);
        const allScores = [];
        for (const run of runs) {
          const scores = await repository.getRetrievalScores(run.id);
          allScores.push(...scores);
        }
        res.json({ scores: allScores, total: allScores.length, runs: runs.length });
        return;
      }

      res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Either run_id or workspace_id query parameter is required",
        error_id: generateId("err_"),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Failed to get scores", { error: message });
      res.status(500).json({
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve scores",
        details: message,
        error_id: generateId("err_"),
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}
