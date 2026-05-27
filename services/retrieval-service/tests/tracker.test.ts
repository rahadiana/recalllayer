import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@memory-platform/observability", () => {
  const mockLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    createLogger: vi.fn().mockReturnValue(mockLogger),
    recordMetric: vi.fn(),
    getCorrelationId: vi.fn().mockReturnValue(null),
  };
});

vi.mock("@memory-platform/shared-utils", () => {
  let counter = 0;
  return {
    generateId: vi.fn(() => {
      counter++;
      return `id_${counter}`;
    }),
  };
});

import { createSearchTracker } from "../src/tracker.js";
import type { WorkspaceId } from "@memory-platform/shared-schemas";

describe("SearchTracker", () => {
  let tracker: ReturnType<typeof createSearchTracker>;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = createSearchTracker();
  });

  it("logs a search entry and returns it with id and timestamp", () => {
    const entry = tracker.logSearch({
      query_id: "q1",
      workspace_id: "ws-1" as WorkspaceId,
      query: "test query",
      result_count: 5,
      latency_ms: 150,
      hybrid: true,
      rerank_applied: false,
    });

    expect(entry.id).toBeTruthy();
    expect(entry.created_at).toBeTruthy();
    expect(entry.query_id).toBe("q1");
    expect(entry.result_count).toBe(5);
    expect(entry.latency_ms).toBe(150);
  });

  it("retrieves logs by workspace_id", () => {
    tracker.logSearch({
      query_id: "q1",
      workspace_id: "ws-1" as WorkspaceId,
      query: "query one",
      result_count: 3,
      latency_ms: 100,
      hybrid: true,
      rerank_applied: false,
    });

    tracker.logSearch({
      query_id: "q2",
      workspace_id: "ws-2" as WorkspaceId,
      query: "query two",
      result_count: 7,
      latency_ms: 200,
      hybrid: false,
      rerank_applied: true,
    });

    tracker.logSearch({
      query_id: "q3",
      workspace_id: "ws-1" as WorkspaceId,
      query: "query three",
      result_count: 1,
      latency_ms: 50,
      hybrid: true,
      rerank_applied: true,
    });

    const ws1Logs = tracker.getLogs("ws-1" as WorkspaceId);
    expect(ws1Logs).toHaveLength(2);

    const ws2Logs = tracker.getLogs("ws-2" as WorkspaceId);
    expect(ws2Logs).toHaveLength(1);
  });

  it("logs feedback and links to search log", () => {
    const entry = tracker.logSearch({
      query_id: "q1",
      workspace_id: "ws-1" as WorkspaceId,
      query: "test",
      result_count: 5,
      latency_ms: 100,
      hybrid: true,
      rerank_applied: false,
    });

    const feedback = tracker.logFeedback(
      { rating: 4, comment: "Good results" },
      entry.id,
    );

    expect(feedback.search_log_id).toBe(entry.id);
    expect(feedback.rating).toBe(4);
    expect(feedback.comment).toBe("Good results");

    const retrieved = tracker.getLogById(entry.id);
    expect(retrieved?.feedback).toBeDefined();
    expect(retrieved?.feedback?.rating).toBe(4);
  });

  it("retrieves logs in reverse chronological order", () => {
    tracker.logSearch({
      query_id: "q1",
      workspace_id: "ws-1" as WorkspaceId,
      query: "first",
      result_count: 1,
      latency_ms: 10,
      hybrid: true,
      rerank_applied: false,
    });

    tracker.logSearch({
      query_id: "q2",
      workspace_id: "ws-1" as WorkspaceId,
      query: "second",
      result_count: 2,
      latency_ms: 20,
      hybrid: true,
      rerank_applied: false,
    });

    const logs = tracker.getLogs("ws-1" as WorkspaceId);
    expect(logs[0].query).toBe("second");
    expect(logs[1].query).toBe("first");
  });

  it("getLogById returns undefined for non-existent log", () => {
    const result = tracker.getLogById("nonexistent");
    expect(result).toBeUndefined();
  });

  it("clear empties all logs", () => {
    tracker.logSearch({
      query_id: "q1",
      workspace_id: "ws-1" as WorkspaceId,
      query: "test",
      result_count: 1,
      latency_ms: 10,
      hybrid: true,
      rerank_applied: false,
    });

    tracker.clear();

    const logs = tracker.getLogs("ws-1" as WorkspaceId);
    expect(logs).toHaveLength(0);
  });
});
