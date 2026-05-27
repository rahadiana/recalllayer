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
    generateCorrelationId: vi.fn().mockReturnValue("corr-1"),
    withCorrelationId: vi.fn().mockImplementation((_id, fn) => fn()),
    withCorrelationIdAsync: vi.fn().mockImplementation(async (_id, fn) => fn()),
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

import { SignalProcessor } from "../src/signal-processor.js";
import type { WorkspaceId, UserId } from "@memory-platform/shared-schemas";
import type { ProfileSignal } from "../src/types.js";

describe("SignalProcessor", () => {
  let processor: SignalProcessor;

  beforeEach(() => {
    processor = new SignalProcessor();
  });

  describe("processSearchSignal", () => {
    it("processes search payload into behavior event format", () => {
      const payload = {
        query: "how to build a RAG pipeline",
        result_count: 10,
        latency_ms: 250,
        filters: { document_type: "pdf" },
      };

      const result = processor.processSearchSignal(
        "ws-1" as WorkspaceId,
        "user-1" as UserId,
        payload,
      );

      expect(result.behaviorEventPayload.query).toBe(payload.query);
      expect(result.behaviorEventPayload.result_count).toBe(10);
      expect(result.behaviorEventPayload.latency_ms).toBe(250);
      expect(result.searchTerms).toContain("how");
      expect(result.searchTerms).toContain("build");
      expect(result.searchTerms).toContain("rag");
    });

    it("extracts search terms filtering out short words", () => {
      const payload = { query: "a b c hello world ai" };

      const result = processor.processSearchSignal(
        "ws-1" as WorkspaceId,
        "user-1" as UserId,
        payload,
      );

      expect(result.searchTerms).toContain("hello");
      expect(result.searchTerms).toContain("world");
      expect(result.searchTerms.filter((t) => t.length <= 2)).toHaveLength(0);
    });

    it("handles empty query", () => {
      const payload = { query: "" };

      const result = processor.processSearchSignal(
        "ws-1" as WorkspaceId,
        "user-1" as UserId,
        payload,
      );

      expect(result.searchTerms).toHaveLength(0);
    });

    it("includes category and tags if present", () => {
      const payload = {
        query: "test",
        category: "science",
        tags: ["physics", "math"],
      };

      const result = processor.processSearchSignal(
        "ws-1" as WorkspaceId,
        "user-1" as UserId,
        payload,
      );

      expect(result.category).toBe("science");
      expect(result.tags).toEqual(["physics", "math"]);
    });
  });

  describe("processDocumentViewSignal", () => {
    it("processes document view payload", () => {
      const payload = {
        document_id: "doc_123",
        document_title: "RAG Paper",
        view_duration_ms: 5000,
        scroll_depth: 0.8,
        category: "ai",
        topics: ["nlp", "retrieval"],
      };

      const result = processor.processDocumentViewSignal(
        "ws-1" as WorkspaceId,
        "user-1" as UserId,
        payload,
      );

      expect(result.behaviorEventPayload.document_id).toBe("doc_123");
      expect(result.behaviorEventPayload.document_title).toBe("RAG Paper");
      expect(result.behaviorEventPayload.view_duration_ms).toBe(5000);
      expect(result.category).toBe("ai");
      expect(result.topics).toEqual(["nlp", "retrieval"]);
    });
  });

  describe("processFeedbackSignal", () => {
    it("processes feedback payload", () => {
      const payload = {
        rating: 5,
        comment: "Excellent results",
        target_type: "search_result",
        target_id: "sr_123",
      };

      const result = processor.processFeedbackSignal(
        "ws-1" as WorkspaceId,
        "user-1" as UserId,
        payload,
      );

      expect(result.rating).toBe(5);
      expect(result.comment).toBe("Excellent results");
      expect(result.target_type).toBe("search_result");
    });
  });

  describe("processSettingChangeSignal", () => {
    it("processes setting change payload", () => {
      const payload = {
        settings: { theme: "dark", language: "id" },
        changed_keys: ["theme", "language"],
      };

      const result = processor.processSettingChangeSignal(
        "ws-1" as WorkspaceId,
        "user-1" as UserId,
        payload,
      );

      expect(result.settings).toEqual({ theme: "dark", language: "id" });
      expect(result.changed_keys).toEqual(["theme", "language"]);
    });
  });

  describe("mergePreferenceAnalyses", () => {
    it("merges multiple analyses preferring higher confidence", () => {
      const analysis1 = {
        detectedPreferences: [
          { key: "language", value: "en", source: "inferred" as const, confidence: 0.6 },
        ],
        detectedPatterns: [
          { category: "test", value: "a", confidence: 0.5, evidence: [], detected_at: "2024-01-01" },
        ],
      };

      const analysis2 = {
        detectedPreferences: [
          { key: "language", value: "id", source: "inferred" as const, confidence: 0.9 },
        ],
        detectedPatterns: [
          { category: "test", value: "b", confidence: 0.8, evidence: [], detected_at: "2024-01-02" },
        ],
      };

      const merged = processor.mergePreferenceAnalyses([analysis1, analysis2]);

      const lang = merged.detectedPreferences.find((p) => p.key === "language");
      expect(lang).toBeDefined();
      expect(lang!.value).toBe("id");
      expect(lang!.confidence).toBe(0.9);
      expect(merged.detectedPatterns).toHaveLength(2);
    });

    it("prefers explicit over inferred for same key", () => {
      const analysis1 = {
        detectedPreferences: [
          { key: "language", value: "en", source: "inferred" as const, confidence: 0.9 },
        ],
        detectedPatterns: [],
      };

      const analysis2 = {
        detectedPreferences: [
          { key: "language", value: "id", source: "explicit" as const, confidence: 1.0 },
        ],
        detectedPatterns: [],
      };

      const merged = processor.mergePreferenceAnalyses([analysis1, analysis2]);

      const lang = merged.detectedPreferences.find((p) => p.key === "language");
      expect(lang!.value).toBe("id");
      expect(lang!.source).toBe("explicit");
    });
  });

  describe("summarizeSignalBatch", () => {
    it("summarizes batch processing results", () => {
      const signals: ProfileSignal[] = [
        {
          workspace_id: "ws-1" as WorkspaceId,
          user_id: "user-1" as UserId,
          signal_type: "search",
          payload: { query: "test", __signal_ref: "sig1" },
        },
        {
          workspace_id: "ws-1" as WorkspaceId,
          user_id: "user-1" as UserId,
          signal_type: "feedback",
          payload: { rating: 5, __signal_ref: "sig2" },
        },
      ];

      const results = new Map();
      results.set("sig1", {
        workspaceId: "ws-1" as WorkspaceId,
        userId: "user-1" as UserId,
        signalType: "search",
        preferencesCreated: 1,
        preferencesUpdated: 0,
        factsUpserted: 0,
        patternsDetected: 1,
        behaviourSummaryUpdated: true,
        errors: [],
      });
      results.set("sig2", {
        workspaceId: "ws-1" as WorkspaceId,
        userId: "user-1" as UserId,
        signalType: "feedback",
        preferencesCreated: 0,
        preferencesUpdated: 1,
        factsUpserted: 0,
        patternsDetected: 0,
        behaviourSummaryUpdated: false,
        errors: [],
      });

      const summary = processor.summarizeSignalBatch(signals, results);

      expect(summary.totalAccepted).toBe(2);
      expect(summary.totalRejected).toBe(0);
      expect(summary.processed).toHaveLength(2);
    });
  });
});
