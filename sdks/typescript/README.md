# TypeScript SDK

Official client library for the Memory Platform public API.

## Quick Start

```bash
pnpm build
```

```typescript
import { MemoryClient } from "@memory-platform/sdk-typescript";
const client = new MemoryClient({ apiKey: "ak_xxx", baseUrl: "http://localhost:3001" });
await client.documents.add({ title: "Doc", source: { type: "api", content: "..." } });
```

## Responsibility

Official TypeScript/JavaScript client for the public API.

## Target API

```ts
client.documents.add()
client.documents.get()
client.search.query()
client.context.build()
client.memories.get()
client.connectors.sync()
```

## Allowed

- API Gateway HTTP client.
- Typed request/response objects.
- Retry for safe idempotent calls.
- Structured SDK errors.

## Forbidden

- Calling internal services.
- Implementing retrieval/indexing logic.
- Storing API keys insecurely.
