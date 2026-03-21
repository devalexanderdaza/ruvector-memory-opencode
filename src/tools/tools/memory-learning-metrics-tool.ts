import {
  getVectorStoreAdapterForTools,
  initializeMemoryOnFirstOperation,
} from "../../core/plugin.js";
import type {
  LearningMetricsInput,
  LearningMetricsResult,
  ToolResponse,
} from "../../shared/types.js";

const DEFAULT_LOOKBACK_DAYS = 7;
const MAX_LOOKBACK_DAYS = 365;
const DEFAULT_SAMPLE_LIMIT = 200;
const MAX_SAMPLE_LIMIT = 1000;

function parseNumber(input: unknown): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null;
  }
  return Math.floor(input);
}

function parseInput(input?: unknown): {
  lookbackDays: number;
  sampleLimit: number;
} | null {
  if (input === undefined) {
    return {
      lookbackDays: DEFAULT_LOOKBACK_DAYS,
      sampleLimit: DEFAULT_SAMPLE_LIMIT,
    };
  }
  if (!input || typeof input !== "object") {
    return null;
  }
  const candidate = input as LearningMetricsInput;
  const rawLookback = parseNumber(candidate.lookback_days);
  const rawLimit = parseNumber(candidate.sample_limit);
  const lookbackDays =
    rawLookback === null
      ? DEFAULT_LOOKBACK_DAYS
      : Math.min(MAX_LOOKBACK_DAYS, Math.max(1, rawLookback));
  const sampleLimit =
    rawLimit === null
      ? DEFAULT_SAMPLE_LIMIT
      : Math.min(MAX_SAMPLE_LIMIT, Math.max(1, rawLimit));
  return { lookbackDays, sampleLimit };
}

function parseMetadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseCounter(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

export function createMemoryLearningMetricsTool(): (
  input?: unknown,
) => Promise<ToolResponse<LearningMetricsResult>> {
  return async function memory_learning_metrics(
    input?: unknown,
  ): Promise<ToolResponse<LearningMetricsResult>> {
    const parsed = parseInput(input);
    if (!parsed) {
      return {
        success: false,
        error:
          "memory_learning_metrics expects { lookback_days?: number, sample_limit?: number }",
        code: "EINVALID",
        reason: "validation",
      };
    }

    const init = await initializeMemoryOnFirstOperation();
    if (!init.success) {
      return init as ToolResponse<LearningMetricsResult>;
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

    const sampled = await store.search("", parsed.sampleLimit);
    if (!sampled.success) {
      return sampled as ToolResponse<LearningMetricsResult>;
    }

    const nowMs = Date.now();
    const windowMs = parsed.lookbackDays * 24 * 60 * 60 * 1000;
    const currentWindowStartMs = nowMs - windowMs;
    const previousWindowStartMs = nowMs - windowMs * 2;

    let helpfulCount = 0;
    let negativeCount = 0;
    let evaluatedMemoryCount = 0;
    let currentWindowEvents = 0;
    let previousWindowEvents = 0;

    for (const item of sampled.data.items) {
      const metadata = parseMetadataRecord(item.metadata);
      const pos = parseCounter(metadata["positiveFeedbackCount"]);
      const neg = parseCounter(metadata["negativeFeedbackCount"]);
      if (pos + neg > 0) {
        evaluatedMemoryCount += 1;
      }
      helpfulCount += pos;
      negativeCount += neg;

      const historyRaw = metadata["feedbackHistory"] as unknown;
      if (!Array.isArray(historyRaw)) {
        continue;
      }
      for (const eventRaw of historyRaw) {
        if (typeof eventRaw !== "string") {
          continue;
        }
        const timestampPart = eventRaw
          .split(";")
          .find((part) => part.startsWith("ts="));
        if (!timestampPart) {
          continue;
        }
        const ts = timestampPart.slice(3);
        const epoch = Date.parse(ts);
        if (!Number.isFinite(epoch)) {
          continue;
        }
        if (epoch >= currentWindowStartMs && epoch <= nowMs) {
          currentWindowEvents += 1;
        } else if (
          epoch >= previousWindowStartMs &&
          epoch < currentWindowStartMs
        ) {
          previousWindowEvents += 1;
        }
      }
    }

    const totalFeedback = helpfulCount + negativeCount;
    const hitRate = totalFeedback > 0 ? helpfulCount / totalFeedback : 0;
    const currentRate = currentWindowEvents / parsed.lookbackDays;
    const previousRate = previousWindowEvents / parsed.lookbackDays;
    const trendDelta = currentRate - previousRate;
    const feedbackTrend: LearningMetricsResult["feedback_trend"] =
      currentWindowEvents === 0 && previousWindowEvents === 0
        ? "insufficient_data"
        : Math.abs(trendDelta) < 0.001
          ? "stable"
          : trendDelta > 0
            ? "up"
            : "down";

    return {
      success: true,
      data: {
        hit_rate: Number(hitRate.toFixed(6)),
        helpful_feedback_count: helpfulCount,
        negative_feedback_count: negativeCount,
        total_feedback_count: totalFeedback,
        feedback_trend: feedbackTrend,
        trend_delta: Number(trendDelta.toFixed(6)),
        learning_velocity_per_day: Number(currentRate.toFixed(6)),
        learning_velocity_window_days: parsed.lookbackDays,
        evaluated_memory_count: evaluatedMemoryCount,
        sampled_memory_count: sampled.data.items.length,
      },
    };
  };
}
