import { createLogger, type Logger } from "@memory-platform/observability";
import type { Preference, UpsertPreferenceDto } from "@memory-platform/shared-schemas";
import type { DetectedPattern } from "./types.js";

const CONCISE_RESPONSE_INDICATORS = [
  "concise", "short answer", "brief", "to the point", "summary",
  "tl;dr", "quick", "bullet points", "summarize",
];

const DETAILED_RESPONSE_INDICATORS = [
  "detailed", "in-depth", "explain", "elaborate", "comprehensive",
  "step by step", "thorough", "full explanation", "expand",
];

const INDONESIAN_INDICATORS = [
  "indonesia", "bahasa indonesia", "tolong", "terima kasih",
  "bagaimana", "cara", "bantuan", "jelaskan", "artikel",
  "indonesian", "id-id", "id_id", "bahasa",
];

const ENGLISH_INDICATORS = [
  "explain", "help", "how to", "what is", "please", "thanks",
  "could you", "would you", "can you",
];

export interface PreferenceAnalysis {
  detectedPreferences: UpsertPreferenceDto[];
  detectedPatterns: DetectedPattern[];
}

export class PreferenceTracker {
  #log: Logger;
  #inferenceThreshold: number;

  constructor(inferenceThreshold: number = 0.7) {
    this.#log = createLogger("profile-memory:preference-tracker");
    this.#inferenceThreshold = inferenceThreshold;
  }

