import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  activatePlugin,
  getPluginState,
  initializeMemoryOnFirstOperation,
  resetPluginStateForTests,
} from "../../../src/core/plugin.js";

afterEach(() => {
  resetPluginStateForTests();
});

const TMP_ROOT = join(process.cwd(), ".tmp-plugin-tests");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("activatePlugin", () => {
  it("activates successfully with Node.js >=22", async () => {
    const result = await activatePlugin({ runtimeNodeVersion: "22.0.0" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.activated).toBe(true);
      expect(result.data.degraded).toBe(false);
    }
  });

  it("returns actionable error with Node.js <22", async () => {
    const result = await activatePlugin({ runtimeNodeVersion: "20.12.0" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("NODE_VERSION_UNSUPPORTED");
      expect(result.error).toContain("requires Node.js >=22.0.0");
      expect(result.error).toContain("Please upgrade: https://nodejs.org");
    }
  });

  it("returns graceful activation error when config validation fails", async () => {
    // Use negative cache_size to trigger Zod validation failure
    process.env.RUVECTOR_MEMORY_CACHE_SIZE = "-100";

    const result = await activatePlugin({ runtimeNodeVersion: "22.1.0" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("RUVECTOR_MEMORY_ERROR");
      expect(result.reason).toBe("activation");
    }

    process.env.RUVECTOR_MEMORY_CACHE_SIZE = undefined;
  });

  it("returns initial degraded state as false", () => {
    const state = getPluginState();
    expect(state.degraded).toBe(false);
  });

  it("returns explicit error if first operation runs before activation", async () => {
    const result = await initializeMemoryOnFirstOperation();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("PLUGIN_NOT_ACTIVATED");
    }
  });

  it("enters degraded mode when first operation initialization fails", async () => {
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, ".opencode"), "not-a-directory", "utf8");

    const activation = await activatePlugin({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
    });
    expect(activation.success).toBe(true);

    const initResult = await initializeMemoryOnFirstOperation();
    expect(initResult.success).toBe(false);

    const state = getPluginState();
    expect(state.degraded).toBe(true);
  });
});
