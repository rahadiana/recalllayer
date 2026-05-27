#!/bin/bash
# start-dev.sh
# Start all services in development mode
# Usage: ./start-dev.sh [--build]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

COMPOSE_FILE="infra/docker/docker-compose.yml"

echo "=== Starting Memory Platform Infrastructure ==="

# Start infrastructure services
docker compose -f "$COMPOSE_FILE" up -d postgres redis qdrant minio otel-collector

echo "Waiting for infrastructure to be healthy..."
sleep 5

# Run migrations
echo "=== Running Database Migrations ==="
for service in api-gateway ingestion-service extraction-service indexing-service retrieval-service memory-graph-service profile-memory-service connector-service evaluation-service; do
  migration_file="services/$service/migrations/001_init.sql"
  if [ -f "$migration_file" ]; then
    echo "  Migrating $service..."
    docker exec -i memory-postgres psql -U postgres -d memory_platform < "$migration_file" 2>/dev/null || true
  fi
done

# Seed data
echo "=== Seeding Development Data ==="
docker exec -i memory-postgres psql -U postgres -d memory_platform < infra/docker/seed.sql 2>/dev/null || true

# Build and start all services
if [ "$1" = "--build" ]; then
  echo "=== Building Services ==="
  docker compose -f "$COMPOSE_FILE" build
fi

echo "=== Starting All Services ==="
docker compose -f "$COMPOSE_FILE" up -d

echo ""
echo "=== Platform Running ==="
echo "  API Gateway:      http://localhost:3001"
echo "  Web Dashboard:    http://localhost:3000"
echo "  Dev Console:      http://localhost:3001 (separate app)"
echo "  MinIO Console:    http://localhost:9001"
echo "  Qdrant Dashboard: http://localhost:6333/dashboard"
echo ""
echo "Health check: curl http://localhost:3001/health"
