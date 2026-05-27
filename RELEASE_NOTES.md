# RecallLayer — Release Notes

## Version

`v1.0.0-beta.1`

## Release Date

`2026-05-27`

## Highlights

- Rebrand from **Agentic Memory Platform** to **RecallLayer**
- Public product landing page enabled at `/`
- Core dashboard moved to `/dashboard`
- Signup + login flow added to web-dashboard
- Multi-tenant quota enforcement implemented in ingestion pipeline
- Developer Console quota panel added (`/settings`)
- Docker + migrations + seed scripts prepared for go-live

## Core Platform Status

- Infrastructure: Postgres, Redis, Qdrant, MinIO, OTel
- Services implemented: API Gateway, Ingestion, Extraction, Indexing, Retrieval, Memory Graph, Profile Memory, Connector, Evaluation
- Frontends: Web Dashboard, Developer Console
- SDKs: TypeScript, React

## Included Docs

- `README.md` (root, updated)
- `docs/release/go-live-checklist.md`
- `docs/developer/local-setup.md`
- `docs/user/getting-started.md`

## Breaking / Behavior Changes

1. Route behavior:
   - `/` now serves public landing page
   - app dashboard moved to `/dashboard`
2. Frontend mock mode:
   - `MOCK_MODE` now controlled via `NEXT_PUBLIC_MOCK_MODE`

## Required Environment Variables

### Web Dashboard / Developer Console

- `NEXT_PUBLIC_MOCK_MODE` (`true|false`)

### API Gateway

- `JWT_SECRET`
- `INGESTION_SERVICE_URL`
- `RETRIEVAL_SERVICE_URL`

### Ingestion Service

- `DATABASE_URL`

### Retrieval Service

- `DATABASE_URL`
- `QDRANT_URL`

## Known Limitations (Beta)

- Some developer-console sections (`/api-keys`, `/logs`) still rely on mock-backed flows unless backend endpoints are enabled.
- Full OAuth connector activation beyond Notion requires additional provider setup.

## Recommended Next Steps (Post-release)

1. Enable CI security gates (SAST/SCA/container scan) as blocking checks
2. Add production secret manager integration
3. Add billing plans + checkout flow
4. Add legal docs: Terms, Privacy, DPA
