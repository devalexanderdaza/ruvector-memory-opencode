import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { plugin } from "../../../src/plugin-manifest.js";

const TMP_ROOT = join(process.cwd(), ".tmp-unit-memory-search-tool");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("memory_search tool", () => {
  it("returns validation error for invalid input", async () => {
    const registered: Record<string, (input?: unknown) => Promise<any>> = {};

    const activation = await plugin.activate({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
      toolRegistry: {
        registerTool(name: string, handler: (input?: unknown) => Promise<any>) {
          registered[name] = handler;
        },
      },
    });

    expect(activation.success).toBe(true);
    const memorySearch = registered["memory_search"];
    expect(typeof memorySearch).toBe("function");

    const result = await memorySearch?.({ limit: 3 });
    expect(result).toMatchObject({
      success: false,
      code: "EINVALID",
      reason: "validation",
    });
  });

  it("defaults limit when non-numeric limit is provided", async () => {
    const registered: Record<string, (input?: unknown) => Promise<any>> = {};

    const activation = await plugin.activate({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
      toolRegistry: {
        registerTool(name: string, handler: (input?: unknown) => Promise<any>) {
          registered[name] = handler;
        },
      },
    });

    expect(activation.success).toBe(true);
    const memorySave = registered["memory_save"];
    const memorySearch = registered["memory_search"];
    expect(typeof memorySave).toBe("function");
    expect(typeof memorySearch).toBe("function");

    await memorySave?.("seed memory");

    const result = await memorySearch?.({
      query: "seed memory",
      limit: "oops",
    });
    expect(result.success).toBe(true);
  });

  it("caps limit at MAX_SEARCH_LIMIT to prevent resource exhaustion", async () => {
    const registered: Record<string, (input?: unknown) => Promise<any>> = {};

    const activation = await plugin.activate({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
      toolRegistry: {
        registerTool(name: string, handler: (input?: unknown) => Promise<any>) {
          registered[name] = handler;
        },
      },
    });

    expect(activation.success).toBe(true);
    const memorySave = registered["memory_save"];
    const memorySearch = registered["memory_search"];

    await memorySave?.("cap test memory");

    // Limit > 100 should still return successfully (capped internally).
    const result = await memorySearch?.({
      query: "cap test memory",
      limit: 999999,
    });
    // Should succeed — the cap prevents resource exhaustion rather than rejecting.
    expect(result.success).toBe(true);
  });

  it("returns EINVALID when filters.created_after is not a valid date", async () => {
    const registered: Record<string, (input?: unknown) => Promise<any>> = {};

    const activation = await plugin.activate({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
      toolRegistry: {
        registerTool(name: string, handler: (input?: unknown) => Promise<any>) {
          registered[name] = handler;
        },
      },
    });

    expect(activation.success).toBe(true);
    const memorySearch = registered["memory_search"];
    expect(typeof memorySearch).toBe("function");

    const result = await memorySearch?.({
      query: "seed memory",
      filters: { created_after: "not-a-date" },
    });

    expect(result).toMatchObject({
      success: false,
      code: "EINVALID",
      reason: "validation",
    });
  });

  it("returns EINVALID when created_after is greater than or equal to created_before", async () => {
    const registered: Record<string, (input?: unknown) => Promise<any>> = {};

    const activation = await plugin.activate({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
      toolRegistry: {
        registerTool(name: string, handler: (input?: unknown) => Promise<any>) {
          registered[name] = handler;
        },
      },
    });

    expect(activation.success).toBe(true);
    const memorySearch = registered["memory_search"];
    expect(typeof memorySearch).toBe("function");

    const result = await memorySearch?.({
      query: "seed memory",
      filters: {
        created_after: "2030-01-01T00:00:00.000Z",
        created_before: "2020-01-01T00:00:00.000Z",
      },
    });

    expect(result).toMatchObject({
      success: false,
      code: "EINVALID",
      reason: "validation",
    });
  });

  it("returns EINVALID when filters is not an object", async () => {
    const registered: Record<string, (input?: unknown) => Promise<any>> = {};

    const activation = await plugin.activate({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
      toolRegistry: {
        registerTool(name: string, handler: (input?: unknown) => Promise<any>) {
          registered[name] = handler;
        },
      },
    });

    expect(activation.success).toBe(true);
    const memorySearch = registered["memory_search"];

    const result = await memorySearch?.({
      query: "seed memory",
      filters: "bad-filters",
    });

    expect(result).toMatchObject({
      success: false,
      code: "EINVALID",
      reason: "validation",
    });
  });

  it("returns EINVALID when filters.tags is not an array", async () => {
    const registered: Record<string, (input?: unknown) => Promise<any>> = {};

    const activation = await plugin.activate({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
      toolRegistry: {
        registerTool(name: string, handler: (input?: unknown) => Promise<any>) {
          registered[name] = handler;
        },
      },
    });

    expect(activation.success).toBe(true);
    const memorySearch = registered["memory_search"];

    const result = await memorySearch?.({
      query: "seed memory",
      filters: { tags: "not-array" },
    });

    expect(result).toMatchObject({
      success: false,
      code: "EINVALID",
      reason: "validation",
    });
  });

  it("returns EINVALID when filters.source is empty", async () => {
    const registered: Record<string, (input?: unknown) => Promise<any>> = {};

    const activation = await plugin.activate({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
      toolRegistry: {
        registerTool(name: string, handler: (input?: unknown) => Promise<any>) {
          registered[name] = handler;
        },
      },
    });

    expect(activation.success).toBe(true);
    const memorySearch = registered["memory_search"];

    const result = await memorySearch?.({
      query: "seed memory",
      filters: { source: "   " },
    });

    expect(result).toMatchObject({
      success: false,
      code: "EINVALID",
      reason: "validation",
    });
  });

  it("returns EINVALID when filters.created_before is invalid", async () => {
    const registered: Record<string, (input?: unknown) => Promise<any>> = {};

    const activation = await plugin.activate({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
      toolRegistry: {
        registerTool(name: string, handler: (input?: unknown) => Promise<any>) {
          registered[name] = handler;
        },
      },
    });

    expect(activation.success).toBe(true);
    const memorySearch = registered["memory_search"];

    const result = await memorySearch?.({
      query: "seed memory",
      filters: { created_before: Number.POSITIVE_INFINITY },
    });

    expect(result).toMatchObject({
      success: false,
      code: "EINVALID",
      reason: "validation",
    });
  });
});
