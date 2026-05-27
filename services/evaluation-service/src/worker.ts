import { createLogger, type Logger } from "@memory-platform/observability";
import type { Queue, Message } from "@memory-platform/queue";
import type { EvalRepository } from "./repository.js";
import type { EvalRunner } from "./eval-runner.js";
import type { FeedbackCollector } from "./feedback-collector.js";
import type {
  EvaluationRunRequestedPayload,
  RetrievalFeedbackRecordedPayload,
} from "./types.js";

export function registerWorker(
  queue: Queue,
  repository: EvalRepository,
  evalRunner: EvalRunner,
  feedbackCollector: FeedbackCollector,
): () => void {
  const logger: Logger = createLogger("evaluation:worker");
  const unsubscribers: Array<() => void> = [];

  const evalRunUnsub = queue.process<EvaluationRunRequestedPayload>(
    "evaluation.run.requested",
    async (message: Message<EvaluationRunRequestedPayload>) => {
      const { run_id, workspace_id, dataset_id, config } = message.event.payload;

      logger.info("Worker received evaluation.run.requested", {
        runId: run_id,
        datasetId: dataset_id,
      });

      try {
        const run = await repository.getRun(run_id);
        if (!run) {
          logger.warn("Run not found for evaluation.run.requested", { runId: run_id });
          return;
        }

        if (run.status !== "pending") {
          logger.info("Skipping non-pending run", { runId: run_id, status: run.status });
          return;
        }

        await evalRunner.executeRun(
          run_id,
          workspace_id,
          dataset_id,
          config,
          "worker",
        );
      } catch (err) {
        logger.error("Worker failed to execute eval run", {
          runId: run_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  unsubscribers.push(evalRunUnsub);

  const feedbackUnsub = queue.process<RetrievalFeedbackRecordedPayload>(
    "retrieval.feedback.recorded",
    async (message: Message<RetrievalFeedbackRecordedPayload>) => {
      const { feedback_id, workspace_id, query_id, user_id, rating } =
        message.event.payload;

      logger.info("Worker received retrieval.feedback.recorded", {
        feedbackId: feedback_id,
        queryId: query_id,
        rating,
      });

      try {
        await feedbackCollector.recordFeedback({
          workspaceId: workspace_id,
          queryId: query_id,
          userId: user_id,
          rating,
          chunkIds: [],
        });
      } catch (err) {
        logger.error("Worker failed to record feedback", {
          feedbackId: feedback_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  unsubscribers.push(feedbackUnsub);

  logger.info("Evaluation worker registered", {
    channels: ["evaluation.run.requested", "retrieval.feedback.recorded"],
  });

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
    logger.info("Evaluation worker unregistered");
  };
}
