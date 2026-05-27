# RecallLayer — Getting Started (Users)

## What is RecallLayer?

RecallLayer is a memory platform for AI agents. It lets you ingest documents, index them, and retrieve relevant context quickly.

## Access URLs

- Product landing: `http://localhost:3000/`
- Web app login: `http://localhost:3000/login`
- Developer console: `http://localhost:3100/login`

## Login

Use API key sign-in (MVP auth model).

Example dev key:

```txt
ak_workspace123abc_randomstring1234567890
```

## Core Workflow

1. Open dashboard
2. Upload a document
3. Wait for processing status
4. Search using natural language
5. Inspect usage and quotas in developer console

## Quotas

Each workspace can have:

- Max document count
- Max storage size

When quota is exceeded, uploads are rejected with a clear message.

## Common Errors

- `UNAUTHORIZED`: API key missing/invalid
- `VALIDATION_ERROR`: request payload missing required fields
- `Document limit reached`: workspace quota exceeded

## Need help?

Check:

- `docs/api/` for endpoint usage
- `docs/release/go-live-checklist.md` for operational readiness
