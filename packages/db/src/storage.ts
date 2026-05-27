import { performance } from "node:perf_hooks";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { createLogger, type Logger } from "@memory-platform/observability";
import type { ClientHealth, StorageClient, StorageOptions } from "./types.js";

let logger: Logger | undefined;

function getLogger(): Logger {
  if (!logger) {
    logger = createLogger("db:storage");
  }
  return logger;
}

function measureHealth(
  startMs: number,
  status: ClientHealth["status"],
  message?: string,
): ClientHealth {
  return {
    status,
    latencyMs: Math.round(performance.now() - startMs),
    message,
    checkedAt: new Date(),
  };
}

export interface StorageCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export function createStorageClient(
  endpoint: string,
  region: string,
  credentials?: StorageCredentials,
  opts?: StorageOptions,
): StorageClient {
  const log = getLogger();

  const resolvedAccessKeyId =
    credentials?.accessKeyId ?? process.env.S3_ACCESS_KEY_ID ?? "";
  const resolvedSecretAccessKey =
    credentials?.secretAccessKey ?? process.env.S3_SECRET_ACCESS_KEY ?? "";

  const client = new S3Client({
    endpoint,
    region,
    credentials:
      resolvedAccessKeyId && resolvedSecretAccessKey
        ? {
            accessKeyId: resolvedAccessKeyId,
            secretAccessKey: resolvedSecretAccessKey,
          }
        : undefined,
    forcePathStyle: opts?.forcePathStyle ?? true,
  });

  log.info("S3 client created", { endpoint, region });

  const sc: StorageClient = {
    client,

    async health(): Promise<ClientHealth> {
      const start = performance.now();
      try {
        const result = await client.send(new ListBucketsCommand({}));
        if (result.Buckets !== undefined) {
          return measureHealth(start, "healthy");
        }
        return measureHealth(start, "degraded", "unexpected response format");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn("S3 health check failed", { error: message });
        return measureHealth(start, "unhealthy", message);
      }
    },

    async close(): Promise<void> {
      log.info("Closing S3 client");
      client.destroy();
      log.info("S3 client closed");
    },

    async listBuckets(): Promise<string[]> {
      const result = await client.send(new ListBucketsCommand({}));
      return (result.Buckets ?? [])
        .map((b) => b.Name)
        .filter((n): n is string => n !== undefined);
    },
  };

  return sc;
}
