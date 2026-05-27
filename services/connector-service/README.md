# Connector Service

Orchestrates external data source connections (OAuth, sync, webhooks).

## Quick Start

```bash
pnpm build
PORT=3008 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform REDIS_URL=redis://localhost:6379 node dist/start.js
```

## Migration

```bash
docker exec -i memory-postgres psql -U postgres -d memory_platform < services/connector-service/migrations/001_init.sql
```

## Responsibility

Orchestrates external data source connections, OAuth, sync state, and connector jobs.

## Owns Data

- `connector_accounts`
- `connector_tokens`
- `sync_jobs`
- `sync_states`

## Internal API

```txt
POST /internal/connectors/:type/sync
GET  /internal/connectors/:type/status
```

## Emits

- `connector.sync.requested`
- `external.document.discovered`
- `external.document.updated`
- `external.document.deleted`

## Allowed

- Manage OAuth/token refresh.
- Schedule delta sync.
- Coordinate plugin connectors in `connectors/*`.

## Forbidden

- Parsing document content in detail.
- Embedding/indexing.
- Search and reranking.
