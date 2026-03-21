import { describe, it, expect, vi, afterEach } from "vitest";
import { plugin } from "../../../src/plugin-manifest.js";
import { join } from "node:path";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import * as pluginModule from "../../../src/core/plugin.js";
import { VectorStoreAdapter } from "../../../src/vector/vector-store.js";

const TMP_ROOT = join(process.cwd(), ".tmp-unit-memory-search-errors");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
  vi.restoreAllMocks();
  (pluginModule as any).resetPluginStateForTests();
});

describe("memory_search error paths", () => {
  it("handles vectorStore.search throwing an error", async () => {
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
    const searchTool = registered["memory_search"];

    // Mock vectorStore.search to throw
    const store = (pluginModule as any).getVectorStoreAdapterForTools();
    vi.spyOn(store, 'search').mockRejectedValueOnce(new Error("Vector store search failed"));

    const result = await searchTool?.({ query: "test" });
    
    expect(result.success).toBe(false);
    expect(result.code).toBe("EUNEXPECTED");
    expect(result.error).toContain("Vector store search failed");
  });

  it("handles malformed metadata in search results", async () => {
    const registered: Record<string, (input?: unknown) => Promise<any>> = {};

    await plugin.activate({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
      toolRegistry: {
        registerTool(name: string, handler: (input?: unknown) => Promise<any>) {
          registered[name] = handler;
        },
      },
    });

    const searchTool = registered["memory_search"];
    const store = (pluginModule as any).getVectorStoreAdapterForTools();
    
    // Mock search to return items with malformed metadata
    vi.spyOn(store, 'search').mockResolvedValueOnce({
      success: true,
      data: {
        items: [
          { id: "1", score: 0.1, metadata: "{ invalid json" }
        ]
      }
    });

    // The tool should still succeed but with default values from formatter
    const result = await searchTool?.({ query: "test" });
    expect(result.success).toBe(true);
    expect(result.data.results[0].content).toBe("");
  });
  
  it("handles missing store in memory_search", async () => {
    const registered: Record<string, (input?: unknown) => Promise<any>> = {};
    
    await plugin.activate({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
      toolRegistry: {
        registerTool(name: string, handler: (input?: unknown) => Promise<any>) {
          registered[name] = handler;
        },
      },
    });
    
    const searchTool = registered["memory_search"];
    
    // Force store to be null
    vi.spyOn(pluginModule, 'getVectorStoreAdapterForTools').mockReturnValue(null as any);
    
    const result = await searchTool?.({ query: "test" });
    expect(result.success).toBe(false);
    expect(result.code).toBe("PLUGIN_NOT_ACTIVATED");
  });
});
