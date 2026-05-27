import {
  ApiError,
  AuthError,
  NetworkError,
  RateLimitError,
} from "./errors.js";

const DEFAULT_BASE_URL = "http://localhost:3001";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export interface ClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  workspaceId?: string;
}

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  queryParams?: Record<string, string | number | boolean | undefined>;
  workspaceId?: string;
  headers?: Record<string, string>;
}

export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly defaultWorkspaceId?: string;

  constructor(config: ClientConfig) {
    if (!config.apiKey) {
      throw new AuthError("API key is required. Set it via `new MemoryClient({ apiKey })`.");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.defaultWorkspaceId = config.workspaceId;
  }

  async request<T>(options: RequestOptions): Promise<HttpResponse<T>> {
    const workspaceId = options.workspaceId ?? this.defaultWorkspaceId;
    const headers = this.buildHeaders(options.headers, workspaceId);
    const url = this.buildUrl(options.path, options.queryParams);

    return this.executeWithRetry<T>(url, options.method, headers, options.body, 0);
  }

  private async executeWithRetry<T>(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: unknown,
    attempt: number,
  ): Promise<HttpResponse<T>> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const fetchInit: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body !== undefined && method !== "GET") {
        fetchInit.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchInit);
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as T;
        return { data, status: response.status, headers: response.headers };
      }

      return this.handleErrorResponse<T>(response, url, method, headers, body, attempt);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new NetworkError(`Request timed out after ${this.timeoutMs}ms`);
      }
      if (error instanceof ApiError || error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(
        `Network request failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  private async handleErrorResponse<T>(
    response: Response,
    url: string,
    method: string,
    headers: Record<string, string>,
    body: unknown,
    attempt: number,
  ): Promise<HttpResponse<T>> {
    let errorBody: Record<string, unknown> = {};
    try {
      errorBody = (await response.json()) as Record<string, unknown>;
    } catch {
      errorBody = {};
    }

    if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < this.maxRetries) {
      await this.delay(this.calculateBackoff(attempt, response));
      return this.executeWithRetry<T>(url, method, headers, body, attempt + 1);
    }

    if (response.status === 401 || response.status === 403) {
      throw new AuthError(
        (errorBody.message as string) ?? "Authentication failed",
        (errorBody.code as string) ?? "UNAUTHORIZED",
        response.status,
        errorBody.error_id as string | undefined,
        errorBody.details,
      );
    }

    if (response.status === 429) {
      const retryAfter = this.parseRetryAfter(response.headers.get("Retry-After"));
      throw new RateLimitError(
        (errorBody.message as string) ?? "Rate limit exceeded",
        response.status,
        errorBody.error_id as string | undefined,
        retryAfter,
      );
    }

    throw ApiError.fromResponse(
      {
        code: (errorBody.code as string) ?? "UNKNOWN",
        message: (errorBody.message as string) ?? response.statusText,
        error_id: errorBody.error_id as string | undefined,
        details: errorBody.details ?? errorBody.fields,
        path: errorBody.path as string | undefined,
      },
      response.status,
      url,
    );
  }

  private buildHeaders(
    extraHeaders?: Record<string, string>,
    workspaceId?: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      ...extraHeaders,
    };

    if (workspaceId) {
      headers["x-workspace-id"] = workspaceId;
    }

    return headers;
  }

  private buildUrl(
    path: string,
    queryParams?: Record<string, string | number | boolean | undefined>,
  ): string {
    const url = new URL(path, this.baseUrl);

    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  private calculateBackoff(attempt: number, response: Response): number {
    const retryAfter = this.parseRetryAfter(response.headers.get("Retry-After"));
    if (retryAfter !== undefined) {
      return retryAfter * 1000;
    }
    const baseMs = 500;
    const maxMs = 30_000;
    return Math.min(baseMs * Math.pow(2, attempt) + Math.random() * 200, maxMs);
  }

  private parseRetryAfter(header: string | null): number | undefined {
    if (!header) return undefined;
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds;
    }
    const date = Date.parse(header);
    if (!Number.isNaN(date)) {
      return Math.max(0, Math.ceil((date - Date.now()) / 1000));
    }
    return undefined;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);
      if (timeout.unref) timeout.unref();
    });
  }
}
