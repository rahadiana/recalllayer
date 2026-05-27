import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { FeedbackRating } from "@memory-platform/shared-schemas";
import type { EvalRepository } from "./repository.js";
import type { EvalEventPublisher } from "./events.js";
import type { HumanFeedbackRow } from "./types.js";

export interface FeedbackCollector {
  recordFeedback(params: {
    workspaceId: string;
    queryId: string;
    userId: string;
    rating: FeedbackRating;
    comment?: string;
    chunkIds: string[];
  }): Promise<HumanFeedbackRow>;
  getFeedbackSummary(workspaceId: string): Promise<{
    total: number;
    relevant: number;
    partiallyRelevant: number;
    notRelevant: number;
    satisfactionRate: number;
  }>;
}

export function createFeedbackCollector(
  repository: EvalRepository,
  events: EvalEventPublisher,
): FeedbackCollector {
  const logger: Logger = createLogger("evaluation:feedback-collector");

  return {
    async recordFeedback(params): Promise<HumanFeedbackRow> {
      const { workspaceId, queryId, userId, rating, comment, chunkIds } = params;

      logger.info("Recording feedback", {
        workspaceId,
        queryId,
        rating,
      });

      const feedback = await repository.saveFeedback({
        workspace_id: workspaceId,
        query_id: queryId,
        user_id: userId,
        rating,
        comment: comment ?? null,
        chunk_ids: chunkIds,
      });

      await events.publishRetrievalQualityReported({
        report_id: generateId("rpt_"),
        run_id: "",
        workspace_id: workspaceId as import("@memory-platform/shared-schemas").WorkspaceId,
        overall_quality: rating === "relevant" ? "excellent" : rating === "partially_relevant" ? "fair" : "poor",
        hallucination_risk_score: rating === "not_relevant" ? 0.8 : rating === "partially_relevant" ? 0.4 : 0.1,
        metrics_summary: { mrr: 0, ndcg: 0, map: 0 },
      });

      return feedback;
    },

    async getFeedbackSummary(workspaceId: string): Promise<{
      total: number;
      relevant: number;
      partiallyRelevant: number;
      notRelevant: number;
      satisfactionRate: number;
    }> {
      const feedback = await repository.getFeedback(workspaceId, 1000, 0);

      const relevant = feedback.filter((f) => f.rating === "relevant").length;
      const partiallyRelevant = feedback.filter((f) => f.rating === "partially_relevant").length;
      const notRelevant = feedback.filter((f) => f.rating === "not_relevant").length;
      const total = feedback.length;

      return {
        total,
        relevant,
        partiallyRelevant,
        notRelevant,
        satisfactionRate: total > 0 ? (relevant + partiallyRelevant * 0.5) / total : 0,
      };
    },
  };
}
