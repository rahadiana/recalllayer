# PR: Security Hardening (No Functional Behavior Break)

## Summary

This PR removes insecure defaults and hardcoded credential-like values from source/docs, and tightens startup safety for API Gateway.

## Why

- Reduce accidental credential leakage risk
- Avoid false positives and real risks from hardcoded key strings
- Enforce secure runtime configuration for production deployments

## Changes Included

### 1) Hardcoded key cleanup

- Replaced literal API-key examples in runtime/frontend code paths with placeholders:
  - `ak_<workspace_id>_<token>`

### 2) Startup safety

- API Gateway now requires `JWT_SECRET` at startup (fails fast if missing).

### 3) Environment hardening

- Frontend `MOCK_MODE` switched to env-driven toggle:
  - `NEXT_PUBLIC_MOCK_MODE=true|false`
- Docker compose JWT default placeholder changed to explicit non-usable value:
  - `replace-me-before-production`

## Files Touched (high-level)

- `services/api-gateway/src/start.ts`
- `infra/docker/docker-compose.yml`
- `apps/web-dashboard/src/lib/api.ts`
- `apps/developer-console/src/lib/api.ts`
- login/docs/example references in app/docs/readmes

## Risk Assessment

**Low-to-medium**

- Main runtime risk: environments that previously depended on implicit JWT defaults will now fail until `JWT_SECRET` is set.

## Validation Performed

- Web dashboard build: pass
- Developer console typecheck: pass
- Route smoke checks: pass on public/protected pages

## Rollback Plan

If unexpected break occurs:

1. Revert this PR commit set
2. Restore previous startup behavior while keeping docs warnings
3. Re-apply hardening in staged slices

## Follow-up (separate PR)

- Resolve Dependabot vulnerabilities (4 moderate, 1 low)
- Add automated secret scanning gate in CI
- Add runtime config validation for all services (not only API Gateway)
