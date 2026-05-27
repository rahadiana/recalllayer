# Docker Infrastructure — Local Development Stack

Docker Compose stack for the Agentic Memory Platform. Provides all infrastructure services needed for local development: PostgreSQL, Redis, Qdrant, Neo4j (optional), MinIO, and OpenTelemetry Collector.

## Quick Start

```bash
# From this directory
docker compose up -d
```

Wait ~30 seconds for all services to start and pass health checks.

## Services

| Service | Container | Port(s) | Dashboard / UI |
|---|---|---|---|
| PostgreSQL 16 | `memory-postgres` | 5432 | — |
| Redis 7 | `memory-redis` | 6379 | — |
| Qdrant | `memory-qdrant` | 6333 (REST), 6334 (gRPC) | http://localhost:6333/dashboard |
| MinIO | `memory-minio` | 9000 (API), 9001 (Console) | http://localhost:9001 |
| OpenTelemetry Collector | `memory-otel` | 4318 (OTLP HTTP) | — |
| Neo4j (optional) | `memory-neo4j` | 7474 (HTTP), 7687 (Bolt) | http://localhost:7474 |

### Activating Neo4j

Neo4j is commented out by default. To enable it:

1. Open `docker-compose.yml`
2. Uncomment the entire `neo4j:` service block (from `# neo4j:` to the closing `#   deploy: memory: 2G`)
3. Uncomment `neo4j_data` and `neo4j_logs` in the `volumes:` section at the bottom
4. Uncomment `GRAPH_DB_URL` and `NEO4J_AUTH` in `.env`
5. Run: `docker compose up -d neo4j`

Neo4j requires significant RAM (~2 GB). Skip it if you are not using the memory-graph service.

## Verifying Services

```bash
# Check all containers are healthy
docker compose ps

# Per-service checks
docker exec memory-postgres pg_isready -U postgres -d memory_platform
docker exec memory-redis redis-cli ping
curl -f http://localhost:6333/healthz        # Qdrant
curl -f http://localhost:9000/minio/health/live  # MinIO
curl -f http://localhost:13133/              # OTEL health check
```

Expected output for each: healthy/OK/pong response.

## Network

All services share the bridge network `memory-platform-net`. Containers can resolve each other by service name:

```
postgres          → postgres:5432
redis             → redis:6379
qdrant            → qdrant:6333
minio             → minio:9000
otel-collector    → otel-collector:4318
neo4j             → neo4j:7687 (if activated)
```

## Volumes & Data Persistence

Named volumes survive `docker compose down`:

| Volume | Mount |
|---|---|
| `memory-postgres-data` | `/var/lib/postgresql/data` |
| `memory-redis-data` | `/data` |
| `memory-qdrant-data` | `/qdrant/storage` |
| `memory-minio-data` | `/data` |
| `memory-neo4j-data` | `/data` (if activated) |

## Reset / Clean Slate

```bash
# Stop containers AND delete all named volumes (full data wipe)
docker compose down -v

# Start fresh
docker compose up -d
```

To wipe a single service:

```bash
docker compose down postgres
docker volume rm memory-postgres-data
docker compose up -d postgres
```

## Resource Limits

| Service | Memory Limit |
|---|---|
| PostgreSQL | 512 MB |
| Redis | 256 MB |
| Qdrant | 1 GB |
| MinIO | 512 MB |
| OTEL Collector | 256 MB |
| Neo4j | 2 GB |

### Estimated Minimum

- **Without Neo4j:** ~2.5 GB RAM
- **With Neo4j:** ~4.5 GB RAM

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Default |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/memory_platform` |
| `REDIS_URL` | `redis://localhost:6379` |
| `VECTOR_DB_URL` | `http://localhost:6333` |
| `GRAPH_DB_URL` | `bolt://localhost:7687` (commented) |
| `OBJECT_STORAGE_ENDPOINT` | `http://localhost:9000` |
| `OTLP_ENDPOINT` | `http://localhost:4318` |

## Forbidden

- Production secrets — use `.env` (gitignored), never commit real credentials.
- Cloud-only configurations — this stack must work entirely on localhost.
- Application Dockerfiles — those belong in each service's own directory.
