import { createLogger, type Logger } from "@memory-platform/observability";
import type { BehaviorEvent, BehaviourSummary } from "@memory-platform/shared-schemas";
import type { DetectedPattern } from "./types.js";

export interface BehaviorAnalysisResult {
  patterns: DetectedPattern[];
  summaryUpdates: Partial<BehaviourSummary>;
  topSearchTerms: string[];
  topCategories: string[];
}

export class BehaviorAnalyzer {
  #log: Logger;

  constructor() {
    this.#log = createLogger("profile-memory:behavior-analyzer");
  }

  analyzeRecentEvents(events: BehaviorEvent[]): BehaviorAnalysisResult {
    const patterns: DetectedPattern[] = [];
    const now = new Date().toISOString();

    if (events.length === 0) {
      return {
        patterns,
        summaryUpdates: {},
        topSearchTerms: [],
        topCategories: [],
      };
    }

    const searchEvents = events.filter((e) => e.event_type === "search");
    const viewEvents = events.filter((e) => e.event_type === "document_view");
    const feedbackEvents = events.filter((e) => e.event_type === "feedback");

    const topSearchTerms = this.#extractSearchTerms(searchEvents);
    const topCategories = this.#extractCategories([...searchEvents, ...viewEvents]);

    const searchFrequency = this.#computeSearchFrequency(searchEvents);
    if (searchFrequency.pattern) {
      patterns.push(searchFrequency.pattern);
    }

    const activeHours = this.#computeActiveHours(events);
    if (activeHours.pattern) {
      patterns.push(activeHours.pattern);
    }

    const topicPatterns = this.#extractTopicPatterns(events);
    patterns.push(...topicPatterns);

    const summaryUpdates: Partial<BehaviourSummary> = {
      total_searches: searchEvents.length,
      total_document_views: viewEvents.length,
      top_search_terms: topSearchTerms,
      top_categories: topCategories,
      last_active_at: events.length > 0 ? events[events.length - 1].occurred_at : undefined,
    };

    if (feedbackEvents.length > 0) {
      const feedbackPattern = this.#analyzeFeedbackPattern(feedbackEvents, now);
      if (feedbackPattern) {
        patterns.push(feedbackPattern);
      }
    }

    this.#log.info("Behavior analysis complete", {
      eventCount: events.length,
      searchCount: searchEvents.length,
      viewCount: viewEvents.length,
      patternCount: patterns.length,
    });

    return { patterns, summaryUpdates, topSearchTerms, topCategories };
  }

  #extractSearchTerms(searchEvents: BehaviorEvent[]): string[] {
    const termCounts = new Map<string, number>();

    for (const event of searchEvents) {
      const query = event.payload?.query as string | undefined;
      if (!query) continue;

      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);
      for (const term of terms) {
        termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
      }
    }

    return [...termCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([term]) => term);
  }

  #extractCategories(events: BehaviorEvent[]): string[] {
    const categoryCounts = new Map<string, number>();

    for (const event of events) {
      const category = event.payload?.category as string | undefined;
      const tags = event.payload?.tags as string[] | undefined;

      if (category) {
        categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
      }
      if (tags) {
        for (const tag of tags) {
          categoryCounts.set(tag, (categoryCounts.get(tag) ?? 0) + 1);
        }
      }
    }

    return [...categoryCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([category]) => category);
  }

  #computeSearchFrequency(events: BehaviorEvent[]): { pattern: DetectedPattern | null } {
    if (events.length < 5) return { pattern: null };

    const timestamps = events
      .filter((e) => e.event_type === "search")
      .map((e) => new Date(e.occurred_at).getTime())
      .sort((a, b) => a - b);

    if (timestamps.length < 2) return { pattern: null };

    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const avgIntervalHours = avgInterval / (1000 * 60 * 60);

    const now = new Date().toISOString();

    if (avgIntervalHours < 0.5) {
      return {
        pattern: {
          category: "search_frequency",
          value: "very_active",
          confidence: 0.8,
          evidence: events.slice(0, 10).map((e) => e.id),
          detected_at: now,
        },
      };
    } else if (avgIntervalHours < 4) {
      return {
        pattern: {
          category: "search_frequency",
          value: "active",
          confidence: 0.7,
          evidence: events.slice(0, 10).map((e) => e.id),
          detected_at: now,
        },
      };
    }

    return { pattern: null };
  }

  #computeActiveHours(events: BehaviorEvent[]): { pattern: DetectedPattern | null } {
    if (events.length < 10) return { pattern: null };

    const hourCounts = new Array(24).fill(0);
    for (const event of events) {
      const hour = new Date(event.occurred_at).getHours();
      hourCounts[hour]++;
    }

    const total = events.length;
    const morningPercent =
      hourCounts.slice(6, 12).reduce((a, b) => a + b, 0) / total;
    const afternoonPercent =
      hourCounts.slice(12, 18).reduce((a, b) => a + b, 0) / total;
    const eveningPercent =
      hourCounts.slice(18, 24).reduce((a, b) => a + b, 0) / total;

    const now = new Date().toISOString();
    const timeOfDay =
      morningPercent > 0.4 ? "morning"
      : afternoonPercent > 0.4 ? "afternoon"
      : eveningPercent > 0.4 ? "evening"
      : null;

    if (timeOfDay) {
      return {
        pattern: {
          category: "active_hours",
          value: timeOfDay,
          confidence: Math.max(morningPercent, afternoonPercent, eveningPercent),
          evidence: events.slice(0, 5).map((e) => e.id),
          detected_at: now,
        },
      };
    }

    return { pattern: null };
  }

  #extractTopicPatterns(events: BehaviorEvent[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const topicCounts = new Map<string, { count: number; events: string[] }>();
    const now = new Date().toISOString();

    for (const event of events) {
      const topics = event.payload?.topics as string[] | undefined;
      if (!topics) continue;

      for (const topic of topics) {
        const entry = topicCounts.get(topic) ?? { count: 0, events: [] };
        entry.count++;
        entry.events.push(event.id);
        topicCounts.set(topic, entry);
      }
    }

    const totalEvents = events.length || 1;
    for (const [topic, { count, events: evtIds }] of topicCounts) {
      const proportion = count / totalEvents;
      if (proportion > 0.3 && count >= 3) {
        patterns.push({
          category: "topic_interest",
          value: topic,
          confidence: Math.min(proportion, 0.9),
          evidence: evtIds.slice(0, 10),
          detected_at: now,
        });
      }
    }

    return patterns;
  }

  #analyzeFeedbackPattern(
    feedbackEvents: BehaviorEvent[],
    now: string,
  ): DetectedPattern | null {
    const ratings: number[] = [];

    for (const event of feedbackEvents) {
      const rating = event.payload?.rating as number | undefined;
      if (typeof rating === "number") {
        ratings.push(rating);
      }
    }

    if (ratings.length < 3) return null;

    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

    if (avgRating >= 4.0) {
      return {
        category: "feedback_sentiment",
        value: "positive",
        confidence: Math.min(avgRating / 5, 0.9),
        evidence: feedbackEvents.map((e) => e.id),
        detected_at: now,
      };
    } else if (avgRating <= 2.0) {
      return {
        category: "feedback_sentiment",
        value: "negative",
        confidence: Math.min((5 - avgRating) / 5, 0.9),
        evidence: feedbackEvents.map((e) => e.id),
        detected_at: now,
      };
    }

    return null;
  }
}
