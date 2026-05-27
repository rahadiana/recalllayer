# Indexing Service

Chunks extracted text, generates embeddings, and writes vector/keyword index records.

## Quick Start

```bash
pnpm build
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform REDIS_URL=redis://localhost:6379 QDRANT_URL=http://localhost:6333 node dist/start.js
```

## Migration

```bash
docker exec -i memory-postgres psql -U postgres -d memory_platform < services/indexing-service/migrations/001_init.sql
```

## Architecture

```
document.extracted event → IndexingWorker → chunk → embed → index → events
                                              ↓         ↓        ↓
                                         chunk.created  embed   doc.indexed
```

Pipeline stages:
1. **Chunker** (`src/chunker.ts`) — `FixedSizeChunker` splits text into overlapping chunks with configurable size, overlap, and sentence-boundary preservation.
2. **Embedder** (`src/embedder.ts`) — `EmbeddingWorker` calls `@memory-platform/llm` to generate vector embeddings in batches with retry and rate-limit handling.
3. **Indexer** (`src/indexer.ts`) — `IndexWriter` persists vectors to Qdrant (vector index) and tokens to Postgres (keyword full-text index).
4. **Worker** (`src/worker.ts`) — `IndexingWorker` orchestrates the full pipeline, publishes events at each stage, and handles failures with retry.

## Owns Data

- `chunks` — text chunks with sequence numbers and metadata
- `embeddings` — vector records pointing to chunks
- `vector_index_records` — Qdrant points (vector + payload)
- `keyword_index_records` — Postgres full-text search tokens

## Consumes

- Channel: `document.extracted` — Event type: `extraction.job_completed`

## Emits

All events published on channel `indexing.events`:
- `indexing.chunks_created` — after text is chunked
- `indexing.embeddings_generated` — after embeddings are created
- `indexing.completed` — after vector + keyword writes succeed
- `indexing.failed` — on unrecoverable pipeline failure

## Public API

```typescript
import { startIndexingService } from "@memory-platform/indexing-service";

const { close } = await startIndexingService({
  redisUrl: "redis://localhost:6379",
  db: {
    postgresUrl: "postgres://...",
    qdrantUrl: "http://localhost:6333",
  },
  embedder: { model: "text-embedding-3-small" },
  chunker: { maxChunkSize: 1500, overlapSize: 200 },
});
```

## Configuration

| Env Var | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Redis for queue pub/sub |
| `QUEUE_PREFIX` | `memory` | Redis key prefix |
| `DATABASE_URL` | — | Postgres connection string |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant vector DB |
| `QDRANT_API_KEY` | — | Qdrant API key |

## Allowed

- Use `packages/llm` for embeddings.
- Use `packages/db` for vector/keyword storage clients.
- Maintain document-to-chunk relationships.

## Forbidden

- Handling search requests.
- Reranking query results.
- Managing API auth or connector sync.
- Writing profile or graph facts directly.
