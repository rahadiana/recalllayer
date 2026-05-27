# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/connector-service/package.json services/connector-service/tsconfig.json ./services/connector-service/
RUN pnpm install --frozen-lockfile

COPY services/connector-service/src ./services/connector-service/src
WORKDIR /app/services/connector-service
RUN pnpm build
RUN pnpm deploy --filter @memory-platform/connector-service --prod /prod-app

FROM node:22-alpine
RUN apk add --no-cache tini
COPY --from=builder /prod-app /app
WORKDIR /app
EXPOSE 3008
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/start.js"]
