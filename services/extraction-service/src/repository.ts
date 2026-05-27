import type { PostgresPool } from "@memory-platform/db";
import type {
  ExtractionJob,
  ExtractionStatus,
  ExtractedDocument,
  DocumentSection,
  CreateExtractionJobDto,
  DocumentId,
  WorkspaceId,
  Timestamp,
  Metadata,
} from "@memory-platform/shared-schemas";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";

export interface CreateJobParams {
  workspaceId: WorkspaceId;
  documentId: DocumentId;
  dto: CreateExtractionJobDto;
  createdBy: string;
}

type ExtractionJobRow = Record<string, unknown>;
type ExtractedDocumentRow = Record<string, unknown>;

export class ExtractionRepository {
  #pool: PostgresPool;
  #log: Logger;

  constructor(pool: PostgresPool) {
    this.#pool = pool;
    this.#log = createLogger("extraction:repository");
  }

  async createJob(params: CreateJobParams): Promise<ExtractionJob> {
    const id = `extjob_${generateId()}`;
    const now = new Date().toISOString();
    const strategy = params.dto.strategy ?? "auto";
    const config = params.dto.config ?? {};
    const maxRetries = 3;

    const [row] = await this.#pool.sql<[ExtractionJobRow]>`
      INSERT INTO extraction_jobs (
        id, workspace_id, document_id, status, strategy,
        config, retry_count, max_retries, created_by, created_at
      ) VALUES (
        ${id}, ${params.workspaceId}, ${params.documentId},
        ${"pending"}, ${strategy}, ${JSON.stringify(config)},
        ${0}, ${maxRetries}, ${params.createdBy}, ${now}
      )
      RETURNING *
    `;

    this.#log.info("Extraction job created", {
      jobId: id,
      documentId: params.documentId as string,
      workspaceId: params.workspaceId as string,
    });

    return this.#mapJobRow(row);
  }

  async getJob(id: string): Promise<ExtractionJob | null> {
    const [row] = await this.#pool.sql<[ExtractionJobRow | undefined]>`
      SELECT * FROM extraction_jobs WHERE id = ${id}
    `;

    if (!row) {
      this.#log.debug("Extraction job not found", { jobId: id });
      return null;
    }

    return this.#mapJobRow(row);
  }

  async getJobByDocument(documentId: DocumentId): Promise<ExtractionJob | null> {
    const [row] = await this.#pool.sql<[ExtractionJobRow | undefined]>`
      SELECT * FROM extraction_jobs
      WHERE document_id = ${documentId}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!row) {
      return null;
    }

