import type { ToolResponse } from "../../shared/types.js";

export function createMemoryLearnTool(): (
  input?: unknown,
) => Promise<ToolResponse<unknown>> {
  return async function memory_learn_from_feedback(): Promise<
    ToolResponse<unknown>
  > {
    return {
      success: false,
      error: "memory_learn_from_feedback is registered but not implemented yet",
      code: "ENOTIMPLEMENTED",
      reason: "tool-not-implemented",
    };
  };
}
