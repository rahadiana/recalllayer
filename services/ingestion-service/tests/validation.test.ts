import { describe, it, expect } from "vitest";
import {
  validateIngestPayload,
  validateListDocumentsQuery,
  validateFileMetadata,
  validateTextSize,
} from "../src/validation.js";

describe("validateIngestPayload", () => {
  const validPayload = {
    workspace_id: "ws_abc123",
    document: {
      title: "Test Document",
      source: {
        type: "upload" as const,
        filename: "test.txt",
        mime_type: "text/plain",
        size_bytes: 1024,
      },
    },
    created_by: "user_xyz",
  };

  it("accepts a valid payload", () => {
    const result = validateIngestPayload(validPayload);
    expect(result.valid).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.workspace_id).toBe("ws_abc123");
    expect(result.data!.document.title).toBe("Test Document");
  });

  it("rejects missing workspace_id", () => {
    const { workspace_id, ...missingWs } = validPayload;
    const result = validateIngestPayload(missingWs);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "workspace_id")).toBe(true);
  });

  it("rejects missing created_by", () => {
    const { created_by, ...missingCreatedBy } = validPayload;
    const result = validateIngestPayload(missingCreatedBy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "created_by")).toBe(true);
  });

  it("rejects empty title", () => {
    const result = validateIngestPayload({
      ...validPayload,
      document: { ...validPayload.document, title: "" },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects missing title", () => {
    const { title, ...noTitle } = {
      ...validPayload,
      document: { ...validPayload.document },
    };
    const result = validateIngestPayload({
      ...validPayload,
      document: { ...noTitle },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid source type", () => {
    const result = validateIngestPayload({
      ...validPayload,
      document: {
        ...validPayload.document,
        source: { type: "invalid" },
      },
    });
    expect(result.valid).toBe(false);
  });

  it("accepts optional correlation_id", () => {
    const result = validateIngestPayload({
      ...validPayload,
      correlation_id: "corr_123",
    });
    expect(result.valid).toBe(true);
    expect(result.data!.correlation_id).toBe("corr_123");
  });

  it("accepts document with url source type", () => {
    const result = validateIngestPayload({
      ...validPayload,
      document: {
        title: "URL Doc",
        source: {
          type: "url",
          location: "https://example.com",
        },
      },
    });
    expect(result.valid).toBe(true);
    expect(result.data!.document.source.type).toBe("url");
  });

  it("accepts document with connector source type", () => {
    const result = validateIngestPayload({
      ...validPayload,
      document: {
        title: "Connector Doc",
        source: {
          type: "connector",
          connector: "slack",
          location: "channel-123",
        },
      },
    });
    expect(result.valid).toBe(true);
    expect(result.data!.document.source.type).toBe("connector");
  });

  it("includes field-level error details", () => {
    const result = validateIngestPayload({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    for (const err of result.errors) {
      expect(err).toHaveProperty("field");
      expect(err).toHaveProperty("message");
    }
  });
});

describe("validateListDocumentsQuery", () => {
  it("accepts empty query", () => {
    const result = validateListDocumentsQuery({});
    expect(result.valid).toBe(true);
    expect(result.data!.limit).toBe(20);
  });

  it("accepts valid limit", () => {
    const result = validateListDocumentsQuery({ limit: "50" });
    expect(result.valid).toBe(true);
    expect(result.data!.limit).toBe(50);
  });

  it("rejects limit over 100", () => {
    const result = validateListDocumentsQuery({ limit: "200" });
    expect(result.valid).toBe(false);
  });

  it("rejects limit of 0", () => {
    const result = validateListDocumentsQuery({ limit: "0" });
    expect(result.valid).toBe(false);
  });

  it("accepts valid status filter", () => {
    const result = validateListDocumentsQuery({ status: "ready" });
    expect(result.valid).toBe(true);
    expect(result.data!.status).toBe("ready");
  });

  it("rejects invalid status", () => {
    const result = validateListDocumentsQuery({ status: "deleted" });
    expect(result.valid).toBe(false);
  });

  it("accepts cursor parameter", () => {
    const result = validateListDocumentsQuery({ cursor: "abc123" });
    expect(result.valid).toBe(true);
    expect(result.data!.cursor).toBe("abc123");
  });
});

describe("validateFileMetadata", () => {
  it("accepts valid file metadata", () => {
    const result = validateFileMetadata({
      mime_type: "text/plain",
      size_bytes: 1024,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects unsupported MIME type", () => {
    const result = validateFileMetadata({
      mime_type: "application/octet-stream",
      size_bytes: 1024,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("rejects oversized file", () => {
    const result = validateFileMetadata({
      mime_type: "text/plain",
      size_bytes: 60 * 1024 * 1024,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("DOCUMENT_TOO_LARGE");
  });

  it("rejects file with both bad type and oversize", () => {
    const result = validateFileMetadata({
      mime_type: "application/octet-stream",
      size_bytes: 60 * 1024 * 1024,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("accepts without mime_type", () => {
    const result = validateFileMetadata({ size_bytes: 1024 });
    expect(result.valid).toBe(true);
  });

  it("accepts without size_bytes", () => {
    const result = validateFileMetadata({ mime_type: "text/plain" });
    expect(result.valid).toBe(true);
  });
});

describe("validateTextSize", () => {
  it("accepts text under limit", () => {
    const result = validateTextSize("Hello, world!");
    expect(result.valid).toBe(true);
  });

  it("rejects text over 10 MB", () => {
    const largeText = "x".repeat(11 * 1024 * 1024);
    const result = validateTextSize(largeText);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("DOCUMENT_TOO_LARGE");
  });
});
