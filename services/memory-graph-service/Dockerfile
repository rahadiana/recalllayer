# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/memory-graph-service/package.json services/memory-graph-service/tsconfig.json ./services/memory-graph-service/
RUN pnpm install --frozen-lockfile

COPY services/memory-graph-service/src ./services/memory-graph-service/src
WORKDIR /app/services/memory-graph-service
RUN pnpm build
RUN pnpm deploy --filter @memory-platform/memory-graph-service --prod /prod-app

FROM node:22-alpine
RUN apk add --no-cache tini
COPY --from=builder /prod-app /app
WORKDIR /app
EXPOSE 3006
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
