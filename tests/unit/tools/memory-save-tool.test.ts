import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { plugin } from "../../../src/plugin-manifest.js";

const TMP_ROOT = join(process.cwd(), ".tmp-unit-memory-save-tool");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("memory_save tool", () => {
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
    const firstItem = searchResult?.data.items[0];
    expect(firstItem?.metadata).toMatchObject({
      source: "unknown",
      priority: "normal",
      confidence: 0.5,
    });
    expect(Array.isArray(firstItem?.metadata?.tags)).toBe(true);
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
    const firstItem = searchResult?.data.items[0];
    expect(firstItem?.metadata).toMatchObject({
      source: "unit-test",
      priority: "critical",
      confidence: 0.9,
    });
    expect(firstItem?.metadata?.tags).toEqual(["one", "two"]);
  });
});
