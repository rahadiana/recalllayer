import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Queue, Message } from "@memory-platform/queue";
import type { EvalRepository } from "../src/repository.js";
import type { EvalRunner } from "../src/eval-runner.js";
import type { FeedbackCollector } from "../src/feedback-collector.js";
import { registerWorker } from "../src/worker.js";
import type { EvalRunRow } from "../src/types.js";

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

function makeMessage<T>(payload: T): Message<T> {
  return {
    id: "msg-1",
    event: {
      id: "evt-1",
      type: "test.event",
      timestamp: new Date().toISOString(),
      payload,
    },
    meta: {
      enqueuedAt: new Date().toISOString(),
      attempt: 1,
      channel: "evaluation",
      consumerId: "consumer-1",
    },
  };
}

describe("Worker", () => {
  let queue: Queue;
  let repository: EvalRepository;
  let evalRunner: EvalRunner;
  let feedbackCollector: FeedbackCollector;
  let registeredHandlers: Map<string, (msg: Message<unknown>) => Promise<void>>;

  beforeEach(() => {
    vi.clearAllMocks();

    registeredHandlers = new Map();

    queue = {
      process: vi.fn(<T>(channel: string, handler: (msg: Message<T>) => Promise<void>) => {
        registeredHandlers.set(channel, handler as (msg: Message<unknown>) => Promise<void>);
        return () => {};
      }),
      publisher: { publish: vi.fn() },
      subscriber: { subscribe: vi.fn() },
      enqueue: vi.fn(),
      drain: vi.fn(),
      depth: vi.fn(),
      close: vi.fn(),
      processWithRetry: vi.fn(),
      dlq: { pushToDLQ: vi.fn(), getDLQStats: vi.fn(), retry: vi.fn() },
    } as unknown as Queue;

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
      getRetrievalScores: vi.fn(),
      saveFeedback: vi.fn(),
      getFeedback: vi.fn(),
      getFeedbackByQueryId: vi.fn(),
    };

    evalRunner = {
      executeRun: vi.fn().mockResolvedValue({}),
    };

    feedbackCollector = {
      recordFeedback: vi.fn().mockResolvedValue({}),
      getFeedbackSummary: vi.fn().mockResolvedValue({
        total: 0,
        relevant: 0,
        partiallyRelevant: 0,
        notRelevant: 0,
        satisfactionRate: 0,
      }),
    };
  });

  it("registers handlers for both channels", () => {
    registerWorker(queue, repository, evalRunner, feedbackCollector);
    expect(queue.process).toHaveBeenCalledTimes(2);
    expect(queue.process).toHaveBeenCalledWith(
      "evaluation.run.requested",
      expect.any(Function),
    );
    expect(queue.process).toHaveBeenCalledWith(
      "retrieval.feedback.recorded",
      expect.any(Function),
    );
  });

  it("executes eval run on evaluation.run.requested", async () => {
    registerWorker(queue, repository, evalRunner, feedbackCollector);

    const handler = registeredHandlers.get("evaluation.run.requested");
    expect(handler).toBeDefined();

    const pendingRun: EvalRunRow = {
      id: "run-1",
      workspace_id: "ws-1",
      dataset_id: "ds-1",
      config: { search_backend: "qdrant", embedding_model: "m1", hybrid: true, top_k: 10 },
      metrics: null,
      status: "pending",
      error_message: null,
      started_at: null,
      completed_at: null,
      created_by: "worker",
      created_at: new Date().toISOString(),
    };

    (repository.getRun as ReturnType<typeof vi.fn>).mockResolvedValue(pendingRun);

    await handler!(
      makeMessage({
        run_id: "run-1",
        workspace_id: "ws-1",
        dataset_id: "ds-1",
        config: pendingRun.config,
        created_by: "worker",
      }),
    );

    expect(repository.getRun).toHaveBeenCalledWith("run-1");
    expect(evalRunner.executeRun).toHaveBeenCalledWith(
      "run-1",
      "ws-1",
      "ds-1",
      pendingRun.config,
      "worker",
    );
  });

  it("skips non-pending runs", async () => {
    registerWorker(queue, repository, evalRunner, feedbackCollector);

    const handler = registeredHandlers.get("evaluation.run.requested")!;
    const completedRun: EvalRunRow = {
      id: "run-1",
      workspace_id: "ws-1",
      dataset_id: "ds-1",
      config: { search_backend: "qdrant", embedding_model: "m1", hybrid: true, top_k: 10 },
      metrics: null,
      status: "completed",
      error_message: null,
      started_at: null,
      completed_at: null,
      created_by: "worker",
      created_at: new Date().toISOString(),
    };

    (repository.getRun as ReturnType<typeof vi.fn>).mockResolvedValue(completedRun);

    await handler!(
      makeMessage({
        run_id: "run-1",
        workspace_id: "ws-1",
        dataset_id: "ds-1",
        config: completedRun.config,
        created_by: "worker",
      }),
    );

    expect(evalRunner.executeRun).not.toHaveBeenCalled();
  });

  it("handles missing runs gracefully", async () => {
    registerWorker(queue, repository, evalRunner, feedbackCollector);

    const handler = registeredHandlers.get("evaluation.run.requested")!;
    (repository.getRun as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await handler!(
      makeMessage({
        run_id: "run-1",
        workspace_id: "ws-1",
        dataset_id: "ds-1",
        config: { search_backend: "qdrant", embedding_model: "m1", hybrid: true, top_k: 10 },
        created_by: "worker",
      }),
    );

    expect(evalRunner.executeRun).not.toHaveBeenCalled();
  });

  it("processes feedback on retrieval.feedback.recorded", async () => {
    registerWorker(queue, repository, evalRunner, feedbackCollector);

    const handler = registeredHandlers.get("retrieval.feedback.recorded")!;
    expect(handler).toBeDefined();

    await handler!(
      makeMessage({
        feedback_id: "fb-1",
        workspace_id: "ws-1",
        query_id: "q-1",
        user_id: "user-1",
        rating: "relevant",
      }),
    );

    expect(feedbackCollector.recordFeedback).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      queryId: "q-1",
      userId: "user-1",
      rating: "relevant",
      chunkIds: [],
    });
  });

  it("returns unregister function", () => {
    const unregister = registerWorker(queue, repository, evalRunner, feedbackCollector);
    expect(typeof unregister).toBe("function");
    expect(() => unregister()).not.toThrow();
  });
});
