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
});
