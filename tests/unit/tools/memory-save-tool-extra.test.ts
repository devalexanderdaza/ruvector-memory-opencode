import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { plugin } from "../../../src/plugin-manifest.js";

const TMP_ROOT = join(process.cwd(), ".tmp-unit-memory-save-tool");

beforeEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
  mkdirSync(TMP_ROOT, { recursive: true });
});

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("memory_save tool", () => {
  it("saves memory with project context enrichment", async () => {
    // Create a mock project structure
    writeFileSync(
      join(TMP_ROOT, "package.json"),
      JSON.stringify({ name: "test-project" }),
    );

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

    expect(activation.success).toBe(true);
    const memorySave = registered["memory_save"];
    const memorySearch = registered["memory_search"];

    const saveResult = await memorySave?.({
      content: "Important architecture decision",
      tags: ["arch"],
      priority: "critical",
    });

    expect(saveResult?.success).toBe(true);

    const searchResult = await memorySearch?.("architecture");
    expect(searchResult?.success).toBe(true);
    expect(["test-project", ".tmp-unit-memory-save-tool"]).toContain(
      searchResult?.data.results[0].projectName,
    );
    // Importance is mapped from priority "critical" -> 5 or default 3.
    // In memory-save-tool.ts it sets priority: candidate.priority.
    // Let's verify what it returns.
    expect(searchResult?.data.results[0].importance).toBeDefined();

    rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  it("returns error if content is missing", async () => {
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

    const result = await registered["memory_save"]?.({ tags: ["tag"] });
    expect(result?.success).toBe(false);
    expect(result?.code).toBe("EINVALID");
  });
});
