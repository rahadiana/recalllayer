# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/indexing-service/package.json services/indexing-service/tsconfig.json ./services/indexing-service/
RUN pnpm install --frozen-lockfile

COPY services/indexing-service/src ./services/indexing-service/src
WORKDIR /app/services/indexing-service
RUN pnpm build
RUN pnpm deploy --filter @memory-platform/indexing-service --prod /prod-app

FROM node:22-alpine
RUN apk add --no-cache tini
COPY --from=builder /prod-app /app
WORKDIR /app
EXPOSE 3004
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/start.js"]
