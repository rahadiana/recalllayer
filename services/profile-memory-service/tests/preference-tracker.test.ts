import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";

import { PreferenceTracker } from "../src/preference-tracker.js";

describe("PreferenceTracker", () => {
  let tracker: PreferenceTracker;

  beforeEach(() => {
    tracker = new PreferenceTracker(0.7);
  });

  describe("analyzeSearchQueries", () => {
    it("detects concise response preference from query patterns", () => {
      const queries = [
        "give me a concise summary of AI",
        "short answer please",
        "brief explanation of machine learning",
        "be concise about neural networks",
      ];

      const result = tracker.analyzeSearchQueries(queries);

      const responseStyle = result.detectedPreferences.find(
        (p) => p.key === "response_style",
      );
      expect(responseStyle).toBeDefined();
      expect(responseStyle!.value).toBe("concise");
      expect(responseStyle!.source).toBe("inferred");
      expect(responseStyle!.confidence).toBeGreaterThan(0);
    });

    it("detects detailed response preference", () => {
      const queries = [
        "explain in detail how transformers work",
        "comprehensive guide to react hooks",
        "in-depth analysis of database indexing",
        "thorough explanation of kubernetes",
      ];

      const result = tracker.analyzeSearchQueries(queries);

      const responseStyle = result.detectedPreferences.find(
        (p) => p.key === "response_style",
      );
      expect(responseStyle).toBeDefined();
      expect(responseStyle!.value).toBe("detailed");
    });

    it("detects Indonesian language preference", () => {
      const queries = [
        "bagaimana cara menggunakan react",
        "tolong jelaskan tentang machine learning",
        "cara deploy next.js ke vercel",
        "bantuan untuk setup typescript",
        "artikel tentang artificial intelligence",
      ];

      const result = tracker.analyzeSearchQueries(queries);

      const language = result.detectedPreferences.find(
        (p) => p.key === "language",
      );
      expect(language).toBeDefined();
      expect(language!.value).toBe("id");
    });

    it("detects English language preference", () => {
      const queries = [
        "how to use react hooks",
        "please explain typescript generics",
        "can you help with docker setup",
        "what is kubernetes used for",
        "explain the concept of RAG",
      ];

      const result = tracker.analyzeSearchQueries(queries);

      const language = result.detectedPreferences.find(
        (p) => p.key === "language",
      );
      expect(language).toBeDefined();
      expect(language!.value).toBe("en");
    });

    it("detects domain interests from tech keywords", () => {
      const queries = [
        "how to train a neural network with pytorch",
        "machine learning pipeline with tensorflow",
        "deep learning tutorial for beginners",
      ];

      const result = tracker.analyzeSearchQueries(queries);

      const domains = result.detectedPreferences.find(
        (p) => p.key === "domain_interests",
      );
      expect(domains).toBeDefined();
      expect(domains!.value).toContain("ai_ml");
    });

    it("returns empty analysis for empty queries", () => {
      const result = tracker.analyzeSearchQueries([]);
      expect(result.detectedPreferences).toHaveLength(0);
      expect(result.detectedPatterns).toHaveLength(0);
    });

    it("includes detected patterns in the result", () => {
      const queries = [
        "concise answer about docker",
        "brief summary of kubernetes",
        "short explanation of terraform",
      ];

      const result = tracker.analyzeSearchQueries(queries);

      expect(result.detectedPatterns.length).toBeGreaterThan(0);
      const pattern = result.detectedPatterns[0];
      expect(pattern).toHaveProperty("category");
      expect(pattern).toHaveProperty("value");
      expect(pattern).toHaveProperty("confidence");
      expect(pattern).toHaveProperty("evidence");
      expect(pattern).toHaveProperty("detected_at");
    });
  });

  describe("analyzeFeedback", () => {
    it("detects high satisfaction from positive ratings", () => {
      const feedback = [
        { rating: 5, comment: "Great results!" },
        { rating: 4, comment: "Very helpful" },
        { rating: 5, comment: "Perfect" },
      ];

      const result = tracker.analyzeFeedback(feedback);

      const satisfaction = result.detectedPatterns.find(
        (p) => p.category === "satisfaction",
      );
      expect(satisfaction).toBeDefined();
      expect(satisfaction!.value).toBe("high");
    });

    it("detects low satisfaction from negative ratings", () => {
      const feedback = [
        { rating: 1, comment: "Not helpful" },
        { rating: 2, comment: "Poor results" },
        { rating: 1, comment: "Bad" },
      ];

      const result = tracker.analyzeFeedback(feedback);

      const satisfaction = result.detectedPatterns.find(
        (p) => p.category === "satisfaction",
      );
      expect(satisfaction).toBeDefined();
      expect(satisfaction!.value).toBe("low");
    });

    it("returns empty for insufficient feedback entries", () => {
      const feedback = [{ rating: 4 }];

      const result = tracker.analyzeFeedback(feedback);
      expect(result.detectedPreferences).toHaveLength(0);
    });
  });

  describe("analyzeExplicitSettings", () => {
    it("converts settings to explicit preferences", () => {
      const settings = {
        theme: "dark",
        language: "id",
        notification_enabled: false,
      };

      const preferences = tracker.analyzeExplicitSettings(settings);

      expect(preferences).toHaveLength(3);
      expect(preferences[0]).toEqual({
        key: "theme",
        value: "dark",
        source: "explicit",
        confidence: 1.0,
      });
    });

    it("returns empty array for empty settings", () => {
      const preferences = tracker.analyzeExplicitSettings({});
      expect(preferences).toHaveLength(0);
    });
  });
});
