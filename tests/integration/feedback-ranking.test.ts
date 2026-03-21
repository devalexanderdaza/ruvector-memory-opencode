import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { plugin } from "../../src/plugin-manifest.js";
import type { ToolResponse, MemorySearchResponse, MemorySaveResult, MemoryFeedbackResult } from "../../src/shared/types.js";

const TMP_ROOT = join(process.cwd(), ".tmp-integration-feedback-ranking");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

/**
 * Activates the plugin and returns all three tool handlers.
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

// Ensure tests run sequentially as they interact with the same vector db path.
describe("Feedback Ranking Integration", () => {
  it("memory receiving helpful feedback ranks higher than identical memory without feedback", async () => {
    const { activation, memorySave, memoryLearn, memorySearch } = await activateAndGet();
    expect(activation.success).toBe(true);

    // Context: creating multiple memories with identical phrasing to eliminate vector distance variance.
    const phrase = "The system handles database migrations asynchronously using queues.";

    // Save Memory A
    const saveA = await memorySave({ content: phrase });
    expect(saveA.success).toBe(true);
    const idA = saveA.success ? saveA.data.id : "";

    // Save Memory B
    const saveB = await memorySave({ content: phrase });
    expect(saveB.success).toBe(true);
    const idB = saveB.success ? saveB.data.id : "";

    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);

    // Verify initial state: Both should be returned. Since they have the exact same distance and no feedback, 
    // their order might just depend on insert order.
    const initialSearch = await memorySearch({ query: "database migrations asynchronously" });
    expect(initialSearch.success).toBe(true);
    if (!initialSearch.success) return;

    expect(initialSearch.data.results.length).toBeGreaterThanOrEqual(2);

    // Apply helpful feedback ONLY to Memory B
    const feedbackResult = await memoryLearn({
      memory_id: idB,
      feedback_type: "helpful",
    });
    expect(feedbackResult.success).toBe(true);

    // Search again
    const postFeedbackSearch = await memorySearch({ query: "database migrations asynchronously" });
    expect(postFeedbackSearch.success).toBe(true);
    if (!postFeedbackSearch.success) return;

    const results = postFeedbackSearch.data.results;
    
    // We expect both memories to be present.
    const rankA = results.findIndex(r => r.id === idA);
    const rankB = results.findIndex(r => r.id === idB);

    expect(rankA).toBeGreaterThanOrEqual(0);
    expect(rankB).toBeGreaterThanOrEqual(0);

    // Memory B received helpful feedback, so it MUST have a better (lower index) rank than A.
    expect(rankB).toBeLessThan(rankA);

    // We can also verify that B's relevance score is higher than A's due to the confidence boost.
    const scoreA = results[rankA]!.relevance;
    const scoreB = results[rankB]!.relevance;

    expect(scoreB).toBeGreaterThan(scoreA);
  });
});
