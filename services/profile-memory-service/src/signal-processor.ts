import { createLogger, type Logger } from "@memory-platform/observability";
import type { WorkspaceId, UserId } from "@memory-platform/shared-schemas";
import { generateId } from "@memory-platform/shared-utils";
import type { ProfileSignal, DetectedPattern } from "./types.js";
import type { PreferenceAnalysis } from "./preference-tracker.js";
import type { BehaviorAnalysisResult } from "./behavior-analyzer.js";

export interface ProcessedSignal {
  signalId: string;
  workspaceId: WorkspaceId;
  userId: UserId;
  signalType: string;
  preferencesCreated: number;
  preferencesUpdated: number;
  factsUpserted: number;
  patternsDetected: number;
  behaviourSummaryUpdated: boolean;
  errors: string[];
}

export interface SignalBatchResult {
  processed: ProcessedSignal[];
  totalAccepted: number;
  totalRejected: number;
}

export class SignalProcessor {
  #log: Logger;

  constructor() {
    this.#log = createLogger("profile-memory:signal-processor");
  }

  processSearchSignal(
    workspaceId: WorkspaceId,
    userId: UserId,
    payload: Record<string, unknown>,
  ): {
    behaviorEventPayload: Record<string, unknown>;
    searchTerms: string[];
    category?: string;
    tags?: string[];
  } {
    const query = payload.query as string | undefined ?? "";
    const resultsCount = payload.result_count as number | undefined ?? 0;
    const latency = payload.latency_ms as number | undefined ?? 0;
    const filters = payload.filters as Record<string, unknown> | undefined ?? {};

    const searchTerms = query
      ? query
          .toLowerCase()
          .split(/\s+/)
          .filter((t: string) => t.length > 2)
      : [];

    const behaviorPayload: Record<string, unknown> = {
      query,
      result_count: resultsCount,
      latency_ms: latency,
      filters,
      search_terms: searchTerms,
    };

    const category = payload.category as string | undefined;
    const tags = payload.tags as string[] | undefined;
    if (category) behaviorPayload.category = category;
    if (tags) behaviorPayload.tags = tags;

    this.#log.debug("Search signal processed", {
      workspaceId: workspaceId as string,
      userId,
      queryLength: query.length,
      resultCount: resultsCount,
    });

    return { behaviorEventPayload: behaviorPayload, searchTerms, category, tags };
  }

  processDocumentViewSignal(
    workspaceId: WorkspaceId,
    userId: UserId,
    payload: Record<string, unknown>,
  ): {
    behaviorEventPayload: Record<string, unknown>;
    category?: string;
    topics?: string[];
  } {
    const documentId = payload.document_id as string | undefined ?? "unknown";
    const documentTitle = payload.document_title as string | undefined ?? "";
    const category = payload.category as string | undefined;
    const topics = payload.topics as string[] | undefined;

    const behaviorPayload: Record<string, unknown> = {
      document_id: documentId,
      document_title: documentTitle,
      view_duration_ms: payload.view_duration_ms,
      scroll_depth: payload.scroll_depth,
    };
    if (category) behaviorPayload.category = category;
    if (topics) behaviorPayload.topics = topics;

    this.#log.debug("Document view signal processed", {
      workspaceId: workspaceId as string,
      userId,
      documentId,
    });

    return { behaviorEventPayload: behaviorPayload, category, topics };
  }

  processFeedbackSignal(
    _workspaceId: WorkspaceId,
    _userId: UserId,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      rating: payload.rating,
      comment: payload.comment,
      target_type: payload.target_type,
      target_id: payload.target_id,
    };
  }

  processSettingChangeSignal(
    _workspaceId: WorkspaceId,
    _userId: UserId,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      settings: payload.settings ?? {},
      changed_keys: payload.changed_keys ?? [],
    };
  }

  mergePreferenceAnalyses(analyses: PreferenceAnalysis[]): PreferenceAnalysis {
    const merged: PreferenceAnalysis = {
      detectedPreferences: [],
      detectedPatterns: [],
    };

    const prefMap = new Map<string, PreferenceAnalysis["detectedPreferences"][0]>();

    for (const analysis of analyses) {
      for (const pref of analysis.detectedPreferences) {
        const existing = prefMap.get(pref.key);
        if (!existing || (pref.confidence ?? 0) > (existing.confidence ?? 0)) {
          prefMap.set(pref.key, pref);
        } else if (existing.source === "inferred" && pref.source === "explicit") {
          prefMap.set(pref.key, pref);
        }
      }
      merged.detectedPatterns.push(...analysis.detectedPatterns);
    }

    merged.detectedPreferences = [...prefMap.values()];

    return merged;
  }

  summarizeSignalBatch(
    signals: ProfileSignal[],
    results: Map<string, Omit<ProcessedSignal, "signalId">>,
  ): SignalBatchResult {
    const processed: ProcessedSignal[] = [];
    let totalAccepted = 0;
    let totalRejected = 0;

    for (const signal of signals) {
      const result = results.get(signal.payload?.__signal_ref as string ?? generateId());
      if (result) {
        const errors: string[] = [];
        processed.push({
          signalId: generateId(),
          workspaceId: signal.workspace_id,
          userId: signal.user_id,
          signalType: signal.signal_type,
          preferencesCreated: result.preferencesCreated,
          preferencesUpdated: result.preferencesUpdated,
          factsUpserted: result.factsUpserted,
          patternsDetected: result.patternsDetected,
          behaviourSummaryUpdated: result.behaviourSummaryUpdated,
          errors,
        });
        totalAccepted++;
      } else {
        totalRejected++;
      }
    }

    this.#log.info("Signal batch processed", {
      accepted: totalAccepted,
      rejected: totalRejected,
    });

    return { processed, totalAccepted, totalRejected };
  }
}
