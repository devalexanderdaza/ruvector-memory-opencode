import {
  ensureProjectContextForTools,
  getVectorStoreAdapterForTools,
  initializeMemoryOnFirstOperation,
} from "../../core/plugin.js";
import type {
  MemorySaveInput,
  MemorySaveResult,
  ToolResponse,
} from "../../shared/types.js";

type PriorityLevel = "critical" | "normal" | "low";

type MemoryMetadata = {
  tags: string[];
  source: string;
  priority: PriorityLevel;
  confidence: number;
};

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

function buildMetadata(input: unknown): MemoryMetadata {
  const base: MemoryMetadata = {
    tags: [],
    source: "unknown",
    priority: "normal",
    confidence: 0.0,
  };

  if (!input || typeof input !== "object") {
    return base;
  }

  const candidate = input as Partial<MemorySaveInput> & Record<string, unknown>;

  if (Array.isArray(candidate.tags)) {
    base.tags = candidate.tags.filter(
      (tag): tag is string => typeof tag === "string" && tag.length > 0,
    );
  }

  if (typeof candidate.source === "string" && candidate.source.trim().length) {
    base.source = candidate.source;
  }

  if (
    candidate.priority === "critical" ||
    candidate.priority === "normal" ||
    candidate.priority === "low"
  ) {
    base.priority = candidate.priority;
  }

  if (
    typeof candidate.confidence === "number" &&
    Number.isFinite(candidate.confidence)
  ) {
    // Clamp confidence to [-1.0, 1.0] so ranking remains bounded and deterministic.
    base.confidence = Math.max(-1.0, Math.min(1.0, candidate.confidence));
  }

  return base;
}

function buildProjectMetadata(detected: {
  projectRoot: string;
  projectName: string;
  projectType: string;
  primaryLanguage: string;
  frameworks: string[];
  stackSignals: string[];
  priority: PriorityLevel;
}): Record<string, unknown> {
  return {
    projectContext: detected.projectName,
    projectName: detected.projectName,
    projectType: detected.projectType,
    primaryLanguage: detected.primaryLanguage,
    frameworks: [...detected.frameworks],
    stackSignals: [...detected.stackSignals],
    projectRoot: detected.projectRoot,
    importance:
      detected.priority === "critical"
        ? 5
        : detected.priority === "low"
          ? 1
          : 3,
  };
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
      const metadata = buildMetadata(input);
      const detectedProjectContext = await ensureProjectContextForTools();
      const projectMetadata = buildProjectMetadata({
        ...detectedProjectContext,
        priority: metadata.priority,
      });

      return await store.save(content, {
        ...metadata,
        ...projectMetadata,
      });
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
