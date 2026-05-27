import type { Logger } from "@memory-platform/observability";
import type { Publisher } from "@memory-platform/queue";
import type { EventEnvelope } from "@memory-platform/queue";
import { generateId } from "@memory-platform/shared-utils";
import type {
  EvaluationCompletedPayload,
  RetrievalQualityReportedPayload,
} from "./types.js";

export interface EvalEventPublisher {
  publishEvaluationCompleted(payload: EvaluationCompletedPayload): Promise<string>;
  publishRetrievalQualityReported(payload: RetrievalQualityReportedPayload): Promise<string>;
}

export function createEvalEvents(
  publisher: Publisher,
  logger: Logger,
): EvalEventPublisher {
  const EVAL_CHANNEL = "evaluation";

  function buildEnvelope<T extends Record<string, unknown>>(
    type: string,
    payload: T,
    workspaceId?: string,
  ): EventEnvelope<T> {
    return {
      id: generateId(),
      type,
      timestamp: new Date().toISOString(),
      payload,
      metadata: workspaceId ? { workspace_id: workspaceId } : undefined,
    };
  }

  return {
    async publishEvaluationCompleted(
      payload: EvaluationCompletedPayload,
    ): Promise<string> {
      const envelope = buildEnvelope(
        "evaluation.completed",
        payload as unknown as Record<string, unknown>,
        payload.workspace_id,
      );

      logger.info("Publishing evaluation.completed", {
        runId: payload.run_id,
        status: payload.status,
      });

      const eventId = await publisher.publish(EVAL_CHANNEL, envelope);
      return eventId;
    },

    async publishRetrievalQualityReported(
      payload: RetrievalQualityReportedPayload,
    ): Promise<string> {
      const envelope = buildEnvelope(
        "retrieval.quality.reported",
        payload as unknown as Record<string, unknown>,
        payload.workspace_id as string,
      );

      logger.info("Publishing retrieval.quality.reported", {
        reportId: payload.report_id,
        quality: payload.overall_quality,
      });

      const eventId = await publisher.publish(EVAL_CHANNEL, envelope);
      return eventId;
    },
  };
}
