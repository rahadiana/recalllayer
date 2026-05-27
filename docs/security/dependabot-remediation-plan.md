# Dependabot Remediation Plan

Current state reported by GitHub Security tab:

- 4 moderate
- 1 low

## Objectives

1. Remove known vulnerable transitive/direct packages quickly
2. Prevent regressions with lockfile discipline and CI checks
3. Keep release velocity by batching low-risk updates first

## Triage Rules

For each alert:

- Identify scope: direct vs transitive dependency
- Identify runtime impact: production path or dev-only
- Identify exploitability: reachable code path or not
- Assign priority:
  - **P0**: reachable runtime vuln in exposed service
  - **P1**: non-reachable runtime or critical dev tool chain risk
  - **P2**: low severity / tooling-only / no reachable path

## Execution Plan

## Phase A — P0/P1 immediate

- [ ] Upgrade direct dependencies first (fastest confidence)
- [ ] Regenerate lockfile
- [ ] Run:
  - `pnpm install --frozen-lockfile`
  - service typechecks
  - web-dashboard build
  - critical API smoke tests

## Phase B — transitive + low

- [ ] Resolve remaining transitive advisories via minimal version bumps
- [ ] Re-run full checks
- [ ] Verify no routing/auth regressions

## Phase C — guardrails

- [ ] Enable Dependabot auto-PR labels (`security`, `deps`)
- [ ] Add CI gate for dependency audit (warn/fail thresholds)
- [ ] Add monthly dependency refresh cadence

## PR Strategy

Use small PRs:

1. `deps/security-p0-runtime`
2. `deps/security-p1-tooling`
3. `deps/security-p2-low`

Each PR must include:

- Alerts fixed list
- Before/after versions
- Validation evidence

## Validation Checklist (per PR)

- [ ] `pnpm --filter web-dashboard build`
- [ ] `pnpm --filter developer-console typecheck`
- [ ] `pnpm --filter api-gateway build`
- [ ] critical route/API smoke checks

## Rollback

If update breaks runtime:

1. Revert offending dependency commit
2. Pin previous safe version
3. Open follow-up issue with reproduction details
