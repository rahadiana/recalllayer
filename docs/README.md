# Documentation

Folder ini adalah sumber kebenaran untuk arsitektur, API reference, dan aturan kerja AI agent.

## Isi

- `architecture/` — service map, event flow, dependency rules, data ownership.
- `api-reference/` — public API contract yang diekspos API Gateway.
- `agent-rules/` — template assignment dan checklist untuk agent implementer.
- `release/` — go-live checklist, release gates, and SaaS readiness artifacts.
- `developer/` — setup, workflows, and engineering runbooks.
- `user/` — product onboarding and usage guides.

## Rule

- Dokumentasi harus sinkron dengan `packages/shared-schemas`.
- Jangan menyimpan secret, token, credential, atau endpoint internal sensitif.
- Jika contract berubah, update dokumen dan schema bersama-sama.
