import { describe, it, expect, vi } from "vitest";
import { createMemorySearchTool } from "../../../src/tools/tools/memory-search-tool.js";
import * as pluginModule from "../../../src/core/plugin.js";

vi.mock("../../../src/core/plugin.js", () => ({
  initializeMemoryOnFirstOperation: vi.fn(),
  getVectorStoreAdapterForTools: vi.fn(),
}));

describe("memory_search additional branch coverage", () => {
  it("created_after is not string or number", async () => {
    const search = createMemorySearchTool();
    const res = await search({ query: "test", filters: { created_after: {} } });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain("must be an ISO date string or epoch");
    }
  });

  it("created_after is invalid date string", async () => {
    const search = createMemorySearchTool();
    const res = await search({ query: "test", filters: { created_after: "not-a-date" } });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain("is invalid; use an ISO date");
    }
  });

  it("created_before is not string or number", async () => {
    const search = createMemorySearchTool();
    const res = await search({ query: "test", filters: { created_before: [] } });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain("must be an ISO date string or epoch");
    }
  });

  it("created_before is invalid date string", async () => {
    const search = createMemorySearchTool();
    const res = await search({ query: "test", filters: { created_before: "not-a-date" } });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain("is invalid; use an ISO date");
    }
  });
  
  it("handles valid filters returning empty Object keys len=0", async () => {
    vi.mocked(pluginModule.initializeMemoryOnFirstOperation).mockResolvedValue({ success: true } as any);
    vi.mocked(pluginModule.getVectorStoreAdapterForTools).mockReturnValue(null);

    const search = createMemorySearchTool();
    const res = await search({ query: "test", filters: { tags: ["  "] } });
    expect(res.success).toBe(false);
    expect((res as any).code).toBe("PLUGIN_NOT_ACTIVATED");
  });
});
