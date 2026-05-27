# Packages

Shared internal packages. Packages are not deployable services.

## Rules

- `packages/*` may not import from `services/*`, `apps/*`, or `connectors/*`.
- Shared schemas must not contain business logic.
- Shared utils must stay pure and side-effect-light.
- Runtime clients must not hide service ownership boundaries.
