import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { EvalRepository } from "../src/repository.js";
import type { EvalRunner } from "../src/eval-runner.js";
import type { EvalEventPublisher } from "../src/events.js";
import { createEvalRouter } from "../src/routes/eval.js";
import type { EvalRunRow, EvalRunConfig } from "../src/types.js";

vi.mock("@memory-platform/observability", () => ({
  createLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  })),
  recordMetric: vi.fn(),
  getCorrelationId: vi.fn().mockReturnValue(null),
}));

vi.mock("@memory-platform/shared-utils", () => {
  let counter = 0;
  return {
    generateId: vi.fn((prefix?: string) => {
      counter++;
      return `${prefix ?? ""}mock-${counter}`;
    }),
  };
});

function makeRun(overrides: Partial<EvalRunRow> = {}): EvalRunRow {
  return {
    id: "run-1",
    workspace_id: "ws-1",
    dataset_id: "ds-1",
    config: {
      search_backend: "qdrant",
      embedding_model: "text-embedding-3-small",
      hybrid: true,
      top_k: 10,
    },
    metrics: null,
    status: "pending",
    error_message: null,
    started_at: null,
    completed_at: null,
    created_by: "api",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Eval Routes", () => {
  let app: express.Application;
  let repository: EvalRepository;
  let evalRunner: EvalRunner;
  let events: EvalEventPublisher;

  beforeEach(() => {
    vi.clearAllMocks();

    repository = {
      createDataset: vi.fn(),
      getDataset: vi.fn(),
      listDatasets: vi.fn(),
      addDatasetItems: vi.fn(),
      getDatasetItems: vi.fn(),
      deleteDataset: vi.fn(),
      createRun: vi.fn(),
      getRun: vi.fn(),
      listRuns: vi.fn(),
      updateRunStatus: vi.fn(),
      updateRunMetrics: vi.fn(),
      setRunStarted: vi.fn(),
      setRunCompleted: vi.fn(),
      saveRetrievalScores: vi.fn(),
      getRetrievalScores: vi.fn().mockResolvedValue([]),
      saveFeedback: vi.fn(),
      getFeedback: vi.fn(),
      getFeedbackByQueryId: vi.fn(),
    };

    evalRunner = {
      executeRun: vi.fn().mockResolvedValue(undefined),
    };

    events = {
      publishEvaluationCompleted: vi.fn().mockResolvedValue("evt-1"),
      publishRetrievalQualityReported: vi.fn().mockResolvedValue("evt-2"),
    };

    app = express();
    app.use(express.json());
    const router = createEvalRouter(repository, evalRunner, events);
    app.use(router);
  });

  describe("POST /internal/eval/runs", () => {
    it("creates a run and returns 201", async () => {
      const run = makeRun({ id: "run-1" });
      (repository.getDataset as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "ds-1", name: "Test" });
      (repository.createRun as ReturnType<typeof vi.fn>).mockResolvedValue(run);

      const res = await request(app)
        .post("/internal/eval/runs")
        .send({
          workspace_id: "ws-1",
          dataset_id: "ds-1",
          config: {
            search_backend: "qdrant",
            embedding_model: "text-embedding-3-small",
            hybrid: true,
            top_k: 10,
          },
        })
        .expect(201);

      expect(res.body.id).toBe("run-1");
      expect(res.body.status).toBe("pending");
    });

    it("returns 400 for missing fields", async () => {
      const res = await request(app)
        .post("/internal/eval/runs")
        .send({})
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 when dataset not found", async () => {
      (repository.getDataset as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await request(app)
        .post("/internal/eval/runs")
        .send({
          workspace_id: "ws-1",
          dataset_id: "nonexistent",
          config: {
            search_backend: "qdrant",
            embedding_model: "text-embedding-3-small",
            hybrid: true,
            top_k: 10,
          },
        })
        .expect(404);

      expect(res.body.code).toBe("DATASET_NOT_FOUND");
    });
  });

  describe("GET /internal/eval/runs/:id", () => {
    it("returns run with scores", async () => {
      const run = makeRun({ id: "run-1", status: "completed" });
      (repository.getRun as ReturnType<typeof vi.fn>).mockResolvedValue(run);
      (repository.getRetrievalScores as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const res = await request(app)
        .get("/internal/eval/runs/run-1")
        .expect(200);

      expect(res.body.run.id).toBe("run-1");
      expect(res.body.run.status).toBe("completed");
      expect(res.body.scores).toEqual([]);
    });

    it("returns 404 for non-existent run", async () => {
      (repository.getRun as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await request(app)
        .get("/internal/eval/runs/nonexistent")
        .expect(404);

      expect(res.body.code).toBe("EVAL_RUN_NOT_FOUND");
    });
  });

  describe("GET /internal/eval/scores", () => {
    it("returns scores filtered by run_id", async () => {
      (repository.getRetrievalScores as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "rs-1", run_id: "run-1", dataset_item_id: "dsi-1", query: "q", retrieved_document_ids: [], precision: 1, recall: 1, latency_ms: 50 },
      ]);

      const res = await request(app)
        .get("/internal/eval/scores?run_id=run-1")
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.scores[0].id).toBe("rs-1");
    });

    it("returns 400 when neither run_id nor workspace_id provided", async () => {
      const res = await request(app)
        .get("/internal/eval/scores")
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns scores filtered by workspace_id", async () => {
      (repository.listRuns as ReturnType<typeof vi.fn>).mockResolvedValue([makeRun()]);
      (repository.getRetrievalScores as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const res = await request(app)
        .get("/internal/eval/scores?workspace_id=ws-1")
        .expect(200);

      expect(res.body.total).toBe(0);
      expect(res.body.runs).toBe(1);
    });
  });
});
