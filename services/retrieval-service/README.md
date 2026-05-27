# Retrieval Service

RAG search engine: hybrid search, filtering, reranking, and context assembly.

## Quick Start

```bash
pnpm build
PORT=3005 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform QDRANT_URL=http://localhost:6333 node dist/start.js
```

## Migration

```bash
docker exec -i memory-postgres psql -U postgres -d memory_platform < services/retrieval-service/migrations/001_init.sql
```

## Responsibility

## Owns Data

- `retrieval_logs`
- `search_sessions`
- `ranking_feedback`

## Internal API

```txt
POST /internal/search
POST /internal/context
```

## Allowed

- Query vector and keyword indexes.
- Apply metadata filters by workspace, user, source, and time.
- Rerank retrieved results.
- Assemble context windows for AI agents.

## Forbidden

- Document ingestion.
- Chunk creation or embedding generation.
- Direct graph/profile mutation.
- Public auth/API key management.

## Note

Reranking stays as an internal module here until traffic justifies separate deployment.
