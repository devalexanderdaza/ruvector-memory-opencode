import { describe, it, expect, vi, afterEach } from "vitest";
import { plugin } from "../../../src/plugin-manifest.js";
import { join } from "node:path";
import { rmSync } from "node:fs";
import * as pluginModule from "../../../src/core/plugin.js";

const TMP_ROOT = join(process.cwd(), ".tmp-unit-memory-save-errors");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
  vi.restoreAllMocks();
  (pluginModule as any).resetPluginStateForTests?.();
});

describe("memory_save tool error paths", () => {
  it("returns error when plugin is not activated", async () => {
    const { createMemorySaveTool } = await import("../../../src/tools/tools/memory-save-tool.js");
    const saveTool = createMemorySaveTool();
    
    // Ensure store is null
    vi.spyOn(pluginModule, 'getVectorStoreAdapterForTools').mockReturnValue(null as any);
    
    const result = await saveTool({ content: "test" }) as any;
    expect(result.success).toBe(false);
    expect(result.code).toBe("PLUGIN_NOT_ACTIVATED");
  });

  it("handles storage errors gracefully", async () => {
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

    const saveTool = registered["memory_save"];
    const store = (pluginModule as any).getVectorStoreAdapterForTools();
    
    // Mock save to fail
    vi.spyOn(store, 'save').mockRejectedValueOnce(new Error("Storage full"));

    const result = await (saveTool as any)?.({ content: "test" });
    expect(result.success).toBe(false);
    expect(result.code).toBe("EUNEXPECTED");
    expect(result.error).toContain("Storage full");
  });

  it("respects different priority levels for importance", async () => {
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

    const saveTool = registered["memory_save"] as any;
    const store = (pluginModule as any).getVectorStoreAdapterForTools();
    const saveSpy = vi.spyOn(store, 'save').mockResolvedValue({ success: true, data: { id: "1" } });

    // Test Low priority
    await saveTool?.({ content: "test low", priority: "low" });
    expect(saveSpy).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ importance: 1 }));

    // Test Critical priority
    await saveTool?.({ content: "test critical", priority: "critical" });
    expect(saveSpy).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ importance: 5 }));

    // Test Normal/Default priority
    await saveTool?.({ content: "test normal", priority: "normal" });
    expect(saveSpy).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ importance: 3 }));
  });
});
