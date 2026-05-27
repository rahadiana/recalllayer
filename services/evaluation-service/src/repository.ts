import type { PostgresPool } from "@memory-platform/db";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type {
  EvalDatasetRow,
  EvalDatasetItemRow,
  EvalRunRow,
  RetrievalScoreRow,
  HumanFeedbackRow,
  EvalRunStatus,
  FeedbackRating,
  EvalRunConfig,
  EvalMetrics,
} from "./types.js";

export interface EvalRepository {
  createDataset(
    workspaceId: string,
    name: string,
    description?: string,
    items?: Array<Omit<EvalDatasetItemRow, "id" | "dataset_id">>,
  ): Promise<EvalDatasetRow>;
  getDataset(id: string): Promise<EvalDatasetRow | null>;
  listDatasets(workspaceId: string, limit?: number, offset?: number): Promise<EvalDatasetRow[]>;
  addDatasetItems(datasetId: string, items: Array<Omit<EvalDatasetItemRow, "id" | "dataset_id">>): Promise<EvalDatasetItemRow[]>;
  getDatasetItems(datasetId: string): Promise<EvalDatasetItemRow[]>;
  deleteDataset(id: string): Promise<void>;

  createRun(
    workspaceId: string,
    datasetId: string,
    config: EvalRunConfig,
    createdBy: string,
  ): Promise<EvalRunRow>;
  getRun(id: string): Promise<EvalRunRow | null>;
  listRuns(workspaceId: string, datasetId?: string, limit?: number, offset?: number): Promise<EvalRunRow[]>;
  updateRunStatus(id: string, status: EvalRunStatus, errorMessage?: string): Promise<void>;
  updateRunMetrics(id: string, metrics: EvalMetrics): Promise<void>;
  setRunStarted(id: string): Promise<void>;
  setRunCompleted(id: string): Promise<void>;

  saveRetrievalScores(scores: Array<Omit<RetrievalScoreRow, "id">>): Promise<RetrievalScoreRow[]>;
  getRetrievalScores(runId: string): Promise<RetrievalScoreRow[]>;

  saveFeedback(feedback: Omit<HumanFeedbackRow, "id" | "created_at">): Promise<HumanFeedbackRow>;
  getFeedback(workspaceId: string, limit?: number, offset?: number): Promise<HumanFeedbackRow[]>;
  getFeedbackByQueryId(queryId: string): Promise<HumanFeedbackRow[]>;
}

