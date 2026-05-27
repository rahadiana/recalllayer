import { describe, it, expect } from "vitest";
import {
  createCursor,
  parseCursor,
  applyPagination,
} from "../src/pagination.js";

describe("createCursor / parseCursor", () => {
  it("encodes and decodes a string", () => {
    const cursor = createCursor("hello");
    expect(cursor).toBeTypeOf("string");
    expect(cursor).not.toBe("hello");
    expect(parseCursor(cursor)).toBe("hello");
  });

  it("encodes and decodes a number", () => {
    const cursor = createCursor(42);
    expect(parseCursor(cursor)).toBe(42);
  });

  it("encodes and decodes an object", () => {
    const obj = { id: "abc", ts: 123456 };
    const cursor = createCursor(obj);
    expect(parseCursor(cursor)).toEqual(obj);
  });

  it("returns empty string for null/undefined", () => {
    expect(createCursor(null)).toBe("");
    expect(createCursor(undefined)).toBe("");
  });

  it("parseCursor returns null for empty/undefined input", () => {
    expect(parseCursor("")).toBeNull();
    expect(parseCursor(null as unknown as string)).toBeNull();
    expect(parseCursor(undefined as unknown as string)).toBeNull();
  });

  it("parseCursor returns null for invalid base64", () => {
    expect(parseCursor("!!!invalid!!!")).toBeNull();
  });
});

describe("applyPagination", () => {
  interface TestItem {
    id: number;
    name: string;
  }

  const items: TestItem[] = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    name: `Item ${i + 1}`,
  }));

  it("applies default pagination (limit 20, offset 0, desc)", () => {
    const result = applyPagination(items);
    expect(result.items).toHaveLength(20);
    expect(result.items[0].id).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(50);
  });

  it("respects custom limit", () => {
    const result = applyPagination(items, { limit: 5 });
    expect(result.items).toHaveLength(5);
    expect(result.limit).toBe(5);
  });

  it("respects custom offset", () => {
    const result = applyPagination(items, { offset: 10, limit: 5 });
    expect(result.items).toHaveLength(5);
    expect(result.items[0].id).toBe(11);
  });

  it("caps limit at MAX_LIMIT (100)", () => {
    const bigItems = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      name: `Item ${i + 1}`,
    }));
    const result = applyPagination(bigItems, { limit: 200 });
    expect(result.limit).toBe(100);
    expect(result.items).toHaveLength(100);
  });

  it("ensures limit is at least 1", () => {
    const result = applyPagination(items, { limit: 0 });
    expect(result.limit).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it("ensures offset is non-negative", () => {
    const result = applyPagination(items, { offset: -5 });
    expect(result.offset).toBe(0);
  });

  it("returns hasMore=false when all items fit", () => {
    const result = applyPagination(items, { limit: 100 });
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("returns hasMore=true when more items exist", () => {
    const result = applyPagination(items, { limit: 10 });
    expect(result.hasMore).toBe(true);
  });

  describe("cursor-based pagination", () => {
    it("filters by cursor in desc order", () => {
      const descItems = [...items].reverse(); // ids 50-1, descending
      const page1 = applyPagination(descItems, { limit: 10, sort: "desc" }, { cursorField: "id" });
      expect(page1.items).toHaveLength(10);
      expect(page1.items[0].id).toBe(50);

      const cursor = page1.nextCursor;
      expect(cursor).not.toBeNull();

      const page2 = applyPagination(descItems, { limit: 10, sort: "desc", cursor: cursor! }, { cursorField: "id" });
      expect(page2.items).toHaveLength(10);
      expect(page2.items[0].id).toBe(40);
    });

    it("filters by cursor in asc order", () => {
      const page1 = applyPagination(items, { limit: 10, sort: "asc" }, { cursorField: "id" });
      expect(page1.items).toHaveLength(10);
      expect(page1.items[0].id).toBe(1);

      const cursor = page1.nextCursor;
      expect(cursor).not.toBeNull();

      const page2 = applyPagination(items, { limit: 10, sort: "asc", cursor: cursor! }, { cursorField: "id" });
      expect(page2.items).toHaveLength(10);
      expect(page2.items[0].id).toBe(11);
    });

    it("nextCursor is null on last page", () => {
      const result = applyPagination(items, { limit: 100, sort: "desc" }, { cursorField: "id" });
      expect(result.nextCursor).toBeNull();
    });

    it("prevCursor is null on first page (offset=0)", () => {
      const result = applyPagination(items, { limit: 10 }, { cursorField: "id" });
      expect(result.prevCursor).toBeNull();
    });

    it("prevCursor is set when offset > 0", () => {
      const result = applyPagination(items, { offset: 10 }, { cursorField: "id" });
      expect(result.prevCursor).not.toBeNull();
      expect(result.items[0].id).toBe(11);
    });
  });

  it("handles empty items array", () => {
    const result = applyPagination([]);
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.total).toBe(0);
  });
});
