/**
 * Standard error types for the platform.
 *
 * Every service MUST use these error shapes for consistent
 * error handling across the API gateway and all services.
 *
 * @module error
 */

import type { Timestamp } from "./common.js";

// ─── Error Code ─────────────────────────────────────────────────────────────

/**
 * Canonical error codes used across all services.
 *
 * Codes follow the `{DOMAIN}_{REASON}` convention.
 */
export type ErrorCode =
  // Generic
  | "UNKNOWN"
  | "INTERNAL_ERROR"
  | "NOT_IMPLEMENTED"

  // Validation
  | "VALIDATION_ERROR"
  | "INVALID_INPUT"
  | "MISSING_REQUIRED_FIELD"

  // Auth
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_API_KEY"
  | "TOKEN_EXPIRED"
  | "INSUFFICIENT_PERMISSIONS"

  // Resource
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "CONFLICT"
  | "RESOURCE_LOCKED"
  | "TOO_MANY_REQUESTS"

  // Workspace
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_QUOTA_EXCEEDED"

  // Document
  | "DOCUMENT_NOT_FOUND"
  | "DOCUMENT_TOO_LARGE"
  | "UNSUPPORTED_FILE_TYPE"
  | "DOCUMENT_PROCESSING_FAILED"

  // Extraction
  | "EXTRACTION_FAILED"
  | "EXTRACTION_TIMEOUT"

  // Indexing
  | "INDEXING_FAILED"
  | "EMBEDDING_FAILED"

  // Search
  | "SEARCH_FAILED"
  | "INVALID_QUERY"

  // Graph
  | "ENTITY_NOT_FOUND"
  | "RELATION_NOT_FOUND"

  // Profile
  | "PROFILE_NOT_FOUND"

  // Connector
  | "CONNECTOR_NOT_FOUND"
  | "CONNECTOR_AUTH_FAILED"
  | "CONNECTOR_SYNC_FAILED"
  | "CONNECTOR_RATE_LIMITED"

  // Evaluation
  | "DATASET_NOT_FOUND"
  | "EVAL_RUN_NOT_FOUND";

// ─── API Error ──────────────────────────────────────────────────────────────

/**
 * Standardised API error response.
 *
 * Returned by the API gateway and every service for client-facing errors.
 */
export interface ApiError {
  /** Machine-readable error code. */
  code: ErrorCode;
  /** Human-readable error message (safe for end users). */
  message: string;
  /** Optional details for developers (e.g. field-level errors). */
  details?: unknown;
  /** Unique error instance identifier (for log correlation). */
  error_id: string;
  /** ISO-8601 UTC timestamp of the error. */
  timestamp: Timestamp;
  /** The HTTP path that triggered the error. */
  path?: string;
}

// ─── Validation Error ───────────────────────────────────────────────────────

/**
 * Detailed validation error with per-field error messages.
 *
 * Used when request payloads fail Zod / input validation.
 */
export interface ValidationError {
  /** Always `"VALIDATION_ERROR"`. */
  code: "VALIDATION_ERROR";
  /** Summary message. */
  message: string;
  /** Per-field validation issues. */
  fields: ValidationErrorDetail[];
  /** Unique error instance identifier. */
  error_id: string;
  /** ISO-8601 UTC timestamp. */
  timestamp: Timestamp;
}

/**
 * A single field-level validation issue.
 */
export interface ValidationErrorDetail {
  /** JSON path to the invalid field (e.g. "body.title", "query.limit"). */
  field: string;
  /** Description of the validation failure. */
  message: string;
  /** The invalid value that was received (optional). */
  received?: unknown;
}
