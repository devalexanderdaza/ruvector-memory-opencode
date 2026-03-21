import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { plugin } from "../../src/plugin-manifest.js";

const TMP_ROOT = join(process.cwd(), ".tmp-integration-learning-metrics");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

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
    memoryMetrics: registered["memory_learning_metrics"]!,
    memoryAuditHistory: registered["memory_learning_audit_history"]!,
  };
}

describe("Learning metrics and audit history integration", () => {
  it("aggregates learning metrics and exposes auditable event history", async () => {
    const {
      activation,
      memorySave,
      memoryLearn,
      memoryMetrics,
      memoryAuditHistory,
    } = await activateAndGet();
    expect(activation.success).toBe(true);

    const firstSave = await memorySave({ content: "history target one" });
    const secondSave = await memorySave({ content: "history target two" });
    expect(firstSave.success).toBe(true);
    expect(secondSave.success).toBe(true);

    const firstId = firstSave.success ? firstSave.data.id : "";
    const secondId = secondSave.success ? secondSave.data.id : "";

    await memoryLearn({
      memory_id: firstId,
      feedback_type: "helpful",
      source: "integration-user",
      context: "validated answer",
    });
    await memoryLearn({
      memory_id: firstId,
      feedback_type: "incorrect",
      source: "integration-user",
      context: "wrong edge case",
    });
    await memoryLearn({
      memory_id: secondId,
      feedback_type: "helpful",
      source: "integration-reviewer",
      context: "consistent output",
    });

    const metrics = await memoryMetrics({
      lookback_days: 30,
      sample_limit: 100,
    });
    expect(metrics.success).toBe(true);
    if (metrics.success) {
      expect(metrics.data.total_feedback_count).toBe(3);
      expect(metrics.data.helpful_feedback_count).toBe(2);
      expect(metrics.data.negative_feedback_count).toBe(1);
      expect(metrics.data.hit_rate).toBeCloseTo(2 / 3, 6);
      expect(metrics.data.learning_velocity_per_day).toBeGreaterThan(0);
    }

    const history = await memoryAuditHistory({ limit: 20 });
    expect(history.success).toBe(true);
    if (history.success) {
      expect(history.data.count).toBeGreaterThanOrEqual(3);
      const actors = history.data.events.map((event) => event.actor);
      const actions = history.data.events.map((event) => event.action);
      expect(actors).toContain("integration-user");
      expect(actors).toContain("integration-reviewer");
      expect(actions).toContain("helpful");
      expect(actions).toContain("incorrect");
      for (const event of history.data.events) {
        expect(typeof event.memory_id).toBe("string");
        expect(event.memory_id.length).toBeGreaterThan(0);
        expect(Date.parse(event.timestamp)).not.toBeNaN();
      }
    }
  });
});