    return this.#mapJobRow(row);
  }

  async updateJobStatus(
    id: string,
    status: ExtractionStatus,
    opts?: { errorMessage?: string; startedAt?: Timestamp; completedAt?: Timestamp },
  ): Promise<ExtractionJob | null> {
    const now = new Date().toISOString();

    const [row] = await this.#pool.sql<[ExtractionJobRow | undefined]>`
      UPDATE extraction_jobs
      SET status = ${status},
          error_message = ${opts?.errorMessage ?? null},
          started_at = ${opts?.startedAt ?? null},
          completed_at = ${opts?.completedAt ?? now}
      WHERE id = ${id}
      RETURNING *
    `;

    if (!row) {
      this.#log.warn("Extraction job not found for status update", {
        jobId: id,
        newStatus: status,
      });
      return null;
    }

    this.#log.info("Extraction job status updated", {
      jobId: id,
      status,
    });

    return this.#mapJobRow(row);
  }

  async incrementRetry(id: string): Promise<ExtractionJob | null> {
    const [row] = await this.#pool.sql<[ExtractionJobRow | undefined]>`
      UPDATE extraction_jobs
      SET retry_count = retry_count + 1,
          status = ${"pending"}
      WHERE id = ${id}
      RETURNING *
    `;

    if (!row) {
      return null;
    }

    return this.#mapJobRow(row);
  }

  async saveExtractedDocument(doc: ExtractedDocument): Promise<void> {
    await this.#pool.sql`
      INSERT INTO extracted_documents (
        job_id, document_id, text, text_length, language,
        metadata, sections, extracted_at
      ) VALUES (
        ${doc.job_id}, ${doc.document_id}, ${doc.text},
        ${doc.text_length}, ${doc.language ?? null},
        ${JSON.stringify(doc.metadata)},
        ${JSON.stringify(doc.sections)},
        ${doc.extracted_at}
      )
      ON CONFLICT (job_id) DO UPDATE SET
        text = EXCLUDED.text,
        text_length = EXCLUDED.text_length,
        language = EXCLUDED.language,
        metadata = EXCLUDED.metadata,
        sections = EXCLUDED.sections,
        extracted_at = EXCLUDED.extracted_at
    `;

    this.#log.info("Extracted document saved", {
      jobId: doc.job_id,
      documentId: doc.document_id as string,
      textLength: doc.text_length,
    });
  }

  async getExtractedDocument(jobId: string): Promise<ExtractedDocument | null> {
    const [row] = await this.#pool.sql<[ExtractedDocumentRow | undefined]>`
      SELECT * FROM extracted_documents WHERE job_id = ${jobId}
    `;

    if (!row) return null;

    return {
      job_id: row.job_id as string,
      document_id: row.document_id as DocumentId,
      text: row.text as string,
      text_length: row.text_length as number,
      language: (row.language as string) ?? undefined,
      metadata: typeof row.metadata === "string"
        ? JSON.parse(row.metadata as string)
        : (row.metadata as Metadata) ?? {},
      sections: typeof row.sections === "string"
        ? JSON.parse(row.sections as string)
        : (Array.isArray(row.sections) ? row.sections as DocumentSection[] : []),
      extracted_at: row.extracted_at as Timestamp,
    };
  }

  async ensureTables(): Promise<void> {
    await this.#pool.sql`
      CREATE TABLE IF NOT EXISTS extraction_jobs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        strategy TEXT NOT NULL DEFAULT 'auto',
        config JSONB NOT NULL DEFAULT '{}',
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
      )
    `;

    await this.#pool.sql`
      CREATE INDEX IF NOT EXISTS idx_extraction_jobs_document
      ON extraction_jobs (document_id)
    `;

    await this.#pool.sql`
      CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status
      ON extraction_jobs (status)
    `;

    await this.#pool.sql`
      CREATE TABLE IF NOT EXISTS extracted_documents (
        job_id TEXT PRIMARY KEY REFERENCES extraction_jobs(id),
        document_id TEXT NOT NULL,
        text TEXT NOT NULL DEFAULT '',
        text_length INTEGER NOT NULL DEFAULT 0,
        language TEXT,
        metadata JSONB NOT NULL DEFAULT '{}',
        sections JSONB NOT NULL DEFAULT '[]',
        extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await this.#pool.sql`
      CREATE INDEX IF NOT EXISTS idx_extracted_documents_document
      ON extracted_documents (document_id)
    `;

    this.#log.info("Extraction tables ensured");
  }

  #mapJobRow(row: Record<string, unknown>): ExtractionJob {
    return {
      id: row.id as string,
      workspace_id: row.workspace_id as WorkspaceId,
      document_id: row.document_id as DocumentId,
      status: row.status as ExtractionStatus,
      strategy: row.strategy as string,
      config: typeof row.config === "string"
        ? JSON.parse(row.config as string)
        : (row.config as Record<string, unknown>) ?? {},
      error_message: (row.error_message as string) ?? undefined,
      retry_count: (row.retry_count as number) ?? 0,
      max_retries: (row.max_retries as number) ?? 3,
      created_by: row.created_by as string,
      created_at: row.created_at as string,
      started_at: (row.started_at as string) ?? undefined,
      completed_at: (row.completed_at as string) ?? undefined,
    };
  }
}
