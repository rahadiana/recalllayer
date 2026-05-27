# React SDK

React hooks and provider for the Memory Platform.

## Quick Start

```bash
pnpm build
```

```tsx
import { MemoryProvider, useMemorySearch } from "@memory-platform/sdk-react";
<MemoryProvider apiKey="ak_xxx"><App /></MemoryProvider>;
const { results, loading } = useMemorySearch("query");
```

## Responsibility

React hooks and provider wrappers built on top of the TypeScript SDK.

## Target API

```ts
useMemorySearch()
useDocuments()
useConnectorStatus()
useUsage()
```

## Allowed

- Hooks for public API operations.
- Loading/error/cache state helpers.
- Provider for SDK configuration.

## Forbidden

- UI components that belong in `packages/ui`.
- Direct service/API calls bypassing TypeScript SDK.
- Internal service knowledge.
