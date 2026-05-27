import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvalRepository } from "../src/repository.js";
import type { EvalEventPublisher } from "../src/events.js";
import { createFeedbackCollector } from "../src/feedback-collector.js";
import type { HumanFeedbackRow, FeedbackRating } from "../src/types.js";

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
  generateId: vi.fn((prefix?: string) => `${prefix ?? ""}mock-id-${Math.random().toString(36).slice(2, 8)}`),
}));

function mockRepository(overrides: Partial<EvalRepository> = {}): EvalRepository {
  return {
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
    ...overrides,
  };
}

function mockEvents(overrides: Partial<EvalEventPublisher> = {}): EvalEventPublisher {
  return {
    publishEvaluationCompleted: vi.fn().mockResolvedValue("event-id"),
    publishRetrievalQualityReported: vi.fn().mockResolvedValue("event-id"),
    ...overrides,
  };
}

describe("FeedbackCollector", () => {
  let repo: EvalRepository;
  let events: EvalEventPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = mockRepository();
    events = mockEvents();
  });

  describe("recordFeedback", () => {
    it("saves feedback and publishes event", async () => {
      const savedFeedback: HumanFeedbackRow = {
        id: "fb-1",
        workspace_id: "ws-1",
        query_id: "q-1",
        user_id: "user-1",
        rating: "relevant" as FeedbackRating,
        comment: "Great results",
        chunk_ids: ["chunk-1"],
        created_at: new Date().toISOString(),
      };

      (repo.saveFeedback as ReturnType<typeof vi.fn>).mockResolvedValue(savedFeedback);

      const collector = createFeedbackCollector(repo, events);
      const result = await collector.recordFeedback({
        workspaceId: "ws-1",
        queryId: "q-1",
        userId: "user-1",
        rating: "relevant",
        comment: "Great results",
        chunkIds: ["chunk-1"],
      });

      expect(result).toEqual(savedFeedback);
      expect(repo.saveFeedback).toHaveBeenCalledTimes(1);
      expect(events.publishRetrievalQualityReported).toHaveBeenCalledTimes(1);
    });
  });

  describe("getFeedbackSummary", () => {
    it("computes correct summary statistics", async () => {
      const feedbackList: HumanFeedbackRow[] = [
        { id: "1", workspace_id: "ws-1", query_id: "q1", user_id: "u1", rating: "relevant", comment: null, chunk_ids: [], created_at: "" },
        { id: "2", workspace_id: "ws-1", query_id: "q2", user_id: "u1", rating: "relevant", comment: null, chunk_ids: [], created_at: "" },
        { id: "3", workspace_id: "ws-1", query_id: "q3", user_id: "u1", rating: "partially_relevant", comment: null, chunk_ids: [], created_at: "" },
        { id: "4", workspace_id: "ws-1", query_id: "q4", user_id: "u1", rating: "not_relevant", comment: null, chunk_ids: [], created_at: "" },
      ];

      (repo.getFeedback as ReturnType<typeof vi.fn>).mockResolvedValue(feedbackList);

      const collector = createFeedbackCollector(repo, events);
      const summary = await collector.getFeedbackSummary("ws-1");

      expect(summary.total).toBe(4);
      expect(summary.relevant).toBe(2);
      expect(summary.partiallyRelevant).toBe(1);
      expect(summary.notRelevant).toBe(1);
      expect(summary.satisfactionRate).toBeCloseTo((2 + 0.5) / 4, 5);
    });

    it("returns zeros for empty feedback", async () => {
      (repo.getFeedback as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const collector = createFeedbackCollector(repo, events);
      const summary = await collector.getFeedbackSummary("ws-1");

      expect(summary.total).toBe(0);
      expect(summary.relevant).toBe(0);
      expect(summary.satisfactionRate).toBe(0);
    });
  });
});
