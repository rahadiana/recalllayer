# RecallLayer

Memory layer multi-service untuk AI agents — production-ready blueprint dengan ingestion, extraction, indexing, retrieval/RAG, memory graph, profile memory, connectors, dashboard, SDK, dan infrastructure.

## Quick Start

```bash
# 1. Start infrastructure
docker compose -f infra/docker/docker-compose.yml up -d

# 2. Run migrations (first time only)
for svc in api-gateway ingestion-service extraction-service indexing-service retrieval-service memory-graph-service profile-memory-service connector-service evaluation-service; do
  docker exec -i memory-postgres psql -U postgres -d memory_platform < services/$svc/migrations/001_init.sql
done

# 3. Seed data (optional)
docker exec -i memory-postgres psql -U postgres -d memory_platform < infra/docker/seed.sql

# 4. Build & start services (4 terminals)
pnpm install

# Terminal 1 - Ingestion
cd services/ingestion-service && pnpm build
PORT=3002 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform node dist/start.js

# Terminal 2 - Retrieval
cd services/retrieval-service && pnpm build
PORT=3005 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform QDRANT_URL=http://localhost:6333 node dist/start.js

# Terminal 3 - Indexing Worker
cd services/indexing-service && pnpm build
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform REDIS_URL=redis://localhost:6379 QDRANT_URL=http://localhost:6333 node dist/start.js

# Terminal 4 - API Gateway
cd services/api-gateway && pnpm build
JWT_SECRET=dev-secret-123 PORT=3001 INGESTION_SERVICE_URL=http://localhost:3002 RETRIEVAL_SERVICE_URL=http://localhost:3005 node dist/start.js
```

Atau pakai script:
```bash
chmod +x infra/docker/start-dev.sh
./infra/docker/start-dev.sh --build
```

## API Usage

```bash
# Health check
curl http://localhost:3001/health

# Upload document
curl -X POST http://localhost:3001/v1/documents \
  -H "Content-Type: application/json" \
  -H "x-api-key: ak_workspace123abc_randomstring1234567890" \
  -d '{"title":"My Document","source":{"type":"api","content":"Document content here"},"tags":["tag1"]}'

# Search
curl -X POST http://localhost:3001/v1/search \
  -H "Content-Type: application/json" \
  -H "x-api-key: ak_workspace123abc_randomstring1234567890" \
  -d '{"query":"your search query","top_k":5}'

# Usage stats
curl http://localhost:3001/v1/usage \
  -H "x-api-key: ak_workspace123abc_randomstring1234567890"
```

## Arsitektur

```
┌──────────────────────────────────────────────────────────┐
│                   API Gateway (:3001)                     │
│               auth · validate · rate-limit                │
├─────────────┬─────────────┬─────────────┬────────────────┤
│  Ingestion  │  Retrieval  │  Connector  │    Workers     │
│    :3002    │    :3005    │    :3008    │ (queue-based)  │
│  store doc  │  hybrid RAG │  sync ext   │ extract·index  │
├─────────────┴─────────────┴─────────────┴────────────────┤
│                   Infrastructure                         │
│   PostgreSQL · Redis · Qdrant · Neo4j · MinIO · OTel     │
└──────────────────────────────────────────────────────────┘
```

## Struktur Repo

```txt
apps/                 Frontend applications (Next.js)
  web-dashboard/      User dashboard
  developer-console/  API key & usage management
services/             Backend services & workers (9 services)
  api-gateway/        Public API entry point
  ingestion-service/  Document input & storage
  extraction-service/ Text extraction from sources
  indexing-service/   Chunking, embedding, vector index
  retrieval-service/  Hybrid search, rerank, context
  memory-graph-service/ Entity/relation graph memory
  profile-memory-service/ User preferences & personalization
  connector-service/  OAuth & external sync orchestration
  evaluation-service/ Retrieval quality measurement
packages/             Shared internal packages (8 packages)
  shared-schemas/     Types, Zod validation, event contracts
  shared-utils/       Pure utilities, ID, pagination, retry
  auth/               JWT & API key helpers
  db/                 Postgres, Redis, Qdrant, Neo4j, S3 clients
  queue/              Typed pub/sub event system
  llm/                OpenAI, Anthropic, embedding, reranker
  observability/      OpenTelemetry, structured logging
  ui/                 Shared React components
connectors/           External source plugins
  notion/             Notion sync connector
sdks/                 Public client libraries
  typescript/         TypeScript SDK
  react/              React hooks
infra/                Infrastructure & deployment
  docker/             Docker Compose, Dockerfiles, OTel config
docs/                 Architecture, API reference, agent rules
```

## Status Platform

| Layer | Components | Typecheck | Tests |
|---|---|---|---|
| Infrastructure | 5 services | N/A | ✅ Running |
| Foundation packages | 8 packages | ✅ 8/8 | 57/58 |
| Backend services | 9 services | ✅ 9/9 | 55/61 |
| Frontend apps | 2 apps | ✅ 2/2 | N/A |
| SDKs | 2 SDKs | ✅ 2/2 | N/A |
| Connectors | 1 connector | N/A | N/A |

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Health check |
| POST | `/v1/documents` | API key | Upload document |
| GET | `/v1/documents/:id` | API key | Get document status |
| POST | `/v1/search` | API key | Hybrid search |
| POST | `/v1/context` | API key | Context assembly |
| GET | `/v1/memories/:id` | API key | Get memory |
| POST | `/v1/connectors/:type/sync` | API key | Trigger connector sync |
| GET | `/v1/usage` | API key | Usage statistics |

## Golden Rules

1. Frontend dan SDK hanya boleh memanggil `services/api-gateway`
2. Service tidak boleh membaca database milik service lain
3. Shared logic harus di `packages/`, bukan import antar-service
4. Semua event lintas-service wajib di `packages/shared-schemas`
5. Secret tidak boleh di-hardcode
6. Setiap folder wajib memiliki README, tests, migration
