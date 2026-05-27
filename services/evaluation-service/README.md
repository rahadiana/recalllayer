# Evaluation Service

Measures retrieval quality: recall, precision, RAG trace analysis, hallucination risk.

## Quick Start

```bash
pnpm build
PORT=3009 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform node dist/start.js
```

## Migration

```bash
docker exec -i memory-postgres psql -U postgres -d memory_platform < services/evaluation-service/migrations/001_init.sql
```

## Responsibility

Measures retrieval and memory quality without being in the hot path.

## Owns Data

- `eval_datasets`
- `eval_runs`
- `retrieval_scores`
- `human_feedback`

## Consumes

- `search.performed`
- `retrieval.feedback.recorded`
- `evaluation.run.requested`

## Emits

- `evaluation.completed`
- `retrieval.quality.reported`

## Allowed

- Run recall/precision checks.
- Analyze RAG traces.
- Track hallucination risk indicators.
- Store human feedback.

## Forbidden

- Mutating production memory automatically without approval workflow.
- Serving user search traffic directly.
