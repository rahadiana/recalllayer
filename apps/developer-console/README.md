# Developer Console

Next.js 15 dashboard for API keys, usage stats, request logs, and workspace settings.

## Quick Start

```bash
pnpm dev
# Opens at http://localhost:3001
```

## Responsibility

Aplikasi developer untuk API keys, usage, logs, billing placeholder, workspace/project settings.

## Owns

- API key management UI.
- Usage/quota dashboard.
- Request log viewer.
- Workspace/project settings UI.

## Allowed

- Call only `services/api-gateway` public API.
- Use shared components from `packages/ui`.

## Forbidden

- Memory processing.
- Direct service/database calls.
- Billing provider secret in frontend.

## Definition of Done

- API key flow documented.
- Usage/log screens have loading/error states.
- No secrets in frontend code.
