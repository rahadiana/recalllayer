import { z } from "zod";
import {
  createDocumentDtoSchema,
} from "@memory-platform/shared-schemas";
import type {
  ErrorCode,
  WorkspaceId,
} from "@memory-platform/shared-schemas";
import type { IngestDocumentRequest, ListDocumentsQuery } from "./types.js";

// ─── Configuration constants ─────────────────────────────────────────────────

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_TEXT_SIZE = 10 * 1024 * 1024;
export const MAX_UPLOAD_SESSION_SIZE = 500 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/html",
  "application/pdf",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "image/png",
  "image/jpeg",
]);

// ─── Ingest payload schema ───────────────────────────────────────────────────

const ingestDocumentRequestSchema = z.object({
  workspace_id: z.string().min(1, "workspace_id is required"),
  document: createDocumentDtoSchema,
  created_by: z.string().min(1, "created_by is required"),
  correlation_id: z.string().optional(),
});

// ─── List query schema ───────────────────────────────────────────────────────

const listDocumentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  status: z
    .enum(["pending", "ingesting", "extracting", "chunking", "indexing", "ready", "error"])
    .optional(),
});

// ─── Validation error helpers ────────────────────────────────────────────────

export interface FieldError {
  field: string;
  message: string;
  received?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: FieldError[];
  data?: IngestDocumentRequest;
}

export interface QueryValidationResult {
  valid: boolean;
  errors: FieldError[];
  data?: ListDocumentsQuery;
}

// ─── Public validation functions ─────────────────────────────────────────────

export function validateIngestPayload(
  body: unknown,
): ValidationResult {
  const result = ingestDocumentRequestSchema.safeParse(body);

  if (!result.success) {
    const errors: FieldError[] = result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
      received: typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)[issue.path[0] as string]
        : undefined,
    }));
    return { valid: false, errors };
  }

  const data: IngestDocumentRequest = {
    workspace_id: result.data.workspace_id as WorkspaceId,
    document: result.data.document,
    created_by: result.data.created_by,
    correlation_id: result.data.correlation_id,
  };

  return { valid: true, errors: [], data };
}

export function validateListDocumentsQuery(
  query: unknown,
): QueryValidationResult {
  const result = listDocumentsQuerySchema.safeParse(query);

  if (!result.success) {
    const errors: FieldError[] = result.error.issues.map((issue) => ({
      field: `query.${issue.path.join(".")}`,
      message: issue.message,
    }));
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      limit: result.data.limit,
      cursor: result.data.cursor,
      status: result.data.status,
    },
  };
}

export function validateFileMetadata(params: {
  mime_type?: string;
  size_bytes?: number;
}): { valid: true; errorCode?: undefined; message?: undefined }
     | { valid: false; errorCode: ErrorCode; message: string } {
  if (params.mime_type && !ALLOWED_MIME_TYPES.has(params.mime_type)) {
    return {
      valid: false,
      errorCode: "UNSUPPORTED_FILE_TYPE",
      message: `Unsupported MIME type: ${params.mime_type}. Allowed types: ${[...ALLOWED_MIME_TYPES].join(", ")}`,
    };
  }

  if (params.size_bytes !== undefined && params.size_bytes > MAX_FILE_SIZE) {
    return {
      valid: false,
      errorCode: "DOCUMENT_TOO_LARGE",
      message: `File size ${params.size_bytes} exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`,
    };
  }

  return { valid: true };
}

export function validateTextSize(text: string): { valid: true; errorCode?: undefined; message?: undefined }
  | { valid: false; errorCode: ErrorCode; message: string } {
  const sizeBytes = Buffer.byteLength(text, "utf-8");

  if (sizeBytes > MAX_TEXT_SIZE) {
    return {
      valid: false,
      errorCode: "DOCUMENT_TOO_LARGE",
      message: `Text content size ${sizeBytes} exceeds maximum allowed size of ${MAX_TEXT_SIZE} bytes`,
    };
  }

  return { valid: true };
}
