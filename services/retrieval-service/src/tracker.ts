import { createLogger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { WorkspaceId, Timestamp } from "@memory-platform/shared-schemas";
import type { SearchLogEntry, SearchFeedback } from "./types.js";

export interface SearchTracker {
  logSearch(entry: Omit<SearchLogEntry, "id" | "created_at">): SearchLogEntry;
  logFeedback(feedback: Omit<SearchFeedback, "search_log_id">, searchLogId: string): SearchFeedback;
  getLogs(workspaceId: WorkspaceId, limit?: number): SearchLogEntry[];
  getLogById(logId: string): SearchLogEntry | undefined;
  clear(): void;
}

export function createSearchTracker(): SearchTracker {
  const logger = createLogger("retrieval:tracker");
  const logs: SearchLogEntry[] = [];
  const feedbackMap = new Map<string, SearchFeedback>();

  return {
    logSearch(entry: Omit<SearchLogEntry, "id" | "created_at">): SearchLogEntry {
      const now = new Date().toISOString() as Timestamp;
      const logEntry: SearchLogEntry = {
        ...entry,
        id: generateId("search_"),
        created_at: now,
      };

      logs.push(logEntry);
      logger.info("Search logged", {
        queryId: entry.query_id,
        resultCount: entry.result_count,
        latencyMs: entry.latency_ms,
      });

      if (logs.length > 10000) {
        logs.splice(0, logs.length - 10000);
      }

      return logEntry;
    },

    logFeedback(
      feedback: Omit<SearchFeedback, "search_log_id">,
      searchLogId: string,
    ): SearchFeedback {
      const entry: SearchFeedback = {
        ...feedback,
        search_log_id: searchLogId,
      };

      feedbackMap.set(searchLogId, entry);
      logger.info("Feedback logged", {
        searchLogId,
        rating: feedback.rating,
      });

      const logEntry = logs.find((l) => l.id === searchLogId);
      if (logEntry) {
        logEntry.feedback = entry;
      }

      return entry;
    },

    getLogs(workspaceId: WorkspaceId, limit = 100): SearchLogEntry[] {
      return logs
        .filter((l) => l.workspace_id === workspaceId)
        .slice(-limit)
        .reverse();
    },

    getLogById(logId: string): SearchLogEntry | undefined {
      return logs.find((l) => l.id === logId);
    },

    clear(): void {
      logs.length = 0;
      feedbackMap.clear();
    },
  };
}
