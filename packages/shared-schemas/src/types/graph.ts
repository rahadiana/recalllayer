/**
 * Memory graph domain types.
 *
 * The memory graph service maintains a knowledge graph of entities,
 * relations, and their associated memory edges extracted from documents.
 *
 * @module graph
 */

import type { EntityId, Metadata, Timestamp, WorkspaceId } from "./common.js";

// ─── Entity ─────────────────────────────────────────────────────────────────

/**
 * An entity node in the memory graph.
 *
 * Entities represent real-world objects, concepts, people,
 * or any named thing extracted from documents and conversations.
 */
export interface Entity {
  /** Unique entity identifier. */
  id: EntityId;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Entity type (e.g. "person", "organisation", "concept", "location"). */
  entity_type: string;
  /** Canonical name of the entity. */
  name: string;
  /** Alternative names / aliases. */
  aliases: string[];
  /** Free-form properties. */
  properties: Metadata;
  /** Sources (document IDs) from which this entity was extracted. */
  source_document_ids: string[];
  /** Confidence score (0.0–1.0). */
  confidence: number;
  /** Creation timestamp. */
  created_at: Timestamp;
  /** Last update timestamp. */
  updated_at: Timestamp;
}

// ─── Relation ───────────────────────────────────────────────────────────────

/**
 * A directed relation between two entities.
 */
export interface Relation {
  /** Unique relation identifier. */
  id: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Source entity (subject). */
  source_entity_id: EntityId;
  /** Target entity (object). */
  target_entity_id: EntityId;
  /** Relation type (e.g. "works_at", "located_in", "knows"). */
  relation_type: string;
  /** Additional relation properties. */
  properties: Metadata;
  /** Sources (document IDs) supporting this relation. */
  source_document_ids: string[];
  /** Confidence score (0.0–1.0). */
  confidence: number;
  /** Creation timestamp. */
  created_at: Timestamp;
  /** Last update timestamp. */
  updated_at: Timestamp;
}

// ─── Memory Edge ────────────────────────────────────────────────────────────

/**
 * A memory edge links an entity to the specific chunk(s) that support it.
 *
 * This enables tracing why an entity exists: "this entity was
 * inferred from chunks A, B, and C."
 */
export interface MemoryEdge {
  /** Unique edge identifier. */
  id: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** The entity this edge points to. */
  entity_id: EntityId;
  /** The chunk that supports this entity. */
  chunk_id: string;
  /** The document that chunk belongs to (denormalised). */
  document_id: string;
  /** The specific text span within the chunk. */
  evidence_text: string;
  /** Confidence of the extraction for this specific edge. */
  confidence: number;
  /** Creation timestamp. */
  created_at: Timestamp;
}

// ─── Graph Snapshot ─────────────────────────────────────────────────────────

/**
 * A point-in-time snapshot of the full memory graph state.
 *
 * Snapshots are used for versioning, rollback, and analysis.
 */
export interface GraphSnapshot {
  /** Unique snapshot identifier. */
  id: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Snapshot label / description. */
  label: string;
  /** Total entities at time of snapshot. */
  entity_count: number;
  /** Total relations at time of snapshot. */
  relation_count: number;
  /** Snapshot creation timestamp. */
  created_at: Timestamp;
}

// ─── Graph Query ────────────────────────────────────────────────────────────

/**
 * Query parameters for traversing the memory graph.
 */
export interface GraphQuery {
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Starting entity IDs. */
  seed_entity_ids: EntityId[];
  /** Maximum traversal depth. */
  max_depth: number;
  /** Relation types to follow (empty = all). */
  relation_types?: string[];
  /** Entity types to include (empty = all). */
  entity_types?: string[];
  /** Maximum number of nodes to return. */
  max_nodes: number;
}
