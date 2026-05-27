import { describe, it, expect } from "vitest";
import {
  // Common
  paginationParamsSchema,
  metadataSchema,
  // Auth
  workspaceSchema,
  userSchema,
  apiKeySchema,
  // Document
  documentSchema,
  documentStatusSchema,
  createDocumentDtoSchema,
  // Event
  eventEnvelopeSchema,
  eventTypeSchema,
  // Extraction
  extractionJobSchema,
  extractedDocumentSchema,
  // Chunk
  chunkSchema,
  embeddingRecordSchema,
  // Search
  searchQuerySchema,
  searchResultSchema,
  contextWindowSchema,
  // Graph
  entitySchema,
  relationSchema,
  memoryEdgeSchema,
  // Profile
  userProfileSchema,
  behaviorEventSchema,
  // Connector
  connectorAccountSchema,
  syncJobSchema,
  // Evaluation
  evalDatasetSchema,
  evalRunSchema,
  humanFeedbackSchema,
  // Error
  apiErrorSchema,
  validationErrorSchema,
  errorCodeSchema,
} from "../src/index.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const NOW = "2026-05-14T09:30:00.000Z";
const WS_ID = "ws_01jq00000000000000000001";
const USER_ID = "user_01jq00000000000000000001";
const DOC_ID = "doc_01jq00000000000000000001";

// ─── Common ─────────────────────────────────────────────────────────────────

describe("Common schemas", () => {
  it("validates paginationParamsSchema", () => {
    expect(paginationParamsSchema.parse({ limit: 10 })).toEqual({ limit: 10 });
    expect(paginationParamsSchema.parse({ limit: 10, cursor: "abc" })).toEqual({
      limit: 10,
      cursor: "abc",
    });
    expect(() => paginationParamsSchema.parse({})).toThrow();
    expect(() => paginationParamsSchema.parse({ limit: 0 })).toThrow();
    expect(() => paginationParamsSchema.parse({ limit: 2000 })).toThrow();
  });

  it("validates metadataSchema", () => {
    expect(metadataSchema.parse({})).toEqual({});
    expect(metadataSchema.parse({ key: "val", num: 42 })).toEqual({
      key: "val",
      num: 42,
    });
  });
});

// ─── Auth ───────────────────────────────────────────────────────────────────

describe("Auth schemas", () => {
  const validWorkspace = {
    id: WS_ID,
    name: "Test Workspace",
    tenant_id: "tenant_01",
    created_at: NOW,
    updated_at: NOW,
    is_active: true,
  };

  it("validates workspaceSchema", () => {
    expect(workspaceSchema.parse(validWorkspace)).toEqual(validWorkspace);
  });

  it("rejects workspace without name", () => {
    const { name: _, ...rest } = validWorkspace;
    expect(() => workspaceSchema.parse(rest)).toThrow();
  });

  it("rejects workspace with empty name", () => {
    expect(() => workspaceSchema.parse({ ...validWorkspace, name: "" })).toThrow();
  });

  it("validates userSchema", () => {
    const user = {
      id: USER_ID,
      name: "Alice",
      email: "alice@example.com",
      created_at: NOW,
      updated_at: NOW,
      is_active: true,
    };
    expect(userSchema.parse(user)).toEqual(user);
  });

  it("rejects user with invalid email", () => {
    expect(() =>
      userSchema.parse({
        id: USER_ID,
        name: "Bob",
        email: "not-an-email",
        created_at: NOW,
        updated_at: NOW,
        is_active: true,
      }),
    ).toThrow();
  });

  it("validates apiKeySchema", () => {
    const key = {
      id: "key_01",
      workspace_id: WS_ID,
      prefix: "mp_abc",
      hash: "sha256hex...",
      permissions: ["document:read"],
      expires_at: null,
      created_at: NOW,
      is_active: true,
    };
    expect(apiKeySchema.parse(key)).toEqual(key);
  });
});

// ─── Document ───────────────────────────────────────────────────────────────

