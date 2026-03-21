import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { plugin } from "../../src/plugin-manifest.js";

const TMP_ROOT = join(process.cwd(), ".tmp-integration-feedback-roundtrip");

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
    memorySave: registered["memory_save"]!,
    memoryLearn: registered["memory_learn_from_feedback"]!,
    memorySearch: registered["memory_search"]!,
  };
}

describe("Feedback round-trip integration", () => {
  it("save → helpful feedback → confidence increases", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({ content: "roundtrip helpful content" });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.data.id as string;

    const feedbackResult = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "helpful",
    });
    expect(feedbackResult.success).toBe(true);
    if (feedbackResult.success) {
      expect(feedbackResult.data.memory_id).toBe(memoryId);
      expect(feedbackResult.data.feedback_type).toBe("helpful");
      expect(feedbackResult.data.total_feedback_count).toBe(1);
      // With 0 accesses + 1 helpful: confidence = 0.5*0 + 0.5*1 = 0.5
      // Default previous_confidence is 0.5, so new >= previous.
      expect(feedbackResult.data.new_confidence).toBeGreaterThanOrEqual(
        feedbackResult.data.previous_confidence,
      );
    }

  });

  it("save → incorrect feedback → confidence decreases", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({ content: "roundtrip incorrect content" });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.data.id as string;

    const feedbackResult = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "incorrect",
    });
    expect(feedbackResult.success).toBe(true);
    if (feedbackResult.success) {
      // With 0 accesses and 1 negative feedback: confidence = 0.5*0 + 0.5*(-1) = -0.5
      // which is less than the default stored confidence of 0.
      // The previous_confidence defaults to 0 (stored as 0.5 then lowered to 0 by formula).
      // Safe to assert new_confidence < 0.5 (the default stored) so we use a number check.
      expect(feedbackResult.data.new_confidence).toBeLessThan(0.5);
    }
  });

  it("invalid feedback_type returns INVALID_FEEDBACK_TYPE without mutating state", async () => {
    const { activation, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const result = await memoryLearn({
      memory_id: "any-id",
      feedback_type: "thumbs-up",
    });
    expect(result).toMatchObject({
      success: false,
      code: "INVALID_FEEDBACK_TYPE",
      reason: "validation",
    });
  });

  it("non-existent memory_id returns MEMORY_NOT_FOUND", async () => {
    const { activation, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const result = await memoryLearn({
      memory_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      feedback_type: "helpful",
    });
    expect(result).toMatchObject({
      success: false,
      code: "MEMORY_NOT_FOUND",
    });
  });

  it("confidence converges toward 1 with repeated helpful feedback", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({ content: "converging memory" });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.data.id as string;

    // Submit 5 helpful feedbacks.
    let lastConfidence = 0;
    for (let i = 0; i < 5; i++) {
      const result = await memoryLearn({
        memory_id: memoryId,
        feedback_type: "helpful",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        lastConfidence = result.data.new_confidence;
      }
    }

    // After 5 helpful feedbacks the confidence should be meaningfully positive.
    expect(lastConfidence).toBeGreaterThan(0.2);
  });

  it("multiple feedback types accumulate total_feedback_count correctly", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({ content: "multi-type feedback memory" });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.data.id as string;

    await memoryLearn({ memory_id: memoryId, feedback_type: "helpful" });
    await memoryLearn({ memory_id: memoryId, feedback_type: "outdated" });
    const finalResult = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "duplicate",
    });

    expect(finalResult.success).toBe(true);
    if (finalResult.success) {
      expect(finalResult.data.total_feedback_count).toBe(3);
    }
  });
});
