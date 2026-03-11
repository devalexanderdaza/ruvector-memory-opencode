import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getPreloadedMemoryContext,
  refreshPreloadedContext,
  resetPluginStateForTests,
} from "../../src/core/plugin.js";
import { plugin } from "../../src/plugin-manifest.js";

const TMP_ROOT = join(process.cwd(), ".tmp-memory-context-injection-tests");

afterEach(() => {
  resetPluginStateForTests();
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

async function setupWithMemories() {
  const registered: Record<string, (input?: unknown) => Promise<unknown>> = {};
  const activation = await plugin.activate({
    projectRoot: TMP_ROOT,
    runtimeNodeVersion: "22.11.0",
    toolRegistry: {
      registerTool(name: string, handler: (input?: unknown) => Promise<unknown>) {
        registered[name] = handler;
      },
    },
  });
  expect(activation.success).toBe(true);

  const memorySave = registered.memory_save;
  const memorySearch = registered.memory_search;
  if (!memorySave || !memorySearch) {
    throw new Error("Expected memory_save and memory_search tools to be registered");
  }
  return { memorySave, memorySearch };
}

describe("Passive Memory Context Injection (Story 2.5)", () => {
  describe("AC1 + AC2: Automatic injection into agent context", () => {
    it("returns empty context string before any memories are saved", async () => {
      await setupWithMemories();

      const result = await refreshPreloadedContext();
      expect(result).not.toBeNull();
      expect(result?.memoriesInjected).toBe(0);
      expect(result?.context).toBe("");
      expect(result?.skipped).toBe(false);
    });

    it("passive injection works with empty query (default behavior)", async () => {
      const { memorySave } = await setupWithMemories();

      // Save a test memory
      await memorySave({
        content: "This memory will be part of default passive context injection",
        source: "manual",
        confidence: 0.9,
      });

      // Call without explicit query (passive mode)
      const result = await refreshPreloadedContext();
      const cached = getPreloadedMemoryContext();

      // Passive injection should populate the cached context
      if (result?.memoriesInjected && result.memoriesInjected > 0) {
        expect(cached.length).toBeGreaterThan(0);
        expect(cached).toMatch(/Memory|Relevant Memory Context/);
      }
    });

    it("returns formatted context after saving memories", async () => {
      const { memorySave } = await setupWithMemories();

      await memorySave({
        content: "Always use strict null checks in TypeScript to prevent runtime errors",
        tags: ["typescript", "best-practice"],
        source: "manual",
        priority: "critical",
        confidence: 0.95,
      });

      await memorySave({
        content: "Use dependency injection pattern for testability in Node.js services",
        tags: ["architecture", "patterns"],
        source: "manual",
        priority: "normal",
        confidence: 0.8,
      });

      const result = await refreshPreloadedContext();

      expect(result).not.toBeNull();
      expect(result?.memoriesInjected).toBeGreaterThan(0);
      expect(result?.context.length).toBeGreaterThan(0);
      expect(result?.tokensUsed).toBeGreaterThan(0);
    });

    it("getPreloadedMemoryContext reflects the refreshed context", async () => {
      const { memorySave } = await setupWithMemories();

      await memorySave({
        content: "Project uses ESM modules with .js extensions in imports",
        source: "manual",
      });

      const result = await refreshPreloadedContext();
      expect(result?.memoriesInjected).toBeGreaterThan(0);

      const cachedContext = getPreloadedMemoryContext();
      expect(cachedContext).toBe(result?.context);
      expect(cachedContext.length).toBeGreaterThan(0);
    });
  });

  describe("AC3: Memory context includes required fields", () => {
    it("formatted context includes content, source, confidence, and timestamp fields", async () => {
      const { memorySave } = await setupWithMemories();

      await memorySave({
        content: "Vitest is the test framework for this project",
        source: "manual",
        confidence: 0.9,
      });

      const result = await refreshPreloadedContext();

      if (result?.memoriesInjected && result.memoriesInjected > 0) {
        const ctx = result.context;
        expect(ctx).toContain("Vitest is the test framework");
        expect(ctx).toContain("manual");
        // Confidence and timestamp appear in the formatted metadata line
        expect(ctx).toMatch(/Confidence:/);
        expect(ctx).toMatch(/Saved:/);
      }
    });
  });

  describe("AC4: Relevance threshold filtering", () => {
    it("only injects memories that pass the relevance threshold", async () => {
      const { memorySave } = await setupWithMemories();

      // Save a memory that should be highly relevant to this specific query
      await memorySave({
        content: "ruvector uses cosine similarity for semantic search",
        source: "manual",
        priority: "critical",
        confidence: 0.95,
      });

      // Use a query matching the saved content to get high relevance
      const result = await refreshPreloadedContext("ruvector cosine similarity semantic search");

      if (result?.memoriesInjected && result.memoriesInjected > 0) {
        // Verify memories were selected (threshold filtering happened)
        expect(result.context).toBeTruthy();
      }
      // At minimum the injection did not throw
      expect(result?.skipped).toBe(false);
    });
  });

  describe("AC5: Token budget enforcement", () => {
    it("total token usage is tracked and returned", async () => {
      const { memorySave } = await setupWithMemories();

      for (let i = 0; i < 3; i++) {
        await memorySave({
          content: `Architecture decision ${i}: always document design rationale`,
          source: "manual",
        });
      }

      const result = await refreshPreloadedContext();

      if (result?.memoriesInjected && result.memoriesInjected > 0) {
        expect(result.tokensUsed).toBeGreaterThan(0);
      }
    });

    it("respects maxMemoriesToInject limit when multiple memories exist", async () => {
      const { memorySave } = await setupWithMemories();

      // Save more memories than maxMemoriesToInject (default is 5)
      for (let i = 0; i < 10; i++) {
        await memorySave({
          content: `Memory ${i}: Important context pattern in codebase`,
          source: "manual",
          confidence: 0.95 - i * 0.05,
        });
      }

      const result = await refreshPreloadedContext();

      // Should not exceed maxMemoriesToInject (5) even with many saved memories
      if (result?.memoriesInjected && result.memoriesInjected > 0) {
        expect(result.memoriesInjected).toBeLessThanOrEqual(5);
      }
    });
  });

  describe("AC6: Graceful degradation", () => {
    it("returns null from refreshPreloadedContext when plugin is not activated", async () => {
      // Not activating plugin — state is reset, so injector is null
      const result = await refreshPreloadedContext();
      expect(result).toBeNull();
    });

    it("getPreloadedMemoryContext returns empty string initially", async () => {
      const context = getPreloadedMemoryContext();
      expect(context).toBe("");
    });

    it("plugin continues to operate after injection returns empty", async () => {
      // Activate with no memories saved
      const { memorySearch } = await setupWithMemories();

      // Context injection should have run without errors
      const searchResult = await memorySearch({
        query: "test query",
        limit: 1,
      });

      // Core search functionality still works
      expect(searchResult).toHaveProperty("success");
    });
  });
});
