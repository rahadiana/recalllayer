/**
 * Internal HTTP Proxy Client
 *
 * Forwards API gateway requests to internal services
 * (ingestion, retrieval, connector) with correlation context
 * propagation and structured logging.
 */

import { createLogger, type Logger } from "@memory-platform/observability";

const log = createLogger("api-gateway:proxy");

export interface ProxyConfig {
  ingestionServiceUrl: string;
  retrievalServiceUrl: string;
  connectorServiceUrl: string;
  /** Request timeout in ms (default: 30_000). */
  timeoutMs?: number;
}

export interface ProxyResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

export interface ProxyRequestHeaders {
  authorization?: string;
  "x-api-key"?: string;
  "x-request-id"?: string;
  "x-correlation-id"?: string;
  "content-type"?: string;
  [key: string]: string | string[] | undefined;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Internal HTTP client for forwarding requests to
 * downstream microservices.
 */
export class InternalProxy {
  private readonly ingestionUrl: string;
  private readonly retrievalUrl: string;
  private readonly connectorUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ProxyConfig) {
    this.ingestionUrl = config.ingestionServiceUrl.replace(/\/$/, "");
    this.retrievalUrl = config.retrievalServiceUrl.replace(/\/$/, "");
    this.connectorUrl = config.connectorServiceUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private buildLogger(service: string, path: string): Logger {
    return log.child({ service, path });
  }

  private propagateHeaders(reqHeaders: ProxyRequestHeaders): Record<string, string> {
    const headers: Record<string, string> = {};

    if (reqHeaders["content-type"]) {
      headers["content-type"] = reqHeaders["content-type"] as string;
    }
    if (reqHeaders["x-request-id"]) {
      headers["x-request-id"] = reqHeaders["x-request-id"] as string;
    }
    if (reqHeaders["x-correlation-id"]) {
      headers["x-correlation-id"] = reqHeaders["x-correlation-id"] as string;
    }
    if (reqHeaders.authorization) {
      headers.authorization = reqHeaders.authorization as string;
    }
    if (reqHeaders["x-api-key"]) {
      headers["x-api-key"] = reqHeaders["x-api-key"] as string;
    }

    return headers;
  }

  private async request<T>(
    baseUrl: string,
    path: string,
    method: string,
    headers: ProxyRequestHeaders,
    body?: unknown,
  ): Promise<ProxyResponse<T>> {
    const url = `${baseUrl}${path}`;
    const svcLogger = this.buildLogger(
      new URL(baseUrl).hostname,
      path,
    );

    const init: RequestInit = {
      method,
      headers: this.propagateHeaders(headers),
    };

    if (body && method !== "GET" && method !== "HEAD") {
      init.headers = {
        ...init.headers,
        "content-type": "application/json",
      };
      init.body = JSON.stringify(body);
    }

    svcLogger.debug(`Proxying ${method} ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      let data: unknown;
      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        svcLogger.warn(`Upstream service returned ${response.status}`, {
          status: response.status,
          url,
          method,
        });
      }

      return {
        status: response.status,
        data: data as T,
        headers: response.headers,
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        svcLogger.error(`Request timed out after ${this.timeoutMs}ms`, {
          url,
          method,
        });
        throw new Error(`Upstream service timeout: ${url}`);
      }

      svcLogger.error("Proxy request failed", {
        url,
        method,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async forwardToIngestion<T>(
    path: string,
    method: string,
    headers: ProxyRequestHeaders,
    body?: unknown,
  ): Promise<ProxyResponse<T>> {
    return this.request<T>(this.ingestionUrl, path, method, headers, body);
  }

  async forwardToRetrieval<T>(
    path: string,
    method: string,
    headers: ProxyRequestHeaders,
    body?: unknown,
  ): Promise<ProxyResponse<T>> {
    return this.request<T>(this.retrievalUrl, path, method, headers, body);
  }

  async forwardToConnector<T>(
    path: string,
    method: string,
    headers: ProxyRequestHeaders,
    body?: unknown,
  ): Promise<ProxyResponse<T>> {
    return this.request<T>(this.connectorUrl, path, method, headers, body);
  }
}

export function createInternalProxy(config: ProxyConfig): InternalProxy {
  return new InternalProxy(config);
}
