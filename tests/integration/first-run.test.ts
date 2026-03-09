import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  activatePlugin,
  initializeMemoryOnFirstOperation,
  resetPluginStateForTests,
} from "../../src/core/plugin.js";

const TMP_ROOT = join(process.cwd(), ".tmp-first-run-tests");

afterEach(() => {
  resetPluginStateForTests();
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("First-Run Experience", () => {
  it("creates database on first memory operation", async () => {
    const activation = await activatePlugin({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
    });
    expect(activation.success).toBe(true);

    const opResult = await initializeMemoryOnFirstOperation();

    expect(opResult.success).toBe(true);
    expect(existsSync(join(TMP_ROOT, ".opencode", "ruvector_memory.db"))).toBe(true);
  });

  it("reuses existing database on subsequent operations", async () => {
    const activation = await activatePlugin({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
    });
    expect(activation.success).toBe(true);

    const first = await initializeMemoryOnFirstOperation();
    const second = await initializeMemoryOnFirstOperation();

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.data.firstRun).toBe(true);
      expect(second.data.firstRun).toBe(false);
    }
  });

  it("initialization completes within 1 second", async () => {
    const activation = await activatePlugin({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
    });
    expect(activation.success).toBe(true);

    const start = performance.now();
    const opResult = await initializeMemoryOnFirstOperation();
    const duration = performance.now() - start;

    expect(opResult.success).toBe(true);
    expect(duration).toBeLessThan(1000);
  });
});
