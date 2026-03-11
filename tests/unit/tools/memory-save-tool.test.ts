import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { plugin } from "../../../src/plugin-manifest.js";

const TMP_ROOT = join(process.cwd(), ".tmp-unit-memory-save-tool");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("memory_save tool", () => {
  it("enriches saved metadata with detected project context", async () => {
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

    const saveResult = await memorySave?.({
      content: "project metadata content",
      tags: ["meta"],
      source: "unit-test",
    });
    expect(saveResult?.success).toBe(true);

    const searchResult = await memorySearch?.({
      query: "project metadata content",
      limit: 1,
    });

    expect(searchResult?.success).toBe(true);
    const firstItem = searchResult?.data.results[0];
    expect(firstItem?.projectContext).toBe(".tmp-unit-memory-save-tool");
    expect(firstItem?.projectName).toBe(".tmp-unit-memory-save-tool");
    expect(firstItem?.projectType).toBe("generic");
    expect(firstItem?.primaryLanguage).toBe("unknown");
    // Empty array means "detected, no known frameworks" — distinct from undefined.
    expect(firstItem?.frameworks).toEqual([]);
  });

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
    const memorySave = registered["memory_save"];
    expect(typeof memorySave).toBe("function");

    const result = await memorySave?.({ not_content: true });
    expect(result).toMatchObject({
      success: false,
      code: "EINVALID",
      reason: "validation",
    });
  });

  it("accepts object input with { content }", async () => {
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
    expect(typeof memorySave).toBe("function");

    const result = await memorySave?.({ content: "alpha object content" });
    expect(result.success).toBe(true);
  });

  it("applies default metadata when only content is provided", async () => {
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

    const saveResult = await memorySave?.("default metadata content");
    expect(saveResult?.success).toBe(true);

    const searchResult = await memorySearch?.("default metadata content");
    expect(searchResult?.success).toBe(true);
    const firstItem = searchResult?.data.results[0];
    // SearchResult exposes normalized public fields:
    // source defaults to "manual" when stored value is not a valid enum
    expect(firstItem?.source).toBe("manual");
    expect(Array.isArray(firstItem?.tags)).toBe(true);
  });

  it("persists explicit metadata fields when provided", async () => {
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

    const saveResult = await memorySave?.({
      content: "metadata rich content",
      tags: ["one", "two"],
      source: "unit-test",
      priority: "critical",
      confidence: 0.9,
    });
    expect(saveResult?.success).toBe(true);

    const searchResult = await memorySearch?.("metadata rich content");
    expect(searchResult?.success).toBe(true);
    const firstItem = searchResult?.data.results[0];
    // "unit-test" is not a valid SearchResult source enum, normalized to "manual"
    expect(firstItem?.source).toBe("manual");
    // Tags are passed through directly from stored metadata
    expect(firstItem?.tags).toEqual(["one", "two"]);
  });
});
