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
});
