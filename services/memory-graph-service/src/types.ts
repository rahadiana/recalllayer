/**
 * Memory Graph Service — Internal Types
 *
 * Service-specific types extending @memory-platform/shared-schemas.
 * All cross-service types (Entity, Relation, MemoryEdge, GraphSnapshot, GraphQuery)
 * are imported from shared-schemas — do NOT redefine them here.
 */

import type {
  Entity,
  Relation,
  MemoryEdge,
  GraphSnapshot,
  GraphQuery,
  DocumentId,
  WorkspaceId,
  EntityId,
  Metadata,
  Timestamp,
} from "@memory-platform/shared-schemas";

// ─── Re-exports for convenience ────────────────────────────────────────────

export type {
  Entity,
  Relation,
  MemoryEdge,
  GraphSnapshot,
  GraphQuery,
  DocumentId,
  WorkspaceId,
  EntityId,
  Metadata,
  Timestamp,
};

// ─── Extraction Types ──────────────────────────────────────────────────────

/**
 * A raw entity candidate extracted from document chunks
 * before being merged/persisted to the graph.
 */
export interface ExtractedEntityCandidate {
  /** Proposed name for the entity. */
  name: string;
  /** Entity type (e.g. "person", "organisation", "location", "concept", "date"). */
  entity_type: string;
  /** Alternative names / aliases found in text. */
  aliases: string[];
  /** Properties extracted from the context (e.g. descriptions, attributes). */
  properties: Metadata;
  /** Document chunk(s) that mention this entity. */
  source_chunk_ids: string[];
  /** Source document ID. */
  source_document_id: string;
  /** Text spans that evidence this entity. */
  evidence_spans: string[];
  /** Extraction confidence (0.0–1.0). */
  confidence: number;
}

/**
 * A raw relation candidate extracted between two entity candidates.
 */
export interface ExtractedRelationCandidate {
  /** Subject entity name (will be resolved to entity ID). */
  source_entity_name: string;
  /** Object entity name. */
  target_entity_name: string;
  /** Relation type (e.g. "works_at", "located_in", "part_of"). */
  relation_type: string;
  /** Additional relation properties. */
  properties: Metadata;
  /** Supporting evidence spans from text. */
  evidence_spans: string[];
  /** Confidence score (0.0–1.0). */
  confidence: number;
}

// ─── Internal Record Types ─────────────────────────────────────────────────

/**
 * Internal entity record enriched with extraction metadata.
 */
export interface EntityRecord extends Entity {
  /** Chunk IDs this entity was extracted from. */
  chunk_ids: string[];
  /** Evidence text spans from chunks. */
  evidence_spans: string[];
  /** Whether this entity has conflicts flagged. */
  has_conflicts: boolean;
}

/**
 * Internal relation record enriched with extraction metadata.
 */
export interface RelationRecord extends Relation {
  /** Evidence text spans supporting this relation. */
  evidence_spans: string[];
  /** Whether this relation conflicts with existing ones. */
  has_conflicts: boolean;
}

// ─── Traversal Types ───────────────────────────────────────────────────────

/**
 * A node in a graph traversal result.
 */
export interface TraversalNode {
  /** Entity ID. */
  id: EntityId;
  /** Entity labels / types. */
  labels: string[];
  /** Entity properties. */
  properties: Metadata;
}

/**
 * An edge in a graph traversal result.
 */
export interface TraversalEdge {
  /** Edge ID. */
  id: string;
  /** Edge type / relation type. */
  type: string;
  /** Source node ID. */
  source_id: EntityId;
  /** Target node ID. */
  target_id: EntityId;
  /** Edge properties. */
  properties: Metadata;
}

/**
 * A path through the graph (ordered sequence of alternating nodes and edges).
 */
export interface TraversalPath {
  /** Ordered nodes in the path. */
  nodes: TraversalNode[];
  /** Ordered edges connecting nodes. */
  edges: TraversalEdge[];
  /** Path length (number of edges). */
  length: number;
}

/**
 * Result of a graph traversal query.
 */
export interface TraversalResult {
  /** All nodes discovered during traversal. */
  nodes: TraversalNode[];
  /** All edges discovered during traversal. */
  edges: TraversalEdge[];
  /** Full paths from seed entities (if path query). */
  paths?: TraversalPath[];
  /** Total number of nodes found. */
  total_nodes: number;
  /** Total number of edges found. */
  total_edges: number;
  /** Max depth reached. */
  max_depth_reached: number;
}

