# Services

Backend services and workers.

## Golden Rules

- Each service owns its own data store schema/migrations.
- Services must not read another service's database.
- Cross-service sync access goes through API Gateway/internal API contract.
- Cross-service async workflow goes through typed queue events.
- Shared code must live in `packages/*`.

## Service List

- `api-gateway` — public API, auth, rate limit, routing.
- `ingestion-service` — receives documents and source metadata.
- `extraction-service` — parses raw source into normalized text.
- `indexing-service` — chunking, embeddings, vector/keyword index.
- `retrieval-service` — hybrid search, reranking, context assembly.
- `memory-graph-service` — entities, relations, graph memory.
- `profile-memory-service` — user preferences and personalization memory.
- `connector-service` — OAuth, sync jobs, external source orchestration.
- `evaluation-service` — retrieval and memory quality evaluation.
