import type { PluginActivationContext, ToolResponse } from "../shared/types.js";
import { logger } from "../shared/logger.js";

import { createMemoryLearnTool } from "./tools/memory-learn-tool.js";
import { createMemorySaveTool } from "./tools/memory-save-tool.js";
import { createMemorySearchTool } from "./tools/memory-search-tool.js";

export interface ToolRegistryLike {
  registerTool: (
    name: string,
    handler: (input?: unknown) => Promise<ToolResponse<unknown>>,
  ) => void;
}

function isToolRegistryLike(value: unknown): value is ToolRegistryLike {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.registerTool === "function";
}

export function injectTools(context: PluginActivationContext = {}): {
  registered: boolean;
} {
  const registry = context.toolRegistry;
  if (!isToolRegistryLike(registry)) {
    logger.info("tools_registration_skipped", { reason: "no_tool_registry" });
    return { registered: false };
  }

  registry.registerTool("memory_save", createMemorySaveTool());
  registry.registerTool("memory_search", createMemorySearchTool());
  registry.registerTool("memory_learn_from_feedback", createMemoryLearnTool());

  logger.info("tools_registered", {
    tools: ["memory_save", "memory_search", "memory_learn_from_feedback"],
  });

  return { registered: true };
}
