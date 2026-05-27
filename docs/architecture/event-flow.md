# Event Flow

Semua event lintas-service harus didefinisikan di `packages/shared-schemas`.

## Core Document Pipeline

```txt
document.received
  -> document.validated
  -> document.extracted
  -> document.indexed
  -> graph.updated
  -> profile.updated
```

## Connector Pipeline

```txt
connector.sync.requested
  -> external.document.discovered
  -> external.document.updated
  -> document.received
```

## Retrieval Feedback Pipeline

```txt
search.performed
  -> retrieval.feedback.recorded
  -> evaluation.run.requested
  -> evaluation.completed
```

## API Observability Pipeline

```txt
api.request.received
  -> api.request.served
  -> api.request.failed
```

## Event Envelope Requirement

Setiap event minimal memiliki:

```txt
event_id
event_type
event_version
workspace_id
actor_id
occurred_at
correlation_id
payload
```

## Rules

- Event producer wajib validasi payload memakai shared schema.
- Event consumer harus idempotent.
- Event consumer harus aman terhadap duplicate delivery.
- Breaking event changes wajib menaikkan `event_version`.
- Dead-letter queue wajib tersedia untuk job gagal berulang.
