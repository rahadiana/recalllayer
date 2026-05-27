import { startServer } from "./index.js";
import { DEFAULT_CONFIG } from "./types.js";
import type { ConnectorServiceConfig } from "./types.js";

const config: ConnectorServiceConfig = {
  port: parseInt(process.env.PORT ?? String(DEFAULT_CONFIG.port ?? 3008), 10),
  postgresUrl:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/memory_platform",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  encryptionKey: process.env.ENCRYPTION_KEY || undefined,
  baseUrl: process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3008}`,
  oauthRedirectBaseUrl: process.env.OAUTH_REDIRECT_BASE_URL || undefined,
};

startServer(config).catch((err) => {
  console.error("Failed to start connector service", err);
  process.exit(1);
});
