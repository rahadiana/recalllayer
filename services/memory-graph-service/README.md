# Memory Graph Service

Builds graph memory from entities, relationships, and facts. Uses Neo4j for graph + PostgreSQL for metadata.

## Quick Start

```bash
pnpm build
PORT=3006 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform GRAPH_DB_URL=bolt://localhost:7687 node dist/start.js
```

## Migration

```bash
docker exec -i memory-postgres psql -U postgres -d memory_platform < services/memory-graph-service/migrations/001_init.sql
```

## Responsibility

Builds graph memory from entities, relationships, and facts extracted from indexed memories.

## Owns Data

- `entities`
- `relations`
- `memory_edges`
- `graph_snapshots`

## Consumes

- `document.indexed`
- `chunk.created`
- `memory.fact_detected`

## Emits

- `entity.created`
- `relation.created`
- `graph.updated`

## Allowed

- Entity extraction.
- Relationship extraction.
- Graph traversal APIs for context expansion.
- Conflict detection between facts.

## Forbidden

- Acting as main vector/keyword search engine.
- Storing raw documents.
- Reading indexing-service database directly.