describe("Document schemas", () => {
  it("validates all document status values", () => {
    ["pending", "ingesting", "extracting", "chunking", "indexing", "ready", "error"].forEach(
      (s) => {
        expect(documentStatusSchema.parse(s)).toBe(s);
      },
    );
    expect(() => documentStatusSchema.parse("unknown")).toThrow();
  });

  it("validates a full document", () => {
    const doc = {
      id: DOC_ID,
      workspace_id: WS_ID,
      title: "My Document",
      status: "ready",
      source: { type: "upload" as const, filename: "notes.txt" },
      metadata: { author: "Alice" },
      tags: ["important"],
      created_by: USER_ID,
      created_at: NOW,
      updated_at: NOW,
    };
    expect(documentSchema.parse(doc)).toEqual(doc);
  });

  it("validates createDocumentDtoSchema with minimal fields", () => {
    const dto = {
      title: "New Doc",
      source: { type: "url" as const, location: "https://example.com" },
    };
    expect(createDocumentDtoSchema.parse(dto)).toEqual(dto);
  });

  it("rejects createDocumentDtoSchema with empty title", () => {
    expect(() =>
      createDocumentDtoSchema.parse({ title: "", source: { type: "url" as const } }),
    ).toThrow();
  });
});

// ─── Event ──────────────────────────────────────────────────────────────────

