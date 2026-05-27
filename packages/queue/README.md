# Queue Package

## Responsibility

Typed event and job queue abstraction.

## Owns

- Publisher helper.
- Subscriber helper.
- Dead-letter queue helper.
- Retry policy primitives.
- Event envelope validation integration.

## Allowed

- Import event schemas from `packages/shared-schemas`.
- Provide framework-neutral queue clients.

## Forbidden

- Business workflow decisions.
- Hardcoded service routing logic.
- Service-specific handlers.
