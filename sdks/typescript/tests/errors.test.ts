import { describe, it, expect } from "vitest";
import {
  MemoryPlatformError,
  ApiError,
  NetworkError,
  AuthError,
  RateLimitError,
  isMemoryPlatformError,
  isApiError,
  isNetworkError,
} from "../src/errors.js";

describe("MemoryPlatformError", () => {
  it("should create a base error with correct properties", () => {
    const error = new MemoryPlatformError("something broke", "INTERNAL_ERROR", 500, "err-001");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MemoryPlatformError);
    expect(error.message).toBe("something broke");
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.status).toBe(500);
    expect(error.errorId).toBe("err-001");
    expect(error.name).toBe("MemoryPlatformError");
  });

  it("should set status to 0 by default for network-level errors", () => {
    const error = new MemoryPlatformError("offline", "NETWORK_ERROR", 0);
    expect(error.status).toBe(0);
  });
});

describe("ApiError", () => {
  it("should extend MemoryPlatformError", () => {
    const error = new ApiError("not found", "NOT_FOUND", 404);
    expect(error).toBeInstanceOf(MemoryPlatformError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.name).toBe("ApiError");
  });

  it("should create from API response body", () => {
    const error = ApiError.fromResponse(
      {
        code: "DOCUMENT_NOT_FOUND",
        message: "Document abc not found",
        error_id: "err-002",
        details: { id: "abc" },
      },
      404,
      "/v1/documents/abc",
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe("Document abc not found");
    expect(error.code).toBe("DOCUMENT_NOT_FOUND");
    expect(error.status).toBe(404);
    expect(error.errorId).toBe("err-002");
    expect(error.details).toEqual({ id: "abc" });
    expect(error.path).toBe("/v1/documents/abc");
  });

  it("should handle missing fields in response", () => {
    const error = ApiError.fromResponse({ code: "UNKNOWN", message: "" }, 500);
    expect(error.message).toBe("");
    expect(error.code).toBe("UNKNOWN");
    expect(error.status).toBe(500);
  });
});

describe("NetworkError", () => {
  it("should extend MemoryPlatformError", () => {
    const error = new NetworkError("connection refused");
    expect(error).toBeInstanceOf(MemoryPlatformError);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.name).toBe("NetworkError");
  });

  it("should have code NETWORK_ERROR and status 0", () => {
    const error = new NetworkError("timeout");
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.status).toBe(0);
  });

  it("should store the underlying cause", () => {
    const cause = new Error("ECONNREFUSED");
    const error = new NetworkError("connection refused", cause);
    expect(error.cause).toBe(cause);
  });
});

describe("AuthError", () => {
  it("should extend ApiError", () => {
    const error = new AuthError("invalid api key");
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(AuthError);
  });

  it("should default to UNAUTHORIZED code and 401 status", () => {
    const error = new AuthError("no access");
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.status).toBe(401);
  });

  it("should accept custom code", () => {
    const error = new AuthError("forbidden resource", "FORBIDDEN", 403);
    expect(error.code).toBe("FORBIDDEN");
    expect(error.status).toBe(403);
  });
});

describe("RateLimitError", () => {
  it("should extend ApiError", () => {
    const error = new RateLimitError("too many requests");
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(RateLimitError);
  });

  it("should default to 429 status", () => {
    const error = new RateLimitError("slow down");
    expect(error.status).toBe(429);
    expect(error.code).toBe("TOO_MANY_REQUESTS");
  });

  it("should store retry-after seconds", () => {
    const error = new RateLimitError("wait", 429, "err-003", 30);
    expect(error.retryAfterSeconds).toBe(30);
  });
});

describe("type guards", () => {
  it("isMemoryPlatformError should identify base and subclass errors", () => {
    expect(isMemoryPlatformError(new MemoryPlatformError("x", "UNKNOWN", 500))).toBe(true);
    expect(isMemoryPlatformError(new ApiError("x", "NOT_FOUND", 404))).toBe(true);
    expect(isMemoryPlatformError(new Error("plain"))).toBe(false);
  });

  it("isApiError should only match ApiError subclasses", () => {
    expect(isApiError(new ApiError("x", "NOT_FOUND", 404))).toBe(true);
    expect(isApiError(new AuthError("x"))).toBe(true);
    expect(isApiError(new NetworkError("x"))).toBe(false);
    expect(isApiError(new Error("plain"))).toBe(false);
  });

  it("isNetworkError should only match NetworkError", () => {
    expect(isNetworkError(new NetworkError("x"))).toBe(true);
    expect(isNetworkError(new ApiError("x", "NOT_FOUND", 404))).toBe(false);
    expect(isNetworkError(new Error("plain"))).toBe(false);
  });
});