describe("Event schemas", () => {
  it("validates a complete event envelope", () => {
    const envelope = {
      event_id: "evt_01jq00000000000000000001",
      event_type: "document.created",
      event_version: 1,
      workspace_id: WS_ID,
      actor_id: USER_ID,
      occurred_at: NOW,
      correlation_id: "corr_01",
      payload: { document_id: DOC_ID, title: "Hello", created_by: USER_ID },
    };
    expect(eventEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it("allows null workspace_id and actor_id for system events", () => {
    const envelope = {
      event_id: "evt_sys",
      event_type: "system.health_check" as const,
      event_version: 1,
      workspace_id: null,
      actor_id: null,
      occurred_at: NOW,
      correlation_id: null,
      payload: { service_name: "api-gateway", status: "healthy" },
    };
    expect(eventEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it("rejects unknown event types", () => {
    expect(() => eventTypeSchema.parse("unknown.event")).toThrow();
  });

  it("rejects envelope with missing event_id", () => {
    expect(() =>
      eventEnvelopeSchema.parse({
        event_type: "document.created",
        event_version: 1,
        workspace_id: WS_ID,
        actor_id: USER_ID,
        occurred_at: NOW,
        correlation_id: null,
        payload: {},
      }),
    ).toThrow();
  });

  it("rejects envelope with negative event_version", () => {
    expect(() =>
      eventEnvelopeSchema.parse({
        event_id: "evt_01",
        event_type: "document.created",
        event_version: 0,
        workspace_id: WS_ID,
        actor_id: USER_ID,
        occurred_at: NOW,
        correlation_id: null,
        payload: {},
      }),
    ).toThrow();
  });
});

// ─── Extraction ─────────────────────────────────────────────────────────────

describe("Extraction schemas", () => {
  it("validates extractionJobSchema", () => {
    const job = {
      id: "job_01",
      workspace_id: WS_ID,
      document_id: DOC_ID,
      status: "pending" as const,
      strategy: "pdf-parser",
      config: {},
      retry_count: 0,
      max_retries: 3,
      created_at: NOW,
      created_by: USER_ID,
    };
    expect(extractionJobSchema.parse(job)).toEqual(job);
  });

  it("validates extractedDocumentSchema", () => {
    const edoc = {
      job_id: "job_01",
      document_id: DOC_ID,
      text: "Hello world",
      text_length: 11,
      metadata: {},
      sections: [],
      extracted_at: NOW,
    };
    expect(extractedDocumentSchema.parse(edoc)).toEqual(edoc);
  });
});

// ─── Chunk / Embedding ──────────────────────────────────────────────────────

describe("Chunk schemas", () => {
  it("validates chunkSchema", () => {
    const chunk = {
      id: "chk_01",
      document_id: DOC_ID,
      workspace_id: WS_ID,
      sequence_number: 0,
      text: "This is a text chunk.",
      text_length: 20,
      metadata: {},
      created_at: NOW,
    };
    expect(chunkSchema.parse(chunk)).toEqual(chunk);
  });

  it("validates embeddingRecordSchema", () => {
    const emb = {
      id: "emb_01",
      target_id: "chk_01",
      target_type: "chunk" as const,
      vector: [0.1, 0.2, 0.3],
      dimensions: 3,
      model: "text-embedding-3-small",
      workspace_id: WS_ID,
      created_at: NOW,
    };
    expect(embeddingRecordSchema.parse(emb)).toEqual(emb);
  });
});

// ─── Search ─────────────────────────────────────────────────────────────────

describe("Search schemas", () => {
  it("validates searchQuerySchema", () => {
    const q = {
      id: "q_01",
      workspace_id: WS_ID,
      query: "What is RAG?",
      top_k: 10,
      similarity_threshold: 0.7,
      filters: {},
      hybrid: true,
      created_at: NOW,
    };
    expect(searchQuerySchema.parse(q)).toEqual(q);
  });

  it("validates searchResultSchema", () => {
    const result = {
      rank: 1,
      chunk_id: "chk_01",
      document_id: DOC_ID,
      text: "relevant chunk text",
      score: 0.92,
      metadata: {},
    };
    expect(searchResultSchema.parse(result)).toEqual(result);
  });

  it("validates contextWindowSchema", () => {
    const cw = {
      id: "ctx_01",
      query_id: "q_01",
      workspace_id: WS_ID,
      chunks: [
        {
          chunk_id: "chk_01",
          document_title: "My Doc",
          text: "context text",
          score: 0.9,
          position: 0,
        },
      ],
      assembled_text: "context text",
      token_count: 4,
      max_tokens: 4096,
      created_at: NOW,
    };
    expect(contextWindowSchema.parse(cw)).toEqual(cw);
  });
});

// ─── Graph ──────────────────────────────────────────────────────────────────

describe("Graph schemas", () => {
  it("validates entitySchema", () => {
    const entity = {
      id: "ent_01",
      workspace_id: WS_ID,
      entity_type: "person",
      name: "Alice",
      aliases: [],
      properties: {},
      source_document_ids: [],
      confidence: 0.95,
      created_at: NOW,
      updated_at: NOW,
    };
    expect(entitySchema.parse(entity)).toEqual(entity);
  });

  it("rejects entity with confidence out of range", () => {
    expect(() =>
      entitySchema.parse({
        id: "ent_01",
        workspace_id: WS_ID,
        entity_type: "person",
        name: "Alice",
        aliases: [],
        properties: {},
        source_document_ids: [],
        confidence: 1.5,
        created_at: NOW,
        updated_at: NOW,
      }),
    ).toThrow();
  });

  it("validates relationSchema", () => {
    const rel = {
      id: "rel_01",
      workspace_id: WS_ID,
      source_entity_id: "ent_01",
      target_entity_id: "ent_02",
      relation_type: "works_at",
      properties: {},
      source_document_ids: [DOC_ID],
      confidence: 0.8,
      created_at: NOW,
      updated_at: NOW,
    };
    expect(relationSchema.parse(rel)).toEqual(rel);
  });

  it("validates memoryEdgeSchema", () => {
    const edge = {
      id: "edge_01",
      workspace_id: WS_ID,
      entity_id: "ent_01",
      chunk_id: "chk_01",
      document_id: DOC_ID,
      evidence_text: "Alice works at Acme Corp",
      confidence: 0.9,
      created_at: NOW,
    };
    expect(memoryEdgeSchema.parse(edge)).toEqual(edge);
  });
});

// ─── Profile ────────────────────────────────────────────────────────────────

describe("Profile schemas", () => {
  it("validates userProfileSchema", () => {
    const profile = {
      id: "profile_01",
      workspace_id: WS_ID,
      user_id: USER_ID,
      preferences: [],
      facts: [],
      behaviour_summary: {
        total_searches: 0,
        total_document_views: 0,
        top_search_terms: [],
        top_categories: [],
      },
      metadata: {},
      created_at: NOW,
      updated_at: NOW,
    };
    expect(userProfileSchema.parse(profile)).toEqual(profile);
  });

  it("validates behaviorEventSchema", () => {
    const event = {
      id: "bev_01",
      workspace_id: WS_ID,
      user_id: USER_ID,
      event_type: "search",
      payload: { query: "hello" },
      occurred_at: NOW,
    };
    expect(behaviorEventSchema.parse(event)).toEqual(event);
  });
});

// ─── Connector ──────────────────────────────────────────────────────────────

describe("Connector schemas", () => {
  it("validates connectorAccountSchema", () => {
    const account = {
      id: "conn_01",
      workspace_id: WS_ID,
      connector_type: "google-drive",
      label: "My Drive",
      credential_ref: "enc:abc123",
      config: { settings: {} },
      sync_state: { resource_checksums: {}, sync_count: 0 },
      created_at: NOW,
      updated_at: NOW,
      is_active: true,
    };
    expect(connectorAccountSchema.parse(account)).toEqual(account);
  });

  it("validates syncJobSchema", () => {
    const job = {
      id: "sync_01",
      account_id: "conn_01",
      workspace_id: WS_ID,
      status: "completed" as const,
      sync_mode: "incremental" as const,
      discovered_count: 10,
      processed_count: 8,
      skipped_count: 2,
      error_count: 0,
      created_at: NOW,
    };
    expect(syncJobSchema.parse(job)).toEqual(job);
  });
});

// ─── Evaluation ─────────────────────────────────────────────────────────────

describe("Evaluation schemas", () => {
  it("validates evalDatasetSchema", () => {
    const ds = {
      id: "ds_01",
      workspace_id: WS_ID,
      name: "Test Dataset",
      item_count: 0,
      metadata: {},
      created_at: NOW,
      updated_at: NOW,
    };
    expect(evalDatasetSchema.parse(ds)).toEqual(ds);
  });

  it("validates evalRunSchema", () => {
    const run = {
      id: "run_01",
      workspace_id: WS_ID,
      dataset_id: "ds_01",
      config: {
        search_backend: "pgvector",
        embedding_model: "text-embedding-3-small",
        hybrid: false,
        top_k: 10,
      },
      metrics: {
        mrr: 0.85,
        precision_at_k: 0.72,
        recall_at_k: 0.68,
        ndcg: 0.77,
        map: 0.74,
        avg_latency_ms: 45.2,
        total_queries: 100,
      },
      status: "completed" as const,
      created_by: USER_ID,
      created_at: NOW,
    };
    expect(evalRunSchema.parse(run)).toEqual(run);
  });

  it("validates humanFeedbackSchema", () => {
    const fb = {
      id: "fb_01",
      workspace_id: WS_ID,
      query_id: "q_01",
      user_id: USER_ID,
      rating: "relevant" as const,
      chunk_ids: ["chk_01"],
      created_at: NOW,
    };
    expect(humanFeedbackSchema.parse(fb)).toEqual(fb);
  });
});

// ─── Error ──────────────────────────────────────────────────────────────────

describe("Error schemas", () => {
  it("validates all defined error codes", () => {
    const codes = [
      "UNKNOWN",
      "NOT_FOUND",
      "VALIDATION_ERROR",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "DOCUMENT_NOT_FOUND",
      "EXTRACTION_FAILED",
      "CONNECTOR_AUTH_FAILED",
    ];
    for (const code of codes) {
      expect(errorCodeSchema.parse(code)).toBe(code);
    }
    expect(() => errorCodeSchema.parse("MADE_UP_CODE")).toThrow();
  });

  it("validates apiErrorSchema", () => {
    const err = {
      code: "NOT_FOUND" as const,
      message: "Document not found",
      error_id: "err_01",
      timestamp: NOW,
    };
    expect(apiErrorSchema.parse(err)).toEqual(err);
  });

  it("validates apiErrorSchema with optional fields", () => {
    const err = {
      code: "VALIDATION_ERROR" as const,
      message: "Invalid input",
      details: { field: "title" },
      error_id: "err_02",
      timestamp: NOW,
      path: "/api/documents",
    };
    expect(apiErrorSchema.parse(err)).toEqual(err);
  });

  it("validates validationErrorSchema", () => {
    const err = {
      code: "VALIDATION_ERROR" as const,
      message: "Validation failed",
      fields: [{ field: "body.title", message: "Title is required" }],
      error_id: "err_03",
      timestamp: NOW,
    };
    expect(validationErrorSchema.parse(err)).toEqual(err);
  });
});

// ─── Cross-domain integration ───────────────────────────────────────────────

describe("Cross-domain type relationships", () => {
  it("event envelope with document.created payload passes validation", () => {
    const envelope = {
      event_id: "evt_integration",
      event_type: "document.created" as const,
      event_version: 1,
      workspace_id: WS_ID,
      actor_id: USER_ID,
      occurred_at: NOW,
      correlation_id: "corr_int",
      payload: {
        document_id: DOC_ID,
        title: "Integration Test Doc",
        created_by: USER_ID,
      },
    };
    expect(eventEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it("event envelope with indexing.completed passes validation", () => {
    const envelope = {
      event_id: "evt_idx",
      event_type: "indexing.completed" as const,
      event_version: 1,
      workspace_id: WS_ID,
      actor_id: USER_ID,
      occurred_at: NOW,
      correlation_id: null,
      payload: { document_id: DOC_ID, chunk_count: 42 },
    };
    expect(eventEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it("search query with rerank config passes", () => {
    const q = {
      id: "q_rerank",
      workspace_id: WS_ID,
      query: "test query",
      top_k: 5,
      similarity_threshold: 0.5,
      filters: { tags: ["important"], document_ids: [DOC_ID] },
      hybrid: true,
      rerank: { model: "cohere", top_n: 20 },
      created_at: NOW,
    };
    expect(searchQuerySchema.parse(q)).toEqual(q);
  });
});
