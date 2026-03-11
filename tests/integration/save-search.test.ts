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
      expect(search.data.results.length).toBeGreaterThan(0);
      expect(search.data.results[0].content).toBe("alpha memory");
      // Results are sorted by relevance descending in the enriched response.
      if (search.data.results.length > 1) {
        expect(search.data.results[0].relevance).toBeGreaterThanOrEqual(
          search.data.results[1].relevance,
        );
      }
    }
  });

  it("filters search results by metadata tags", async () => {
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

    await memorySave?.({
      content: "memory for backend",
      tags: ["backend"],
      source: "docs",
    });
    await memorySave?.({
      content: "memory for frontend",
      tags: ["frontend"],
      source: "docs",
    });

    const search = await memorySearch?.({
      query: "memory",
      limit: 5,
      filters: {
        tags: ["backend"],
      },
    });

    expect(search.success).toBe(true);
    if (search.success) {
      expect(search.data.results.length).toBeGreaterThan(0);
      for (const item of search.data.results) {
        expect(Array.isArray(item.tags)).toBe(true);
        expect(item.tags).toContain("backend");
      }
    }
  });

  it("persists and filters by detected project metadata", async () => {
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

    const save = await memorySave?.({
      content: "metadata roundtrip",
      tags: ["project-meta"],
    });
    expect(save.success).toBe(true);

    const search = await memorySearch?.({
      query: "metadata roundtrip",
      limit: 5,
      filters: {
        project_name: ".tmp-save-search-tests",
      },
    });

    expect(search.success).toBe(true);
    if (search.success) {
      expect(search.data.results.length).toBeGreaterThan(0);
      const item = search.data.results[0];
      expect(item.projectName).toBe(".tmp-save-search-tests");
      expect(item.projectContext).toBe(".tmp-save-search-tests");
    }
  });
});
