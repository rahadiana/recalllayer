# Web Dashboard

Next.js 15 user dashboard for document upload, search, and connector management.

## Quick Start

```bash
pnpm dev
# Opens at http://localhost:3000
```

## Responsibility

Aplikasi user untuk upload data, search memory, melihat dokumen, dan manage source.

## Owns

- User-facing dashboard routes.
- Upload/search/document management UI.
- Connector status UI.
- Client-side state untuk tampilan.

## Allowed

- Call `services/api-gateway` public API.
- Use `packages/ui` for shared components.
- Use `sdks/typescript` or `sdks/react` after stable.

## Forbidden

- Direct call ke internal services.
- Direct DB/vector/queue access.
- Business logic untuk RAG, indexing, graph, atau profile memory.

## Definition of Done

- Upload, search, document list, dan connector status punya UI.
- Error/loading/empty state tersedia.
- Tests untuk critical components.
- README usage dan environment variables tersedia.
