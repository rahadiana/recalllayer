# CI Infrastructure

## Responsibility

Continuous integration and deployment workflows.

## Required Checks

- Install.
- Lint.
- Typecheck.
- Unit tests.
- Integration tests where applicable.
- Build.
- Docker image build for deployable services.

## Forbidden

- Skipping tests by default.
- Committing credentials into CI config.
- Deploying from unverified builds.
