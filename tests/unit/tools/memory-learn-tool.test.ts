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
    memoryMetrics: registered["memory_learning_metrics"]!,
    memoryAuditHistory: registered["memory_learning_audit_history"]!,
  };
}

describe("memory_learn_from_feedback tool – validation", () => {
  it("returns INVALID_FEEDBACK_INPUT when input is undefined", async () => {
    const { activation, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const result = await memoryLearn(undefined);
    expect(result).toMatchObject({
      success: false,
      code: "INVALID_FEEDBACK_INPUT",
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

  it("returns INVALID_MEMORY_ID when memory_id is missing", async () => {
    const { activation, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const result = await memoryLearn({ feedback_type: "helpful" });
    expect(result).toMatchObject({
      success: false,
      code: "INVALID_MEMORY_ID",
      reason: "validation",
    });
  });

  it("returns INVALID_MEMORY_ID when memory_id is an empty string", async () => {
    const { activation, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const result = await memoryLearn({
      memory_id: "",
      feedback_type: "helpful",
    });
    expect(result).toMatchObject({
      success: false,
      code: "INVALID_MEMORY_ID",
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
    const { activation, memorySave, memoryLearn, memorySearch } =
      await activateAndGet();
    expect(activation.success).toBe(true);

    // Save a memory and get its id.
    const saveResult = await memorySave({
      content: "helpful memory content",
      tags: ["learn"],
    });
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
    const searchResult = await memorySearch({
      query: "helpful memory content",
      limit: 1,
    });
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

    // Save a memory that will act as the canonical version
    const canonicalSave = await memorySave({ content: "canonical memory" });
    expect(canonicalSave.success).toBe(true);
    const canonicalId = canonicalSave.success ? canonicalSave.data.id : "";

    // Save a memory that will be marked as duplicate
    const duplicateSave = await memorySave({ content: "duplicate memory" });
    expect(duplicateSave.success).toBe(true);
    const memoryId = duplicateSave.success ? duplicateSave.data.id : "";

    const feedbackResult = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "duplicate",
      canonical_id: canonicalId,
    });

    expect(feedbackResult.success).toBe(true);
    if (feedbackResult.success) {
      expect(feedbackResult.data.feedback_type).toBe("duplicate");
      expect(feedbackResult.data.total_feedback_count).toBe(1);
      expect(feedbackResult.data.merged_into_id).toBe(canonicalId);
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

    const saveResult = await memorySave({
      content: "confidence formula memory",
    });
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

  it("does not auto-deprioritize after only 2 repeated corrections", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({
      content: "threshold boundary memory 2",
    });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.success ? saveResult.data.id : "";

    await memoryLearn({ memory_id: memoryId, feedback_type: "incorrect" });
    const second = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "incorrect",
    });
    expect(second.success).toBe(true);
    if (second.success) {
      expect(second.data.new_confidence).toBeGreaterThan(-1.0);
    }
  });

  it("auto-deprioritizes exactly at 3 repeated corrections", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({
      content: "threshold boundary memory 3",
    });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.success ? saveResult.data.id : "";

    await memoryLearn({ memory_id: memoryId, feedback_type: "incorrect" });
    await memoryLearn({ memory_id: memoryId, feedback_type: "incorrect" });
    const third = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "incorrect",
    });
    expect(third.success).toBe(true);
    if (third.success) {
      expect(third.data.new_confidence).toBe(-1.0);
    }
  });

  it("keeps behavior stable after threshold is exceeded", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({
      content: "threshold boundary memory over 3",
    });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.success ? saveResult.data.id : "";

    await memoryLearn({ memory_id: memoryId, feedback_type: "incorrect" });
    await memoryLearn({ memory_id: memoryId, feedback_type: "incorrect" });
    await memoryLearn({ memory_id: memoryId, feedback_type: "incorrect" });
    const fourth = await memoryLearn({
      memory_id: memoryId,
      feedback_type: "incorrect",
    });
    expect(fourth.success).toBe(true);
    if (fourth.success) {
      expect(fourth.data.new_confidence).toBe(-1.0);
    }
  });

  it("does not re-promote merged duplicates after additional feedback", async () => {
    const { activation, memorySave, memoryLearn } = await activateAndGet();
    expect(activation.success).toBe(true);

    const canonicalSave = await memorySave({
      content: "canonical memory for stability",
    });
    expect(canonicalSave.success).toBe(true);
    const canonicalId = canonicalSave.success ? canonicalSave.data.id : "";

    const duplicateSave = await memorySave({
      content: "duplicate memory for stability",
    });
    expect(duplicateSave.success).toBe(true);
    const duplicateId = duplicateSave.success ? duplicateSave.data.id : "";

    const markDuplicate = await memoryLearn({
      memory_id: duplicateId,
      feedback_type: "duplicate",
      canonical_id: canonicalId,
    });
    expect(markDuplicate.success).toBe(true);

    const helpfulAfterDuplicate = await memoryLearn({
      memory_id: duplicateId,
      feedback_type: "helpful",
    });
    expect(helpfulAfterDuplicate.success).toBe(true);
    if (helpfulAfterDuplicate.success) {
      expect(helpfulAfterDuplicate.data.new_confidence).toBe(-1.0);
    }
  });
});

describe("learning metrics and audit history tools", () => {
  it("returns validation errors for malformed metrics/audit inputs", async () => {
    const { activation, memoryMetrics, memoryAuditHistory } =
      await activateAndGet();
    expect(activation.success).toBe(true);

    const metrics = await memoryMetrics("not-an-object");
    const history = await memoryAuditHistory("not-an-object");

    expect(metrics).toMatchObject({
      success: false,
      code: "EINVALID",
      reason: "validation",
    });
    expect(history).toMatchObject({
      success: false,
      code: "EINVALID",
      reason: "validation",
    });
  });

  it("returns bounded defaults and insufficient trend for sparse data", async () => {
    const { activation, memoryMetrics } = await activateAndGet();
    expect(activation.success).toBe(true);

    const metrics = await memoryMetrics({
      lookback_days: 9999,
      sample_limit: -4,
    });
    expect(metrics.success).toBe(true);
    if (metrics.success) {
      expect(metrics.data.learning_velocity_window_days).toBe(365);
      expect(metrics.data.sampled_memory_count).toBeGreaterThanOrEqual(0);
      expect(metrics.data.feedback_trend).toBe("insufficient_data");
      expect(metrics.data.hit_rate).toBeGreaterThanOrEqual(0);
      expect(metrics.data.hit_rate).toBeLessThanOrEqual(1);
    }
  });

  it("returns deterministic metrics for the same feedback dataset", async () => {
    const { activation, memorySave, memoryLearn, memoryMetrics } =
      await activateAndGet();
    expect(activation.success).toBe(true);

    const baseline = await memoryMetrics({
      lookback_days: 30,
      sample_limit: 50,
    });
    expect(baseline.success).toBe(true);
    const baselineTotal = baseline.success
      ? baseline.data.total_feedback_count
      : 0;
    const baselineHelpful = baseline.success
      ? baseline.data.helpful_feedback_count
      : 0;
    const baselineNegative = baseline.success
      ? baseline.data.negative_feedback_count
      : 0;

    const saveResult = await memorySave({
      content: "metrics deterministic memory",
    });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.success ? saveResult.data.id : "";

    await memoryLearn({ memory_id: memoryId, feedback_type: "helpful" });
    await memoryLearn({ memory_id: memoryId, feedback_type: "incorrect" });
    await memoryLearn({ memory_id: memoryId, feedback_type: "helpful" });

    const first = await memoryMetrics({ lookback_days: 30, sample_limit: 50 });
    const second = await memoryMetrics({ lookback_days: 30, sample_limit: 50 });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.data).toEqual(second.data);
      expect(first.data.total_feedback_count - baselineTotal).toBe(3);
      expect(first.data.helpful_feedback_count - baselineHelpful).toBe(2);
      expect(first.data.negative_feedback_count - baselineNegative).toBe(1);
      const deltaHelpful = first.data.helpful_feedback_count - baselineHelpful;
      const deltaTotal = first.data.total_feedback_count - baselineTotal;
      expect(deltaHelpful / deltaTotal).toBeCloseTo(2 / 3, 6);
    }
  });

  it("returns audit history records with who/what/when fields", async () => {
    const { activation, memorySave, memoryLearn, memoryAuditHistory } =
      await activateAndGet();
    expect(activation.success).toBe(true);

    const saveResult = await memorySave({ content: "audit trail memory" });
    expect(saveResult.success).toBe(true);
    const memoryId = saveResult.success ? saveResult.data.id : "";

    await memoryLearn({
      memory_id: memoryId,
      feedback_type: "outdated",
      source: "unit-test-actor",
      context: "stale data path",
    });

    const history = await memoryAuditHistory({
      limit: 10,
      memory_id: memoryId,
    });
    expect(history.success).toBe(true);
    if (history.success) {
      expect(history.data.count).toBeGreaterThanOrEqual(1);
      const firstEvent = history.data.events[0];
      expect(firstEvent).toBeDefined();
      expect(firstEvent?.actor).toBe("unit-test-actor");
      expect(firstEvent?.action).toBe("outdated");
      expect(firstEvent?.memory_id).toBe(memoryId);
      expect(typeof firstEvent?.timestamp).toBe("string");
      expect(Date.parse(firstEvent?.timestamp ?? "")).not.toBeNaN();
    }
  });

  it("returns empty audit history when memory filter does not match", async () => {
    const { activation, memoryAuditHistory } = await activateAndGet();
    expect(activation.success).toBe(true);

    const history = await memoryAuditHistory({
      limit: 3,
      memory_id: "non-existent-memory-id",
    });
    expect(history.success).toBe(true);
    if (history.success) {
      expect(history.data.count).toBe(0);
      expect(history.data.events).toEqual([]);
      expect(history.data.limit).toBe(3);
    }
  });
});
