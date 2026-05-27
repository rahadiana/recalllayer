# syntax=docker/dockerfile:1
# =============================================================================
# API Gateway — Multi-stage Docker build
# =============================================================================

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy workspace root configs
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./

# Copy shared packages (workspace dependencies)
COPY packages ./packages

# Copy service package manifest for dependency resolution
COPY services/api-gateway/package.json services/api-gateway/tsconfig.json ./services/api-gateway/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY services/api-gateway/src ./services/api-gateway/src
WORKDIR /app/services/api-gateway
RUN pnpm build

# Deploy production-only dependencies into a clean directory
RUN pnpm deploy --filter @memory-platform/api-gateway --prod /prod-app

# ── Production Stage ───────────────────────────────────────────────────────────
FROM node:22-alpine
RUN apk add --no-cache tini
COPY --from=builder /prod-app /app
WORKDIR /app
EXPOSE 3001
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/start.js"]
