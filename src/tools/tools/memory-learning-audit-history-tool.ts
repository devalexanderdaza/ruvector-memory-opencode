import {
  getVectorStoreAdapterForTools,
  initializeMemoryOnFirstOperation,
} from "../../core/plugin.js";
import type {
  FeedbackType,
  LearningAuditHistoryEvent,
  LearningAuditHistoryInput,
  LearningAuditHistoryResult,
  ToolResponse,
} from "../../shared/types.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const DEFAULT_SAMPLE_LIMIT = 300;

function parseInput(input?: unknown): {
  limit: number;
  memoryId?: string;
} | null {
  if (input === undefined) {
    return { limit: DEFAULT_LIMIT };
  }
  if (!input || typeof input !== "object") {
    return null;
  }
  const candidate = input as LearningAuditHistoryInput;
  const parsedLimit =
    typeof candidate.limit === "number" && Number.isFinite(candidate.limit)
      ? Math.floor(candidate.limit)
      : DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, parsedLimit));
  const memoryId =
    typeof candidate.memory_id === "string" &&
    candidate.memory_id.trim().length > 0
      ? candidate.memory_id.trim()
      : undefined;
  return { limit, memoryId };
}

function parseMetadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseFeedbackEvent(
  eventRaw: string,
): LearningAuditHistoryEvent | null {
  const pieces = eventRaw.split(";");
  const fields = new Map<string, string>();
  for (const piece of pieces) {
    const separator = piece.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = piece.slice(0, separator).trim();
    const value = piece.slice(separator + 1).trim();
    if (key.length > 0) {
      fields.set(key, value);
    }
  }

  const actor = fields.get("actor") ?? "";
  const action = fields.get("action") ?? "";
  const memoryId = fields.get("memory_id") ?? "";
  const timestamp = fields.get("ts") ?? "";
  const parsedTs = Date.parse(timestamp);

  if (!actor || !memoryId || !Number.isFinite(parsedTs)) {
    return null;
  }
  if (
    action !== "helpful" &&
    action !== "incorrect" &&
    action !== "duplicate" &&
    action !== "outdated"
  ) {
    return null;
  }

  const context = fields.get("context");
  return {
    actor,
    action: action as FeedbackType,
    memory_id: memoryId,
    timestamp: new Date(parsedTs).toISOString(),
    ...(context ? { context } : {}),
  };
}

export function createMemoryLearningAuditHistoryTool(): (
  input?: unknown,
) => Promise<ToolResponse<LearningAuditHistoryResult>> {
  return async function memory_learning_audit_history(
    input?: unknown,
  ): Promise<ToolResponse<LearningAuditHistoryResult>> {
    const parsed = parseInput(input);
    if (!parsed) {
      return {
        success: false,
        error:
          "memory_learning_audit_history expects { limit?: number, memory_id?: string }",
        code: "EINVALID",
        reason: "validation",
      };
    }

    const init = await initializeMemoryOnFirstOperation();
    if (!init.success) {
      return init as ToolResponse<LearningAuditHistoryResult>;
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

    const sampleLimit = Math.max(parsed.limit, DEFAULT_SAMPLE_LIMIT);
    const sampled = await store.search("", sampleLimit);
    if (!sampled.success) {
      return sampled as ToolResponse<LearningAuditHistoryResult>;
    }

    const events: LearningAuditHistoryEvent[] = [];
    for (const item of sampled.data.items) {
      const metadata = parseMetadataRecord(item.metadata);
      const historyRaw = metadata["feedbackHistory"] as unknown;
      if (!Array.isArray(historyRaw)) {
        continue;
      }
      for (const eventRaw of historyRaw) {
        if (typeof eventRaw !== "string") {
          continue;
        }
        const parsedEvent = parseFeedbackEvent(eventRaw);
        if (!parsedEvent) {
          continue;
        }
        if (parsed.memoryId && parsedEvent.memory_id !== parsed.memoryId) {
          continue;
        }
        events.push(parsedEvent);
      }
    }

    events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    const trimmed = events.slice(0, parsed.limit);

    return {
      success: true,
      data: {
        events: trimmed,
        count: trimmed.length,
        limit: parsed.limit,
        sampled_memory_count: sampled.data.items.length,
      },
    };
  };
}
