import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEvalEvents } from "../src/events.js";
import type { Publisher } from "@memory-platform/queue";

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

vi.mock("@memory-platform/shared-utils", () => ({
  generateId: vi.fn(() => "mock-event-id"),
}));

describe("EvalEventPublisher", () => {
  let publisher: Publisher;
  let logger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    publisher = {
      publish: vi.fn().mockResolvedValue("published-id"),
      publishBulk: vi.fn().mockResolvedValue(["id-1", "id-2"]),
    } as unknown as Publisher;

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };
  });

  describe("publishEvaluationCompleted", () => {
    it("publishes evaluation.completed event", async () => {
      const events = createEvalEvents(publisher, logger as never);
      const eventId = await events.publishEvaluationCompleted({
        run_id: "run-1",
        workspace_id: "ws-1",
        dataset_id: "ds-1",
        metrics: {
          mrr: 0.8,
          precision_at_k: 0.7,
          recall_at_k: 0.6,
          ndcg: 0.75,
          map: 0.72,
          avg_latency_ms: 120,
          total_queries: 10,
        },
        status: "completed",
      });

      expect(eventId).toBe("published-id");
      expect(publisher.publish).toHaveBeenCalledTimes(1);

      const callArgs = (publisher.publish as ReturnType<typeof vi.fn>).mock.calls[0];
      const channel = callArgs[0];
      const envelope = callArgs[1];

      expect(channel).toBe("evaluation");
      expect(envelope.type).toBe("evaluation.completed");
      expect(envelope.payload.run_id).toBe("run-1");
      expect(envelope.payload.status).toBe("completed");
    });
  });

  describe("publishRetrievalQualityReported", () => {
    it("publishes retrieval.quality.reported event", async () => {
      const events = createEvalEvents(publisher, logger as never);
      const eventId = await events.publishRetrievalQualityReported({
        report_id: "rpt-1",
        run_id: "run-1",
        workspace_id: "ws-1" as import("@memory-platform/shared-schemas").WorkspaceId,
        overall_quality: "good",
        hallucination_risk_score: 0.2,
        metrics_summary: { mrr: 0.8, ndcg: 0.82, map: 0.78 },
      });

      expect(eventId).toBe("published-id");
      expect(publisher.publish).toHaveBeenCalledTimes(1);

      const callArgs = (publisher.publish as ReturnType<typeof vi.fn>).mock.calls[0];
      const channel = callArgs[0];
      const envelope = callArgs[1];

      expect(channel).toBe("evaluation");
      expect(envelope.type).toBe("retrieval.quality.reported");
      expect(envelope.payload.overall_quality).toBe("good");
    });
  });
});
