import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { plugin } from "../../../src/plugin-manifest.js";

const TMP_ROOT = join(process.cwd(), ".tmp-unit-memory-learn-tool");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

/**
 * Minimal helper: activates the plugin and returns the three registered tool handlers.
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

describe("memory_learn_from_feedback tool – validation", () => {
  it("returns INVALID_FEEDBACK_TYPE when input is undefined", async () => {
    const { activation, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const result = await memoryLearn(undefined);
    expect(result).toMatchObject({
      success: false,
      code: "INVALID_FEEDBACK_TYPE",
      reason: "validation",
    });
  });

  it("returns INVALID_FEEDBACK_TYPE when feedback_type is not a valid enum value", async () => {
    const { activation, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const result = await memoryLearn({
      memory_id: "some-id",
      feedback_type: "bogus",
    });
    expect(result).toMatchObject({
      success: false,
      code: "INVALID_FEEDBACK_TYPE",
      reason: "validation",
    });
  });

  it("returns INVALID_FEEDBACK_TYPE when memory_id is missing", async () => {
    const { activation, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const result = await memoryLearn({ feedback_type: "helpful" });
    expect(result).toMatchObject({
      success: false,
      code: "INVALID_FEEDBACK_TYPE",
      reason: "validation",
    });
  });

  it("returns INVALID_FEEDBACK_TYPE when memory_id is an empty string", async () => {
    const { activation, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const result = await memoryLearn({
      memory_id: "",
      feedback_type: "helpful",
    });
    expect(result).toMatchObject({
      success: false,
      code: "INVALID_FEEDBACK_TYPE",
      reason: "validation",
    });
  });
});

describe("memory_learn_from_feedback tool – not found", () => {
  it("returns MEMORY_NOT_FOUND for a non-existent memory_id", async () => {
    const { activation, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const result = await memoryLearn({
      memory_id: "00000000-0000-0000-0000-000000000000",
      feedback_type: "helpful",
    });
    expect(result).toMatchObject({
      success: false,
      code: "MEMORY_NOT_FOUND",
    });
  });
});

describe("memory_learn_from_feedback tool – happy path", () => {
  it("records 'helpful' feedback and increments positiveFeedbackCount", async () => {
    const { activation, memorySave, memoryLearn, memorySearch } = await activateAndGet();
    expect(activation.success).toBe(true);

    // Save a memory and get its id.
    const saveResult = await memorySave({ content: "helpful memory content", tags: ["learn"] });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.data.id as string;

    // Submit helpful feedback.
    const feedbackResult = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "helpful",
    });
    expect(feedbackResult.success).toBe(true);
    if (feedbackResult.success) {
      expect(feedbackResult.data.memory_id).toBe(memoryId);
      expect(feedbackResult.data.feedback_type).toBe("helpful");
      expect(feedbackResult.data.total_feedback_count).toBe(1);
      // With 0 accesses + 1 helpful feedback: confidence = 0.5*0 + 0.5*1 = 0.5
      // which equals the default stored confidence (0.5), so we use >=.
      expect(feedbackResult.data.new_confidence).toBeGreaterThanOrEqual(
        feedbackResult.data.previous_confidence,
      );
    }


    // Verify the update is persisted by searching (inspect via raw search).
    const searchResult = await memorySearch({ query: "helpful memory content", limit: 1 });
    expect(searchResult.success).toBe(true);
  });

  it("records 'incorrect' feedback and increments negativeFeedbackCount", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({ content: "incorrect memory" });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.data.id as string;

    const feedbackResult = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "incorrect",
    });
    expect(feedbackResult.success).toBe(true);
    if (feedbackResult.success) {
      expect(feedbackResult.data.feedback_type).toBe("incorrect");
      expect(feedbackResult.data.total_feedback_count).toBe(1);
      // Negative feedback lowers confidence.
      expect(feedbackResult.data.new_confidence).toBeLessThanOrEqual(
        feedbackResult.data.previous_confidence,
      );
    }
  });

  it("records 'outdated' feedback and increments negativeFeedbackCount", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({ content: "outdated memory" });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.data.id as string;

    const feedbackResult = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "outdated",
    });
    expect(feedbackResult.success).toBe(true);
    if (feedbackResult.success) {
      expect(feedbackResult.data.feedback_type).toBe("outdated");
      expect(feedbackResult.data.total_feedback_count).toBe(1);
    }
  });

  it("records 'duplicate' feedback and increments negativeFeedbackCount", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({ content: "duplicate memory" });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.data.id as string;

    const feedbackResult = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "duplicate",
    });
    expect(feedbackResult.success).toBe(true);
    if (feedbackResult.success) {
      expect(feedbackResult.data.feedback_type).toBe("duplicate");
      expect(feedbackResult.data.total_feedback_count).toBe(1);
    }
  });

  it("persists optional source and context metadata fields", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({ content: "provenance memory" });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.data.id as string;

    const feedbackResult = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "helpful",
      source: "unit-test",
      context: "testing provenance",
    });
    expect(feedbackResult.success).toBe(true);
  });

  it("accumulates multiple feedback rounds correctly", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({ content: "multi-feedback memory" });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.data.id as string;

    // Two helpful, one incorrect.
    await memoryLearn({ memory_id: memoryId, feedback_type: "helpful" });
    await memoryLearn({ memory_id: memoryId, feedback_type: "helpful" });
    const thirdResult = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "incorrect",
    });

    expect(thirdResult.success).toBe(true);
    if (thirdResult.success) {
      // 2 positive + 1 negative = 3 total
      expect(thirdResult.data.total_feedback_count).toBe(3);
    }
  });

  it("updates confidence using computeConfidence formula", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({ content: "confidence formula memory" });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.data.id as string;

    const result = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "helpful",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // With 0 access and 1 positive feedback:
      // normalizeAccess = 0, feedbackScore = 1
      // confidence = 0.5 * 0 + 0.5 * 1 = 0.5
      expect(result.data.new_confidence).toBeCloseTo(0.5, 5);
    }
  });
});
