# Ingestion Service

Receives raw user/source input and creates validated document records.

## Quick Start

```bash
pnpm build
PORT=3002 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform node dist/start.js
```

## Migration

```bash
docker exec -i memory-postgres psql -U postgres -d memory_platform < services/ingestion-service/migrations/001_init.sql
```

## Responsibility

## Inputs

- Text payloads.
- File upload metadata.
- URL submissions.
- Chat logs.
- Connector-discovered document events.

## Owns Data

- `documents` – Document metadata records (status, source info, tags).
- `document_sources` – Flattened source info stored on document rows.
- `upload_sessions` – In-memory multipart upload session state.

## Internal API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/internal/documents` | Ingest a document payload. Requires `workspace_id`, `document` (CreateDocumentDto), and `created_by`. Returns 201 with the document record and event ID. |
| GET | `/internal/documents` | List documents for a workspace. Query params: `workspace_id` (required), `limit` (1–100, default 20), `cursor`, `status`. Returns paginated results. |
| GET | `/internal/documents/:id` | Get a single document by ID. Returns 404 if not found. |
| POST | `/internal/upload-sessions` | Create a multipart upload session. Body: `workspace_id`, `filename`, `mime_type`, `total_size`, `total_chunks`, `created_by`. |
| POST | `/internal/upload-sessions/:id/chunks` | Upload a chunk. Body: `index`, `size`. Session auto-completes when all chunks received. |
| GET | `/internal/upload-sessions/:id` | Get upload session status. |
| DELETE | `/internal/upload-sessions/:id` | Abort an active upload session. |
| GET | `/health` | Health check with Postgres connectivity status. |

## Emits Events

| Event | Payload | When |
|-------|---------|------|
| `document.received` | document_id, workspace_id, title, source_type, mime_type, size_bytes, created_by | After successful document validation and storage |
| `document.validated` | document_id, workspace_id, validation_time_ms | After validation completes (includes timing) |
| `document.rejected` | document_id, workspace_id, reason, error_code | When validation fails (size, type, required fields) |

## Allowed

- Validate source metadata.
- Store document metadata and upload state.
- Publish events for downstream services.

## Forbidden

- PDF/HTML/OCR parsing detail (belongs to extraction-service).
- Embedding generation (belongs to indexing-service).
- Search and reranking (belongs to retrieval-service).
- Profile or graph mutation.
- Direct DB access to other service tables.

## Architecture

```
src/
  index.ts              Express app factory + server startup
  types.ts              Internal service types (DocumentRecord, UploadSession, config)
  validation.ts         Payload validation (Zod schemas, file size/MIME checks)
  repository.ts         DocumentRepository – Postgres CRUD via @memory-platform/db
  events.ts             EventPublisher – wraps @memory-platform/queue Publisher
  handlers/
    ingest.ts           handleIngestDocument() – validate → store → publish events
    upload-session.ts   UploadSessionHandler – multipart upload lifecycle
  routes/
    documents.ts        Express Router – all /internal/* endpoints
tests/
  validation.test.ts    Validation logic tests
  ingest.test.ts        Ingest handler tests (mocked repo + events)
  upload-session.test.ts Upload session lifecycle tests
  repository.test.ts    Repository tests (mocked Postgres pool)
  events.test.ts        Event publisher tests (mocked queue)
  routes.test.ts        Route-level integration tests
```

## Dependencies

- `express`, `multer` – HTTP server + file upload middleware
- `@memory-platform/shared-schemas` – Document types, validation schemas, event contracts
- `@memory-platform/shared-utils` – ID generation
- `@memory-platform/db` – Postgres pool
- `@memory-platform/queue` – Redis-backed event publishing
- `@memory-platform/observability` – Structured logging, health checks, correlation IDs
