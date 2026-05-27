# RecallLayer Go-Live Checklist (SaaS)

Use this checklist before pushing and releasing to production.

## 1) Product & Branding

- [ ] Product name and copy are consistently **RecallLayer** across apps/docs
- [ ] Public landing page is accessible at `/`
- [ ] Terms/Privacy links available on public pages

## 2) Environment & Secrets

- [ ] All services have `.env.example` and required env vars documented
- [ ] No real secrets committed in repo/history
- [ ] Secrets loaded from secure store (Vault/SM/KMS) in production
- [ ] `NEXT_PUBLIC_MOCK_MODE=false` in production frontend deployments

## 3) Infrastructure (Docker/K8s)

- [ ] `docker compose` boots all required dependencies
- [ ] Healthchecks pass for Postgres, Redis, Qdrant, MinIO, OTel
- [ ] Service containers start and stay healthy
- [ ] Production deployment manifests (K8s/Terraform) validated

## 4) Database & Migrations

- [ ] Migrations run cleanly from zero state
- [ ] Migrations are idempotent where needed
- [ ] Backup/restore drill completed and documented
- [ ] Rollback procedure documented for each migration batch

## 5) Security

- [ ] API key auth required for protected endpoints
- [ ] Rate limiting enabled per workspace
- [ ] Input validation enforced at API boundary
- [ ] CORS and security headers hardened
- [ ] Dependency/image vulnerability scan clean or accepted with waiver

## 6) Multi-Tenant & Quotas

- [ ] Workspace isolation verified (`workspace_id` scoping)
- [ ] `workspace_quotas` table exists and enforced
- [ ] Over-limit workspace rejected with clear error
- [ ] Other workspaces unaffected by one tenant’s limits

## 7) Core Functional Flow

- [ ] `POST /v1/documents` works end-to-end
- [ ] Extraction/indexing workers consume and publish events
- [ ] `POST /v1/search` reaches retrieval service and returns expected shape
- [ ] `GET /v1/usage` returns non-error output

## 8) Frontend Readiness

- [ ] Web dashboard routes work (`/`, `/login`, `/signup`, `/dashboard`, `/documents`, `/search`, `/connectors`)
- [ ] Developer console routes work (`/`, `/login`, `/usage`, `/settings`, `/api-keys`, `/docs`)
- [ ] No hydration mismatch warnings in browser console
- [ ] Auth cookie flow works for both apps

## 9) Observability & Operations

- [ ] Structured logs include request/workspace correlation IDs
- [ ] Traces visible across gateway → internal services
- [ ] Key dashboards exist (latency/error/throughput/queue lag)
- [ ] Alerting rules configured (P1/P2) with runbooks

## 10) CI/CD & Release

- [ ] CI gates: lint, typecheck, test, build all pass
- [ ] Release tag/changelog prepared
- [ ] Canary/staging smoke tests pass
- [ ] Rollback command tested

## 11) Docs Complete

### Developer docs
- [ ] Architecture overview
- [ ] Local setup and runbook
- [ ] Migrations and DB ownership
- [ ] Incident response and troubleshooting

### User docs
- [ ] Getting started
- [ ] Dashboard usage
- [ ] Connector setup
- [ ] Quota behavior and limits

---

## Release Sign-off

- Engineering Lead: ____________________
- Product Owner: _______________________
- Security Review: _____________________
- Operations Review: ___________________
- Date: ________________________________
