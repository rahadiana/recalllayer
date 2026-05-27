#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="infra/docker/docker-compose.yml"

echo "[1/6] Starting infrastructure..."
docker compose -f "$COMPOSE_FILE" up -d postgres redis qdrant minio otel-collector

echo "[2/6] Waiting for containers..."
sleep 5

echo "[3/6] Running base health checks..."
docker exec memory-postgres pg_isready -U postgres >/dev/null
docker exec memory-redis redis-cli ping | grep -q PONG
curl -sf http://localhost:6333/healthz >/dev/null
curl -sf http://localhost:9000/minio/health/live >/dev/null

echo "[4/6] Running migrations..."
for svc in api-gateway ingestion-service extraction-service indexing-service retrieval-service memory-graph-service profile-memory-service connector-service evaluation-service; do
  if [ -f "services/$svc/migrations/001_init.sql" ]; then
    docker exec -i memory-postgres psql -U postgres -d memory_platform < "services/$svc/migrations/001_init.sql" >/dev/null
  fi
done
if [ -f "services/api-gateway/migrations/002_workspace_quotas.sql" ]; then
  docker exec -i memory-postgres psql -U postgres -d memory_platform < "services/api-gateway/migrations/002_workspace_quotas.sql" >/dev/null
fi

echo "[5/6] Seeding data..."
if [ -f "infra/docker/seed.sql" ]; then
  docker exec -i memory-postgres psql -U postgres -d memory_platform < "infra/docker/seed.sql" >/dev/null || true
fi

echo "[6/6] Verifying DB objects..."
docker exec memory-postgres psql -U postgres -d memory_platform -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" >/dev/null

echo "✅ Smoke check passed."
echo "Next: start app services and run API smoke checks."