  analyzeSearchQueries(queries: string[]): PreferenceAnalysis {
    const preferences: UpsertPreferenceDto[] = [];
    const patterns: DetectedPattern[] = [];
    const now = new Date().toISOString();

    if (queries.length === 0) return { detectedPreferences: preferences, detectedPatterns: patterns };

    const allText = queries.join(" ").toLowerCase();

    const conciseHits = CONCISE_RESPONSE_INDICATORS.filter((kw) =>
      allText.includes(kw.toLowerCase()),
    ).length;
    const detailedHits = DETAILED_RESPONSE_INDICATORS.filter((kw) =>
      allText.includes(kw.toLowerCase()),
    ).length;

    if (conciseHits > detailedHits && conciseHits >= 2) {
      const confidence = Math.min(conciseHits / queries.length, 0.9);
      preferences.push({
        key: "response_style",
        value: "concise",
        source: "inferred",
        confidence,
      });
      patterns.push({
        category: "response_style",
        value: "concise",
        confidence,
        evidence: queries.map((_, i) => `query_${i}`),
        detected_at: now,
      });
    } else if (detailedHits > conciseHits && detailedHits >= 2) {
      const confidence = Math.min(detailedHits / queries.length, 0.9);
      preferences.push({
        key: "response_style",
        value: "detailed",
        source: "inferred",
        confidence,
      });
      patterns.push({
        category: "response_style",
        value: "detailed",
        confidence,
        evidence: queries.map((_, i) => `query_${i}`),
        detected_at: now,
      });
    }

    const indonesianHits = INDONESIAN_INDICATORS.filter((kw) =>
      allText.includes(kw.toLowerCase()),
    ).length;
    const englishHits = ENGLISH_INDICATORS.filter((kw) =>
      allText.includes(kw.toLowerCase()),
    ).length;

    if (indonesianHits > englishHits && indonesianHits >= 3) {
      const confidence = Math.min(indonesianHits / (indonesianHits + englishHits), 0.95);
      preferences.push({
        key: "language",
        value: "id",
        source: "inferred",
        confidence,
      });
      patterns.push({
        category: "language",
        value: "id",
        confidence,
        evidence: queries.map((_, i) => `query_${i}`),
        detected_at: now,
      });
    } else if (englishHits > indonesianHits && englishHits >= 3) {
      const confidence = Math.min(englishHits / (indonesianHits + englishHits), 0.95);
      preferences.push({
        key: "language",
        value: "en",
        source: "inferred",
        confidence,
      });
      patterns.push({
        category: "language",
        value: "en",
        confidence,
        evidence: queries.map((_, i) => `query_${i}`),
        detected_at: now,
      });
    }

    const domainKeywords = this.#extractDomainKeywords(allText);
    if (domainKeywords.length > 0) {
      preferences.push({
        key: "domain_interests",
        value: domainKeywords,
        source: "inferred",
        confidence: 0.6,
      });
      patterns.push({
        category: "domain_interests",
        value: domainKeywords.join(", "),
        confidence: 0.6,
        evidence: queries.map((_, i) => `query_${i}`),
        detected_at: now,
      });
    }

    this.#log.info("Search preference analysis complete", {
      queryCount: queries.length,
      preferenceCount: preferences.length,
      patternCount: patterns.length,
    });

    return { detectedPreferences: preferences, detectedPatterns: patterns };
  }

  analyzeFeedback(
    feedbackEntries: { rating: number; comment?: string }[],
  ): PreferenceAnalysis {
    const preferences: UpsertPreferenceDto[] = [];
    const patterns: DetectedPattern[] = [];
    const now = new Date().toISOString();

    if (feedbackEntries.length < 3) {
      return { detectedPreferences: preferences, detectedPatterns: patterns };
    }

    const avgRating =
      feedbackEntries.reduce((sum, f) => sum + f.rating, 0) / feedbackEntries.length;
    const allComments = feedbackEntries
      .filter((f) => f.comment)
      .map((f) => f.comment!)
      .join(" ")
      .toLowerCase();

    if (avgRating >= 4.0) {
      patterns.push({
        category: "satisfaction",
        value: "high",
        confidence: Math.min(avgRating / 5, 0.9),
        evidence: feedbackEntries.map((_, i) => `feedback_${i}`),
        detected_at: now,
      });
    } else if (avgRating <= 2.0) {
      patterns.push({
        category: "satisfaction",
        value: "low",
        confidence: Math.min((5 - avgRating) / 5, 0.9),
        evidence: feedbackEntries.map((_, i) => `feedback_${i}`),
        detected_at: now,
      });
    }

    const concisenessCommentHits = CONCISE_RESPONSE_INDICATORS.filter((kw) =>
      allComments.includes(kw.toLowerCase()),
    ).length;

    if (concisenessCommentHits >= 2) {
      preferences.push({
        key: "response_style",
        value: "concise",
        source: "inferred",
        confidence: 0.75,
      });
      patterns.push({
        category: "feedback_preference",
        value: "prefers_concise",
        confidence: 0.75,
        evidence: feedbackEntries.map((_, i) => `feedback_${i}`),
        detected_at: now,
      });
    }

    this.#log.info("Feedback analysis complete", {
      entryCount: feedbackEntries.length,
      avgRating: avgRating.toFixed(2),
    });

    return { detectedPreferences: preferences, detectedPatterns: patterns };
  }

  analyzeExplicitSettings(
    settings: Record<string, unknown>,
  ): UpsertPreferenceDto[] {
    const preferences: UpsertPreferenceDto[] = [];

    for (const [key, value] of Object.entries(settings)) {
      preferences.push({
        key,
        value,
        source: "explicit",
        confidence: 1.0,
      });
    }

    this.#log.info("Explicit settings analyzed", {
      settingCount: preferences.length,
    });

    return preferences;
  }

  #extractDomainKeywords(text: string): string[] {
    const techDomains: [string, string[]][] = [
      ["ai_ml", ["machine learning", "artificial intelligence", "neural network", "deep learning", "llm", "transformer"]],
      ["web_dev", ["react", "vue", "angular", "next.js", "node.js", "typescript", "javascript", "css", "html"]],
      ["data_engineering", ["pipeline", "etl", "data warehouse", "spark", "kafka", "postgres", "sql"]],
      ["devops", ["docker", "kubernetes", "cicd", "terraform", "aws", "cloud", "deployment"]],
      ["mobile", ["android", "ios", "react native", "flutter", "swift", "kotlin"]],
      ["security", ["authentication", "authorization", "encryption", "jwt", "oauth", "security"]],
    ];

    const found: string[] = [];
    for (const [domain, keywords] of techDomains) {
      const hits = keywords.filter((kw) => text.includes(kw.toLowerCase())).length;
      if (hits >= 1) {
        found.push(domain);
      }
    }
    return found;
  }
}
