import type { PluginActivationContext, ToolResponse } from "../shared/types.js";
import { logger } from "../shared/logger.js";

import { createMemoryLearnTool } from "./tools/memory-learn-tool.js";
import { createMemoryLearningAuditHistoryTool } from "./tools/memory-learning-audit-history-tool.js";
import { createMemoryLearningMetricsTool } from "./tools/memory-learning-metrics-tool.js";
import { createMemorySaveTool } from "./tools/memory-save-tool.js";
import { createMemorySearchTool } from "./tools/memory-search-tool.js";
import { createMemoryExportTool } from "./tools/memory-export-tool.js";
import { createMemoryImportTool } from "./tools/memory-import-tool.js";

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
  registry.registerTool(
    "memory_learning_metrics",
    createMemoryLearningMetricsTool(),
  );
  registry.registerTool(
    "memory_learning_audit_history",
    createMemoryLearningAuditHistoryTool(),
  );
  registry.registerTool("memory_export", createMemoryExportTool());
  registry.registerTool("memory_import", createMemoryImportTool());

  logger.info("tools_registered", {
    tools: [
      "memory_save",
      "memory_search",
      "memory_learn_from_feedback",
      "memory_learning_metrics",
      "memory_learning_audit_history",
      "memory_export",
      "memory_import",
    ],
  });

  return { registered: true };
}
