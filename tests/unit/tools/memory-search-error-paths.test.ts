import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMemorySearchTool } from "../../../src/tools/tools/memory-search-tool.js";
import * as pluginModule from "../../../src/core/plugin.js";
import { logger } from "../../../src/shared/logger.js";

vi.mock("../../../src/core/plugin.js", () => ({
  initializeMemoryOnFirstOperation: vi.fn(),
  getVectorStoreAdapterForTools: vi.fn(),
}));

describe("memory_search - error path coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles non-object invalid inputs", async () => {
    const search = createMemorySearchTool();
    const res = await search(123);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.reason).toBe("validation");
      expect(res.error).toBe("memory_search requires a string query or { query: string, limit?: number, filters?: {...} }");
    }
  });

  it("handles validation error for project_type string empty", async () => {
    const search = createMemorySearchTool();
    const res = await search({ query: "q", filters: { project_type: "   " } });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain("memory_search filters.project_type must be a non-empty string");
    }
  });

  it("handles validation error for primary_language string empty", async () => {
    const search = createMemorySearchTool();
    const res = await search({ query: "q", filters: { primary_language: "   " } });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain("memory_search filters.primary_language must be a non-empty string");
    }
  });

  it("returns ENOTREADY when getVectorStoreAdapterForTools returns null", async () => {
    vi.mocked(pluginModule.initializeMemoryOnFirstOperation).mockResolvedValue({ success: true } as any);
    vi.mocked(pluginModule.getVectorStoreAdapterForTools).mockReturnValue(null);

    const search = createMemorySearchTool();
    const res = await search("test");

    expect(res).toEqual({
      success: false,
      error: "Memory system unavailable: plugin not activated",
      code: "PLUGIN_NOT_ACTIVATED",
      reason: "initialization",
    });
  });

  it("returns storeResult directly if search fails", async () => {
    vi.mocked(pluginModule.initializeMemoryOnFirstOperation).mockResolvedValue({ success: true } as any);
    const mockStore = {
      search: vi.fn().mockResolvedValue({ success: false, error: "Store error", code: "ESTORE", reason: "execution" }),
    };
    vi.mocked(pluginModule.getVectorStoreAdapterForTools).mockReturnValue(mockStore as any);

    const search = createMemorySearchTool();
    const res = await search("test");

    expect(res).toEqual({
      success: false,
      error: "Store error",
      code: "ESTORE",
      reason: "execution",
    });
  });

  it("handles synchronous throw during execution (try/catch block)", async () => {
    vi.mocked(pluginModule.initializeMemoryOnFirstOperation).mockResolvedValue({ success: true } as any);
    const mockStore = {
      search: vi.fn().mockRejectedValue(new Error("Synchronous throw")),
    };
    vi.mocked(pluginModule.getVectorStoreAdapterForTools).mockReturnValue(mockStore as any);

    const search = createMemorySearchTool();
    const res = await search("test");

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain("memory_search failed: Synchronous throw");
      expect(res.reason).toBe("execution");
    }
  });

  it("catches errors during asynchronous metadata update using fire-and-forget", async () => {
    vi.mocked(pluginModule.initializeMemoryOnFirstOperation).mockResolvedValue({ success: true } as any);
    
    // Create a mock store where updateMetadata throws an error to test the catch block inside updateTasks
    const mockStore = {
      search: vi.fn().mockResolvedValue({
        success: true,
        data: { items: [{ id: "mem1", metadata: { accessCount: 1 } }] }
      }),
      updateMetadata: vi.fn().mockRejectedValue(new Error("Update failed")),
    };
    vi.mocked(pluginModule.getVectorStoreAdapterForTools).mockReturnValue(mockStore as any);

    const loggerSpy = vi.spyOn(logger, "error");

    const search = createMemorySearchTool();
    const res = await search("test");

    expect(res.success).toBe(true);

    // Wait a brief tick for async promises to resolve/reject
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Logger should catch access_count_update_failed inside the Promise.all error flow
    expect(loggerSpy).toHaveBeenCalledWith("access_count_update_failed", expect.objectContaining({
      id: "mem1"
    }));
  });
});
