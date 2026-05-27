# Shared Schemas

## Responsibility

Single source of truth for DTOs, API schemas, event schemas, and error shapes.
Every service in the Agentic Memory Platform depends on this package for
consistent type definitions and runtime validation.

## Owns

- Public API request/response schema.
- Internal event envelopes and payload schema.
- Shared ID and metadata types.
- Standard error types.

## Package Structure

```
src/
├── index.ts                  Barrel exports (types + validation schemas)
├── types/
│   ├── common.ts             ID types, Timestamp, Pagination, Metadata
│   ├── auth.ts               Workspace, User, Role, ApiKey, Permission
│   ├── document.ts           Document, DocumentStatus, DocumentSource, DTOs
│   ├── event.ts              EventEnvelope, EventType, EventPayloadMap
│   ├── extraction.ts         ExtractionJob, ExtractedDocument, DocumentSection
│   ├── chunk.ts              Chunk, EmbeddingRecord, IndexRecord, ChunkingConfig
│   ├── search.ts             SearchQuery, SearchResult, ContextWindow, Reranking
│   ├── graph.ts              Entity, Relation, MemoryEdge, GraphSnapshot
│   ├── profile.ts            UserProfile, Preference, BehaviorEvent, ProfileFact
│   ├── connector.ts          ConnectorAccount, SyncJob, SyncState, SyncedDocument
│   ├── evaluation.ts         EvalDataset, EvalRun, RetrievalScore, HumanFeedback
│   └── error.ts              ErrorCode, ApiError, ValidationError
└── validation/
    └── index.ts              Zod schemas for all types above
```

## Allowed

- Zod/JSON Schema/protobuf definitions.
- Type-only exports.
- Versioned event contracts.

## Forbidden

- Business logic.
- DB queries.
- HTTP calls.
- Imports from services/apps.

## Key Types

### EventEnvelope

The canonical event type for cross-service communication:

```ts
interface EventEnvelope<P extends EventPayload = EventPayload> {
  event_id: string;
  event_type: EventType;
  event_version: number;
  workspace_id: string | null;
  actor_id: string | null;
  occurred_at: Timestamp;
  correlation_id: string | null;
  payload: P;
}
```

### Domain Types

| Domain | Key Types |
|--------|-----------|
| Auth/Workspace | `Workspace`, `User`, `Role`, `ApiKey`, `WorkspaceMembership` |
| Document | `Document`, `DocumentStatus`, `DocumentSource`, `CreateDocumentDto` |
| Extraction | `ExtractionJob`, `ExtractedDocument`, `DocumentSection` |
| Chunk/Embedding/Index | `Chunk`, `EmbeddingRecord`, `IndexRecord`, `ChunkingConfig` |
| Search/Context | `SearchQuery`, `SearchResult`, `ContextWindow`, `RerankingScore` |
| Graph | `Entity`, `Relation`, `MemoryEdge`, `GraphSnapshot` |
| Profile | `UserProfile`, `Preference`, `BehaviorEvent`, `ProfileFact` |
| Connector/Sync | `ConnectorAccount`, `SyncJob`, `SyncState`, `SyncedDocument` |
| Evaluation | `EvalDataset`, `EvalRun`, `RetrievalScore`, `HumanFeedback` |
| Error | `ErrorCode`, `ApiError`, `ValidationError` |

## Usage

```ts
import { EventEnvelope, eventEnvelopeSchema, Document, documentSchema } from "@memory-platform/shared-schemas";

// Runtime validation
const parsed = eventEnvelopeSchema.parse(rawMessage);

// TypeScript types
function handleEvent(evt: EventEnvelope) { ... }
```

## Versioning

Event payloads are versioned via `event_version` on the envelope.
Increment the version when a payload shape changes in a non-backward-compatible way.

## Required Initial Domains (all implemented)

- **EventEnvelope** — canonical event type (`event_id`, `event_type`, `event_version`, `workspace_id`, `actor_id`, `occurred_at`, `correlation_id`, `payload`).
- Auth/workspace types.
- Document types.
- Extraction types.
- Chunk/embedding/index types.
- Search/context types.
- Graph/profile types.
- Connector/sync types.
- Evaluation types.
