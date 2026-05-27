import { describe, it, expect, beforeEach, vi } from "vitest";
import "./setup.js";

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
  };
});

import { BehaviorAnalyzer } from "../src/behavior-analyzer.js";
import type { BehaviorEvent } from "@memory-platform/shared-schemas";
import type { WorkspaceId, UserId } from "@memory-platform/shared-schemas";

function makeEvent(overrides: Partial<BehaviorEvent> = {}): BehaviorEvent {
  return {
    id: "evt_1",
    workspace_id: "ws-1" as WorkspaceId,
    user_id: "user-1" as UserId,
    event_type: "search",
    payload: {},
    occurred_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("BehaviorAnalyzer", () => {
  let analyzer: BehaviorAnalyzer;

  beforeEach(() => {
    analyzer = new BehaviorAnalyzer();
  });

  describe("analyzeRecentEvents", () => {
    it("returns empty result for no events", () => {
      const result = analyzer.analyzeRecentEvents([]);
      expect(result.patterns).toHaveLength(0);
      expect(result.topSearchTerms).toHaveLength(0);
      expect(result.topCategories).toHaveLength(0);
    });

    it("extracts search terms from search events", () => {
      const events = [
        makeEvent({ event_type: "search", payload: { query: "machine learning tutorial" } }),
        makeEvent({ event_type: "search", payload: { query: "machine learning deep dive" } }),
        makeEvent({ event_type: "search", payload: { query: "python tutorial" } }),
      ];

      const result = analyzer.analyzeRecentEvents(events);

      expect(result.topSearchTerms).toContain("machine");
      expect(result.topSearchTerms).toContain("learning");
      expect(result.topSearchTerms).toContain("tutorial");
    });

    it("extracts categories from events", () => {
      const events = [
        makeEvent({
          event_type: "document_view",
          payload: { category: "technology", tags: ["ai", "ml"] },
        }),
        makeEvent({
          event_type: "search",
          payload: { category: "science", tags: ["physics"] },
        }),
        makeEvent({
          event_type: "document_view",
          payload: { tags: ["ai", "programming"] },
        }),
      ];

      const result = analyzer.analyzeRecentEvents(events);

      expect(result.topCategories).toContain("technology");
      expect(result.topCategories).toContain("ai");
    });

    it("computes behaviour summary from events", () => {
      const events = [
        makeEvent({ event_type: "search" }),
        makeEvent({ event_type: "search" }),
        makeEvent({ event_type: "document_view" }),
      ];

      const result = analyzer.analyzeRecentEvents(events);

      expect(result.summaryUpdates.total_searches).toBe(2);
      expect(result.summaryUpdates.total_document_views).toBe(1);
      expect(result.summaryUpdates.last_active_at).toBeDefined();
    });

    it("detects topic interest patterns", () => {
      const events = Array(5)
        .fill(null)
        .map(() =>
          makeEvent({
            event_type: "search",
            payload: { topics: ["javascript", "react"] },
          }),
        );

      const result = analyzer.analyzeRecentEvents(events);

      const topicPatterns = result.patterns.filter(
        (p) => p.category === "topic_interest",
      );
      expect(topicPatterns.length).toBeGreaterThan(0);

      const values = topicPatterns.map((p) => p.value);
      expect(values).toContain("javascript");
      expect(values).toContain("react");
    });

    it("detects feedback sentiment pattern", () => {
      const events = Array(5)
        .fill(null)
        .map(() =>
          makeEvent({
            id: `evt_fb_${Math.random()}`,
            event_type: "feedback",
            payload: { rating: 5 },
          }),
        );

      const result = analyzer.analyzeRecentEvents(events);

      const sentiment = result.patterns.find(
        (p) => p.category === "feedback_sentiment",
      );
      expect(sentiment).toBeDefined();
      expect(sentiment!.value).toBe("positive");
    });

    it("detects negative feedback sentiment", () => {
      const events = Array(4)
        .fill(null)
        .map(() =>
          makeEvent({
            id: `evt_fb_${Math.random()}`,
            event_type: "feedback",
            payload: { rating: 1 },
          }),
        );

      const result = analyzer.analyzeRecentEvents(events);

      const sentiment = result.patterns.find(
        (p) => p.category === "feedback_sentiment",
      );
      expect(sentiment).toBeDefined();
      expect(sentiment!.value).toBe("negative");
    });

    it("filters out short search terms (<=2 chars)", () => {
      const events = [
        makeEvent({ event_type: "search", payload: { query: "ai ml dl" } }),
      ];

      const result = analyzer.analyzeRecentEvents(events);

      expect(result.topSearchTerms).not.toContain("ai");
      expect(result.topSearchTerms).not.toContain("ml");
      expect(result.topSearchTerms).not.toContain("dl");
    });
  });
});
