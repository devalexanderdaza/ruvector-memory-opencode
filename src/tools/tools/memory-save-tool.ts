import {
  getVectorStoreAdapterForTools,
  initializeMemoryOnFirstOperation,
} from "../../core/plugin.js";
import type { MemorySaveResult, ToolResponse } from "../../shared/types.js";

function parseContent(input?: unknown): string | null {
  if (typeof input === "string") {
    return input;
  }
  if (input && typeof input === "object") {
    const candidate = input as Record<string, unknown>;
    if (typeof candidate.content === "string") {
      return candidate.content;
    }
  }
  return null;
}

export function createMemorySaveTool(): (
  input?: unknown,
) => Promise<ToolResponse<MemorySaveResult>> {
  return async function memory_save(
    input?: unknown,
  ): Promise<ToolResponse<MemorySaveResult>> {
    const content = parseContent(input);
    if (!content) {
      return {
        success: false,
        error: "memory_save requires a string content or { content: string }",
        code: "EINVALID",
        reason: "validation",
      };
    }

    const init = await initializeMemoryOnFirstOperation();
    if (!init.success) {
      return init;
    }

    const store = getVectorStoreAdapterForTools();
    if (!store) {
      return {
        success: false,
        error: "Memory system unavailable: plugin not activated",
        code: "PLUGIN_NOT_ACTIVATED",
        reason: "initialization",
      };
    }

    try {
      return await store.save(content);
    } catch (error) {
      return {
        success: false,
        error: `memory_save failed: ${error instanceof Error ? error.message : "unknown error"}`,
        code: "EUNEXPECTED",
        reason: "execution",
      };
    }
  };
}
