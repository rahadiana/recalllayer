# Profile Memory Service

Maintains long-term user preferences, behavior patterns, and profile facts.

## Quick Start

```bash
pnpm build
PORT=3007 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform REDIS_URL=redis://localhost:6379 node dist/start.js
```

## Migration

```bash
docker exec -i memory-postgres psql -U postgres -d memory_platform < services/profile-memory-service/migrations/001_init.sql
```

## Responsibility

Maintains long-term user/workspace profile memory for personalization.

## Owns Data

- `user_profiles`
- `user_preferences`
- `behavior_events`
- `profile_facts`

## Consumes

- `search.performed` — Incoming search queries trigger preference analysis
- `document.indexed` — Document views/interactions update behaviour summary
- `profile.signal.detected` — Explicit signals (feedback, settings changes, etc.)

## Emits

- `profile.updated` — Published whenever profile, preferences, or facts change
- `preference.detected` — Published when a high-confidence inferred preference is detected

## Public API

### GET `/internal/profiles/:workspaceId?user_id=<userId>`

Returns the full `ProfileContext` for a user in a workspace, including preferences, facts, and behaviour summary.

**Response 200:**
```json
{
  "profile": {
    "workspace_id": "ws-1",
    "user_id": "user-1",
    "display_name": "John Doe",
    "preferences": [{ "key": "language", "value": "id", "source": "explicit", "confidence": 1.0, "updated_at": "..." }],
    "facts": [{ "id": "fact_1", "key": "occupation", "value": "developer", "evidence": ["doc_1"], "confidence": 0.9, "observed_at": "...", "updated_at": "..." }],
    "behaviour_summary": { "total_searches": 10, "total_document_views": 5, "top_search_terms": ["ai"], "top_categories": ["tech"], "last_active_at": "..." },
    "last_updated_at": "2024-01-02T00:00:00.000Z"
  }
}
```

**Response 404:** Profile not found.

### POST `/internal/profiles/signals`

Accepts a batch of `ProfileSignal` objects for processing.

**Request:**
```json
{
  "signals": [
    {
      "workspace_id": "ws-1",
      "user_id": "user-1",
      "signal_type": "search",
      "payload": { "query": "how to build RAG", "result_count": 10 },
      "session_id": "sess_1"
    }
  ]
}
```

**Response 200:**
```json
{
  "accepted": 1,
  "event_ids": ["evt_abc123"]
}
```

## Allowed

- Store preference facts.
- Generate profile summaries.
- Return personalization context.
- Track search behavior, document views, feedback, and explicit settings.
- Detect patterns: response style (concise/detailed), language preference (id/en), domain interests, activity patterns.

## Forbidden

- Storing all user documents.
- Replacing retrieval-service.
- Owning graph topology or document chunks.

## Configuration

| Variable                        | Default | Description                              |
|-------------------------------- | ------- | ---------------------------------------- |
| `port`                          | 3007    | Internal HTTP port                       |
| `postgresUrl`                   | —       | Postgres connection URL                  |
| `redisUrl`                      | —       | Redis connection URL (for queue)         |
| `queuePrefix`                   | profile | Queue key prefix                         |
| `inferenceConfidenceThreshold`  | 0.7     | Min confidence to auto-apply inferred prefs |
| `maxBehaviorEventsPerProfile`   | 10000   | Max behavior events retained per profile |
| `maxFactsPerProfile`            | 500     | Max profile facts per profile            |

## Example Usage

```typescript
import { createApp, startServer } from "@memory-platform/profile-memory-service";

const config = {
  port: 3007,
  postgresUrl: process.env.POSTGRES_URL!,
  redisUrl: process.env.REDIS_URL!,
};

// Programmatic usage
const { app, worker, close } = await createApp(config);
app.listen(3007);

// Or standalone server
await startServer(config);
```
