# SDKs

Public client libraries. SDKs may only call `services/api-gateway` public API.

## Rules

- No internal service calls.
- No business logic beyond request construction, response parsing, retry, and typed errors.
- Types should come from `packages/shared-schemas` when possible.
- SDKs must never expose internal service topology to users.
