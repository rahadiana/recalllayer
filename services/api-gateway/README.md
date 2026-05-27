# API Gateway

Single entry point for all public API traffic. Handles auth (JWT + API key), rate limiting, validation, routing, and response aggregation.

## Quick Start

```bash
pnpm build
JWT_SECRET=<your-jwt-secret> PORT=3001 \
  INGESTION_SERVICE_URL=http://localhost:3002 \
  RETRIEVAL_SERVICE_URL=http://localhost:3005 \
  node dist/start.js
```

## Environment Variables

| Variable | Default | Required |
|---|---|---|
| PORT | 3001 | No |
| JWT_SECRET | — | Yes |
| JWT_AUDIENCE | — | No |
| JWT_ISSUER | — | No |
| INGESTION_SERVICE_URL | http://localhost:3002 | No |
| RETRIEVAL_SERVICE_URL | http://localhost:3005 | No |
| CONNECTOR_SERVICE_URL | http://localhost:3008 | No |

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Health check |
| POST | `/v1/documents` | x-api-key | Upload document |
| GET | `/v1/documents/:id` | x-api-key | Get document |
| POST | `/v1/search` | x-api-key | Hybrid search |
| POST | `/v1/context` | x-api-key | Context assembly |
| GET | `/v1/memories/:id` | x-api-key | Memory lookup |
| POST | `/v1/connectors/:type/sync` | x-api-key | Trigger sync |
| GET | `/v1/usage` | x-api-key | Usage stats |

## API Key Format

```
ak_<workspace_id>_<random>
sk_<workspace_id>_<random>
```

Example key format: `ak_<workspace_id>_<token>`

## Database

- `api_keys` — API key storage
- `rate_limit_counters` — Rate limit tracking
- `sessions` — Session management

## Migration

```bash
docker exec -i memory-postgres psql -U postgres -d memory_platform < services/api-gateway/migrations/001_init.sql
```

## Tests

```bash
pnpm test
```
