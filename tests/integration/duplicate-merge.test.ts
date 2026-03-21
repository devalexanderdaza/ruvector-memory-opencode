import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { plugin } from "../../src/plugin-manifest.js";
import type { ToolResponse, MemorySearchResponse, MemorySaveResult, MemoryFeedbackResult } from "../../src/shared/types.js";

const TMP_ROOT = join(process.cwd(), ".tmp-integration-duplicate-merge");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

/**
 * Activates the plugin and returns all tool handlers.
 */
async function activateAndGet() {
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

  return {
    activation,
    memorySave: registered["memory_save"]! as (input?: unknown) => Promise<ToolResponse<MemorySaveResult>>,
    memoryLearn: registered["memory_learn_from_feedback"]! as (input?: unknown) => Promise<ToolResponse<MemoryFeedbackResult>>,
    memorySearch: registered["memory_search"]! as (input?: unknown) => Promise<ToolResponse<MemorySearchResponse>>,
  };
}

describe("Duplicate Detection and Memory Merge Integration", () => {
  it("marking a memory as a duplicate of another links them and penalizes the duplicate", async () => {
    const { activation, memorySave, memoryLearn, memorySearch } = await activateAndGet();
    expect(activation.success).toBe(true);

    const phrase = "The project uses tsup for bundling TypeScript code.";

    // Save Memory A (Canonical)
    const saveA = await memorySave({ content: phrase });
    expect(saveA.success).toBe(true);
    const idA = saveA.success ? saveA.data.id : "";

    // Save Memory B (Duplicate)
    const saveB = await memorySave({ content: phrase });
    expect(saveB.success).toBe(true);
    const idB = saveB.success ? saveB.data.id : "";

    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();

    // Mark B as duplicate of A
    const mergeResult = await memoryLearn({
      memory_id: idB,
      feedback_type: "duplicate",
      canonical_id: idA
    });

    expect(mergeResult.success).toBe(true);
    if (mergeResult.success) {
      expect(mergeResult.data.merged_into_id).toBe(idA);
    }

    // Verify search results
    const searchRes = await memorySearch({ query: "bundling TypeScript code" });
    expect(searchRes.success).toBe(true);
    if (!searchRes.success) return;

    const results = searchRes.data.results;
    const memoryA = results.find(r => r.id === idA);
    const memoryB = results.find(r => r.id === idB);

    expect(memoryA).toBeDefined();
    expect(memoryB).toBeDefined();

    // Memory B should have -1.0 confidence and be at the bottom
    // After fixing Task 1 and 2, this should pass.
    expect(memoryB!.confidence).toBe(-1.0);
    
    // Metadata should reflect the merge
    // @ts-ignore - mergedIntoId added to SearchResult
    expect(memoryB!.mergedIntoId).toBe(idA);
  });

  it("duplicate feedback without canonical_id returns an error or handles it gracefully", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({ content: "test memory" });
    const memoryId = saveResult.success ? saveResult.data.id : "";

    const result = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "duplicate",
      // canonical_id is missing
    });

    // The requirement suggests linkage is key. If no canonical_id is provided, 
    // we should probably fail or at least warn. 
    // Let's assume for now it's required for the merge workflow.
    expect(result.success).toBe(false);
    if (!result.success) {
       expect(result.code).toBe("MISSING_CANONICAL_ID");
    }
  });
});
