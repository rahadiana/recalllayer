# Local Setup (Core Developers)

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker + Docker Compose

## 1) Clone & Install

```bash
git clone <repo>
cd agentic-ai
pnpm install
```

## 2) Start Infrastructure

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

## 3) Run Migrations

```bash
for svc in api-gateway ingestion-service extraction-service indexing-service retrieval-service memory-graph-service profile-memory-service connector-service evaluation-service; do
  docker exec -i memory-postgres psql -U postgres -d memory_platform < services/$svc/migrations/001_init.sql
done

# optional quota migration
docker exec -i memory-postgres psql -U postgres -d memory_platform < services/api-gateway/migrations/002_workspace_quotas.sql
```

## 4) Run Core Services

### Ingestion

```bash
cd services/ingestion-service
pnpm build
PORT=3002 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform node dist/start.js
```

### Retrieval

```bash
cd services/retrieval-service
pnpm build
PORT=3005 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform QDRANT_URL=http://localhost:6333 node dist/start.js
```

### Indexing worker

```bash
cd services/indexing-service
pnpm build
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform REDIS_URL=redis://localhost:6379 QDRANT_URL=http://localhost:6333 node dist/start.js
```

### API Gateway

```bash
cd services/api-gateway
pnpm build
JWT_SECRET=<your-jwt-secret> PORT=3001 INGESTION_SERVICE_URL=http://localhost:3002 RETRIEVAL_SERVICE_URL=http://localhost:3005 node dist/start.js
```

## 5) Run Frontend

```bash
cd apps/web-dashboard && pnpm dev
cd apps/developer-console && pnpm dev -p 3100
```

## Verification

```bash
curl http://localhost:3001/health
curl -X POST http://localhost:3001/v1/documents \
  -H "x-api-key: ak_<workspace_id>_<token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Doc","source":{"type":"api","content":"hello"}}'
```
