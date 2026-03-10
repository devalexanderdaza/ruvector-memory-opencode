import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { plugin } from "../../src/plugin-manifest.js";

const TMP_ROOT = join(process.cwd(), ".tmp-save-search-tests");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("Save + Search integration", () => {
  it("saves content and retrieves it ranked highest for identical query", async () => {
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

    const first = await memorySave?.("alpha memory");
    const second = await memorySave?.("beta memory");

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);

    const search = await memorySearch?.({ query: "alpha memory", limit: 2 });
    expect(search.success).toBe(true);
    if (search.success) {
      expect(search.data.items.length).toBeGreaterThan(0);
      expect(search.data.items[0].content).toBe("alpha memory");
      // For cosine in this build, lower score behaves like "closer" (better).
      if (search.data.items.length > 1) {
        expect(search.data.items[0].score).toBeLessThanOrEqual(
          search.data.items[1].score,
        );
      }
    }
  });
});