// ─── Query Request Type ────────────────────────────────────────────────────

/**
 * Incoming graph query request body for POST /internal/graph/query.
 * Extends shared-schemas GraphQuery with additional options.
 */
export interface GraphQueryRequest {
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Starting entity IDs (at least one required). */
  seed_entity_ids: EntityId[];
  /** Maximum traversal depth (default: 2). */
  max_depth?: number;
  /** Relation types to follow (empty = all). */
  relation_types?: string[];
  /** Entity types to include (empty = all). */
  entity_types?: string[];
  /** Maximum number of nodes to return (default: 100). */
  max_nodes?: number;
  /** If true, return full paths instead of just nodes + edges. */
  return_paths?: boolean;
  /** Minimum confidence threshold for included relations (0.0–1.0). */
  min_confidence?: number;
}

// ─── Conflict Types ────────────────────────────────────────────────────────

/**
 * Types of conflicts that can be detected.
 */
export type ConflictType =
  | "contradictory_property"
  | "mutually_exclusive_relation"
  | "cyclic_dependency"
  | "duplicate_entity";

/**
 * A detected conflict between facts in the graph.
 */
export interface ConflictRecord {
  /** Unique conflict identifier. */
  id: string;
  /** Conflict type. */
  conflict_type: ConflictType;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** IDs of entities involved in the conflict. */
  entity_ids: EntityId[];
  /** IDs of relations involved (if applicable). */
  relation_ids?: string[];
  /** Human-readable description of the conflict. */
  description: string;
  /** Conflicting facts (key: entity/relation ID, value: conflicting property). */
  conflicting_facts: Record<string, unknown>;
  /** Whether this conflict needs human review. */
  needs_review: boolean;
  /** Resolution status. */
  status: "open" | "reviewed" | "resolved" | "dismissed";
  /** Who resolved it (if resolved). */
  resolved_by?: string;
  /** When the conflict was detected. */
  detected_at: Timestamp;
  /** When the conflict was resolved (if resolved). */
  resolved_at?: Timestamp;
}

// ─── Pipeline Configuration ────────────────────────────────────────────────

/**
 * Configuration for the entity extraction pipeline.
 */
export interface EntityExtractionConfig {
  /** Minimum confidence threshold for entity extraction (default: 0.3). */
  min_confidence: number;
  /** Maximum entities to extract per document. */
  max_entities_per_document: number;
  /** Entity types to extract (empty = all). */
  enabled_entity_types: string[];
  /** Minimum mention count to consider valid entity. */
  min_mention_count: number;
}

/**
 * Configuration for relation detection.
 */
export interface RelationDetectionConfig {
  /** Minimum co-occurrence count to consider a relation. */
  min_co_occurrence: number;
  /** Maximum sentence distance for proximity-based relations. */
  max_sentence_distance: number;
  /** Minimum confidence for relation detection (default: 0.4). */
  min_confidence: number;
  /** Relation types to detect (empty = all). */
  enabled_relation_types: string[];
}

/**
 * Default pipeline configuration.
 */
export const DEFAULT_EXTRACTION_CONFIG: EntityExtractionConfig = {
  min_confidence: 0.3,
  max_entities_per_document: 500,
  enabled_entity_types: [],
  min_mention_count: 1,
};

export const DEFAULT_RELATION_CONFIG: RelationDetectionConfig = {
  min_co_occurrence: 2,
  max_sentence_distance: 3,
  min_confidence: 0.4,
  enabled_relation_types: [],
};

// ─── Service Error ─────────────────────────────────────────────────────────

/**
 * Structured error for the memory graph service.
 */
export class GraphServiceError extends Error {
  /** Machine-readable error code. */
  readonly code: string;
  /** Whether this failure is retryable. */
  readonly retryable: boolean;
  /** Additional diagnostic context. */
  readonly context: Record<string, unknown>;

  constructor(
    message: string,
    opts: {
      code?: string;
      retryable?: boolean;
      context?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "GraphServiceError";
    this.code = opts.code ?? "GRAPH_SERVICE_ERROR";
    this.retryable = opts.retryable ?? false;
    this.context = opts.context ?? {};
  }
}
