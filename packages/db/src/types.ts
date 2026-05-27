export interface ClientHealth {
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs: number;
  message?: string;
  checkedAt: Date;
}

export interface ConnectionConfig {
  postgresUrl?: string;
  redisUrl?: string;
  qdrantUrl?: string;
  qdrantApiKey?: string;
  neo4jUrl?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
  s3Endpoint?: string;
  s3Region?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Bucket?: string;
  s3ForcePathStyle?: boolean;
}

export interface PostgresPool {
  sql: import("postgres").Sql;
  health(): Promise<ClientHealth>;
  close(): Promise<void>;
}

export interface RedisPool {
  client: import("ioredis").Redis;
  health(): Promise<ClientHealth>;
  close(): Promise<void>;
  withConnection<T>(fn: (client: import("ioredis").Redis) => Promise<T>): Promise<T>;
}

export interface VectorClient {
  client: import("@qdrant/js-client-rest").QdrantClient;
  health(): Promise<ClientHealth>;
  close(): Promise<void>;
  listCollections(): Promise<string[]>;
}

export interface GraphClient {
  driver: import("neo4j-driver").Driver;
  health(): Promise<ClientHealth>;
  close(): Promise<void>;
  verifyConnectivity(): Promise<boolean>;
}

export interface StorageClient {
  client: import("@aws-sdk/client-s3").S3Client;
  health(): Promise<ClientHealth>;
  close(): Promise<void>;
  listBuckets(): Promise<string[]>;
}

export interface DbClients {
  postgres?: PostgresPool;
  redis?: RedisPool;
  vector?: VectorClient;
  graph?: GraphClient;
  storage?: StorageClient;
  health(): Promise<Record<string, ClientHealth>>;
  close(): Promise<void>;
}

export interface PostgresOptions {
  max?: number;
  idleTimeout?: number;
  maxLifetime?: number;
  database?: string;
  onnotice?: (notice: unknown) => void;
}

export interface RedisOptions {
  maxRetriesPerRequest?: number;
  enableOfflineQueue?: boolean;
  lazyConnect?: boolean;
  connectionName?: string;
}

export interface QdrantOptions {
  timeout?: number;
  port?: number;
}

export interface Neo4jOptions {
  database?: string;
}

export interface StorageOptions {
  forcePathStyle?: boolean;
  bucket?: string;
}
