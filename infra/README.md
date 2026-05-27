# Infrastructure

Infrastructure, local development, deployment, and CI/CD.

## Rules

- Secrets must be referenced through secret managers or `.env.example` placeholders only.
- Infrastructure should not encode business logic.
- Local docker must support MVP services first.
- Production manifests must keep service boundaries explicit.

## Areas

- `docker/` — local development stack.
- `kubernetes/` — production manifests.
- `terraform/` — cloud resources.
- `ci/` — build/test/deploy pipelines.
