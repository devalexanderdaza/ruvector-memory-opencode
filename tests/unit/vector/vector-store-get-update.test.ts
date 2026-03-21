import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { plugin } from "../../../src/plugin-manifest.js";
import { getVectorStoreAdapterForTools, resetPluginStateForTests } from "../../../src/core/plugin.js";

const TMP_ROOT = join(process.cwd(), ".tmp-unit-vector-store-feedback");

afterEach(() => {
  resetPluginStateForTests();
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

async function activatePlugin() {
  return plugin.activate({
    projectRoot: TMP_ROOT,
    runtimeNodeVersion: "22.11.0",
    toolRegistry: { registerTool: () => {} },
  });
}

describe("VectorStoreAdapter.getById()", () => {
  it("returns MEMORY_NOT_FOUND for an unknown id", async () => {
    const activation = await activatePlugin();
    expect(activation.success).toBe(true);

    const store = getVectorStoreAdapterForTools();
    expect(store).not.toBeNull();

    const result = await store!.getById("non-existent-id");
    expect(result).toMatchObject({
      success: false,
      code: "MEMORY_NOT_FOUND",
    });
  });

  it("returns success with content and metadata for an existing id", async () => {
    const activation = await activatePlugin();
    expect(activation.success).toBe(true);

    const store = getVectorStoreAdapterForTools();
    expect(store).not.toBeNull();

    // Save a memory.
    const saveResult = await store!.save("getById test content", {
      tags: ["test"],
      source: "unit",
      confidence: 0.5,
    });
    expect(saveResult.success).toBe(true);
    const id = saveResult.success ? saveResult.data.id : "";

    // Retrieve by id.
    const getResult = await store!.getById(id);
    expect(getResult.success).toBe(true);
    if (getResult.success) {
      expect(getResult.data.id).toBe(id);
      expect(getResult.data.content).toBe("getById test content");
      expect(getResult.data.metadata).toMatchObject({
        tags: ["test"],
        source: "unit",
      });
    }
  });
});

describe("VectorStoreAdapter.updateMetadata()", () => {
  it("returns MEMORY_NOT_FOUND when id does not exist", async () => {
    const activation = await activatePlugin();
    expect(activation.success).toBe(true);

    const store = getVectorStoreAdapterForTools();
    expect(store).not.toBeNull();

    const result = await store!.updateMetadata("non-existent-id", { confidence: 0.9 });
    expect(result).toMatchObject({
      success: false,
      code: "MEMORY_NOT_FOUND",
    });
  });

  it("merges metadata and persists changes for an existing id", async () => {
    const activation = await activatePlugin();
    expect(activation.success).toBe(true);

    const store = getVectorStoreAdapterForTools();
    expect(store).not.toBeNull();

    const saveResult = await store!.save("updateMetadata test content", {
      confidence: 0.5,
      positiveFeedbackCount: 0,
      negativeFeedbackCount: 0,
    });
    expect(saveResult.success).toBe(true);
    const id = saveResult.success ? saveResult.data.id : "";

    // Update metadata.
    const updateResult = await store!.updateMetadata(id, {
      positiveFeedbackCount: 1,
      confidence: 0.75,
    });
    expect(updateResult.success).toBe(true);
    if (updateResult.success) {
      expect(updateResult.data.id).toBe(id);
    }

    // Verify the change was persisted.
    const getResult = await store!.getById(id);
    expect(getResult.success).toBe(true);
    if (getResult.success) {
      const meta = getResult.data.metadata as Record<string, unknown>;
      expect(meta["positiveFeedbackCount"]).toBe(1);
      expect(meta["confidence"]).toBeCloseTo(0.75, 5);
    }
  });

  it("does not lose pre-existing metadata fields on update", async () => {
    const activation = await activatePlugin();
    expect(activation.success).toBe(true);

    const store = getVectorStoreAdapterForTools();
    expect(store).not.toBeNull();

    const saveResult = await store!.save("preserve fields content", {
      source: "agent",
      tags: ["original"],
      confidence: 0.5,
    });
    expect(saveResult.success).toBe(true);
    const id = saveResult.success ? saveResult.data.id : "";

    // Update only confidence; source & tags should survive.
    await store!.updateMetadata(id, { confidence: 0.8 });

    const getResult = await store!.getById(id);
    expect(getResult.success).toBe(true);
    if (getResult.success) {
      const meta = getResult.data.metadata as Record<string, unknown>;
      expect(meta["source"]).toBe("agent");
      expect(meta["tags"]).toEqual(["original"]);
      expect(meta["confidence"]).toBeCloseTo(0.8, 5);
    }
  });
});