export function createEvalRepository(pool: PostgresPool): EvalRepository {
  const logger: Logger = createLogger("evaluation:repository");
  const { sql } = pool;

  function toCamelRows<T>(rows: unknown[]): T[] {
    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      const converted: Record<string, unknown> = {};
      for (const key of Object.keys(r)) {
        const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        converted[camelKey] = r[key];
      }
      return converted as unknown as T;
    });
  }

  return {
    // ─── Datasets ───────────────────────────────────────────────────────

    async createDataset(
      workspaceId: string,
      name: string,
      description?: string,
      items?: Array<Omit<EvalDatasetItemRow, "id" | "dataset_id">>,
    ): Promise<EvalDatasetRow> {
      const id = generateId("ds_");
      const now = new Date().toISOString();
      const itemCount = items?.length ?? 0;

      const [result] = await sql`
        INSERT INTO eval_datasets (id, workspace_id, name, description, item_count, metadata, created_at, updated_at)
        VALUES (${id}, ${workspaceId}, ${name}, ${description ?? null}, ${itemCount}, ${sql.json({})}, ${now}, ${now})
        RETURNING *
      `;

      if (items && items.length > 0) {
        const itemRows = items.map((item) => ({
          id: generateId("dsi_"),
          dataset_id: id,
          query: item.query,
          relevant_document_ids: item.relevant_document_ids,
          partially_relevant_document_ids: item.partially_relevant_document_ids ?? null,
          non_relevant_document_ids: item.non_relevant_document_ids ?? null,
        }));

        await sql`
          INSERT INTO eval_dataset_items ${sql(itemRows, "id", "dataset_id", "query", "relevant_document_ids", "partially_relevant_document_ids", "non_relevant_document_ids")}
        `;
      }

      logger.info("Dataset created", { datasetId: id, name, itemCount });

      const row = result as Record<string, unknown>;
      return {
        id: row.id as string,
        workspace_id: row.workspace_id as string,
        name: row.name as string,
        description: row.description as string | null,
        item_count: row.item_count as number,
        metadata: row.metadata as Record<string, unknown>,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
      };
    },

    async getDataset(id: string): Promise<EvalDatasetRow | null> {
      const rows = await sql`SELECT * FROM eval_datasets WHERE id = ${id}`;
      if (rows.length === 0) return null;
      const r = rows[0] as Record<string, unknown>;
      return {
        id: r.id as string,
        workspace_id: r.workspace_id as string,
        name: r.name as string,
        description: r.description as string | null,
        item_count: r.item_count as number,
        metadata: r.metadata as Record<string, unknown>,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
      };
    },

    async listDatasets(workspaceId: string, limit = 50, offset = 0): Promise<EvalDatasetRow[]> {
      const rows = await sql`
        SELECT * FROM eval_datasets
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      return toCamelRows<EvalDatasetRow>(rows);
    },

    async addDatasetItems(
      datasetId: string,
      items: Array<Omit<EvalDatasetItemRow, "id" | "dataset_id">>,
    ): Promise<EvalDatasetItemRow[]> {
      const itemRows = items.map((item) => ({
        id: generateId("dsi_"),
        dataset_id: datasetId,
        query: item.query,
        relevant_document_ids: item.relevant_document_ids,
        partially_relevant_document_ids: item.partially_relevant_document_ids ?? null,
        non_relevant_document_ids: item.non_relevant_document_ids ?? null,
      }));

      const inserted = await sql`
        INSERT INTO eval_dataset_items ${sql(itemRows, "id", "dataset_id", "query", "relevant_document_ids", "partially_relevant_document_ids", "non_relevant_document_ids")}
        RETURNING *
      `;

      await sql`
        UPDATE eval_datasets
        SET item_count = (
          SELECT COUNT(*) FROM eval_dataset_items WHERE dataset_id = ${datasetId}
        ), updated_at = ${new Date().toISOString()}
        WHERE id = ${datasetId}
      `;

      logger.info("Dataset items added", { datasetId, count: itemRows.length });
      return toCamelRows<EvalDatasetItemRow>(inserted);
    },

    async getDatasetItems(datasetId: string): Promise<EvalDatasetItemRow[]> {
      const rows = await sql`
        SELECT * FROM eval_dataset_items WHERE dataset_id = ${datasetId} ORDER BY id
      `;
      return toCamelRows<EvalDatasetItemRow>(rows);
    },

    async deleteDataset(id: string): Promise<void> {
      await sql`DELETE FROM eval_dataset_items WHERE dataset_id = ${id}`;
      await sql`DELETE FROM eval_datasets WHERE id = ${id}`;
      logger.info("Dataset deleted", { datasetId: id });
    },

    // ─── Runs ────────────────────────────────────────────────────────────

    async createRun(
      workspaceId: string,
      datasetId: string,
      config: EvalRunConfig,
      createdBy: string,
    ): Promise<EvalRunRow> {
      const id = generateId("run_");
      const now = new Date().toISOString();

      const [result] = await sql`
        INSERT INTO eval_runs (id, workspace_id, dataset_id, config, metrics, status, error_message, started_at, completed_at, created_by, created_at)
        VALUES (${id}, ${workspaceId}, ${datasetId}, ${sql.json(config as unknown as never)}, NULL, 'pending', NULL, NULL, NULL, ${createdBy}, ${now})
        RETURNING *
      `;

      logger.info("Eval run created", { runId: id, datasetId, workspaceId });

      const r = result as Record<string, unknown>;
      return {
        id: r.id as string,
        workspace_id: r.workspace_id as string,
        dataset_id: r.dataset_id as string,
        config: (r.config as EvalRunConfig) ?? config,
        metrics: (r.metrics as EvalMetrics) ?? null,
        status: (r.status as EvalRunStatus) ?? "pending",
        error_message: r.error_message as string | null,
        started_at: r.started_at as string | null,
        completed_at: r.completed_at as string | null,
        created_by: r.created_by as string,
        created_at: r.created_at as string,
      };
    },

    async getRun(id: string): Promise<EvalRunRow | null> {
      const rows = await sql`SELECT * FROM eval_runs WHERE id = ${id}`;
      if (rows.length === 0) return null;
      const r = rows[0] as Record<string, unknown>;
      return {
        id: r.id as string,
        workspace_id: r.workspace_id as string,
        dataset_id: r.dataset_id as string,
        config: r.config as EvalRunConfig,
        metrics: r.metrics as EvalMetrics | null,
        status: r.status as EvalRunStatus,
        error_message: r.error_message as string | null,
        started_at: r.started_at as string | null,
        completed_at: r.completed_at as string | null,
        created_by: r.created_by as string,
        created_at: r.created_at as string,
      };
    },

    async listRuns(
      workspaceId: string,
      datasetId?: string,
      limit = 50,
      offset = 0,
    ): Promise<EvalRunRow[]> {
      let rows;
      if (datasetId) {
        rows = await sql`
          SELECT * FROM eval_runs
          WHERE workspace_id = ${workspaceId} AND dataset_id = ${datasetId}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else {
        rows = await sql`
          SELECT * FROM eval_runs
          WHERE workspace_id = ${workspaceId}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }
      return toCamelRows<EvalRunRow>(rows);
    },

    async updateRunStatus(id: string, status: EvalRunStatus, errorMessage?: string): Promise<void> {
      await sql`
        UPDATE eval_runs
        SET status = ${status}, error_message = ${errorMessage ?? null}
        WHERE id = ${id}
      `;
    },

    async updateRunMetrics(id: string, metrics: EvalMetrics): Promise<void> {
      await sql`
        UPDATE eval_runs
        SET metrics = ${sql.json(metrics as unknown as never)}
        WHERE id = ${id}
      `;
    },

    async setRunStarted(id: string): Promise<void> {
      await sql`
        UPDATE eval_runs
        SET status = 'running', started_at = ${new Date().toISOString()}
        WHERE id = ${id}
      `;
    },

    async setRunCompleted(id: string): Promise<void> {
      await sql`
        UPDATE eval_runs
        SET status = 'completed', completed_at = ${new Date().toISOString()}
        WHERE id = ${id}
      `;
    },

    // ─── Retrieval Scores ────────────────────────────────────────────────

    async saveRetrievalScores(
      scores: Array<Omit<RetrievalScoreRow, "id">>,
    ): Promise<RetrievalScoreRow[]> {
      const scoreRows = scores.map((s) => ({
        id: generateId("rs_"),
        run_id: s.run_id,
        dataset_item_id: s.dataset_item_id,
        query: s.query,
        retrieved_document_ids: s.retrieved_document_ids,
        precision: s.precision,
        recall: s.recall,
        latency_ms: s.latency_ms,
      }));

      const inserted = await sql`
        INSERT INTO retrieval_scores ${sql(scoreRows, "id", "run_id", "dataset_item_id", "query", "retrieved_document_ids", "precision", "recall", "latency_ms")}
        RETURNING *
      `;

      logger.info("Retrieval scores saved", { runId: scores[0]?.run_id, count: scores.length });
      return toCamelRows<RetrievalScoreRow>(inserted);
    },

    async getRetrievalScores(runId: string): Promise<RetrievalScoreRow[]> {
      const rows = await sql`
        SELECT * FROM retrieval_scores WHERE run_id = ${runId} ORDER BY id
      `;
      return toCamelRows<RetrievalScoreRow>(rows);
    },

    // ─── Feedback ────────────────────────────────────────────────────────

    async saveFeedback(
      feedback: Omit<HumanFeedbackRow, "id" | "created_at">,
    ): Promise<HumanFeedbackRow> {
      const id = generateId("fb_");
      const now = new Date().toISOString();

      const [result] = await sql`
        INSERT INTO human_feedback (id, workspace_id, query_id, user_id, rating, comment, chunk_ids, created_at)
        VALUES (${id}, ${feedback.workspace_id}, ${feedback.query_id}, ${feedback.user_id}, ${feedback.rating}, ${feedback.comment ?? null}, ${feedback.chunk_ids}, ${now})
        RETURNING *
      `;

      logger.info("Feedback saved", { feedbackId: id, queryId: feedback.query_id, rating: feedback.rating });

      const r = result as Record<string, unknown>;
      return {
        id: r.id as string,
        workspace_id: r.workspace_id as string,
        query_id: r.query_id as string,
        user_id: r.user_id as string,
        rating: r.rating as FeedbackRating,
        comment: r.comment as string | null,
        chunk_ids: r.chunk_ids as string[],
        created_at: r.created_at as string,
      };
    },

    async getFeedback(workspaceId: string, limit = 50, offset = 0): Promise<HumanFeedbackRow[]> {
      const rows = await sql`
        SELECT * FROM human_feedback
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      return toCamelRows<HumanFeedbackRow>(rows);
    },

    async getFeedbackByQueryId(queryId: string): Promise<HumanFeedbackRow[]> {
      const rows = await sql`
        SELECT * FROM human_feedback WHERE query_id = ${queryId} ORDER BY created_at DESC
      `;
      return toCamelRows<HumanFeedbackRow>(rows);
    },
  };
}
