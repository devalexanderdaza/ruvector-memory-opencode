import { resolve } from "node:path";

import { logger } from "../shared/logger.js";
import type {
  InitResult,
  MemorySearchFilters,
  MemorySearchItem,
  MemorySaveResult,
  MemorySearchResult,
  RuVectorMemoryConfig,
  ToolResponse,
} from "../shared/types.js";
import { embedTextDeterministic } from "../shared/utils.js";
import { initializeDatabase } from "./initialization.js";

/**
 * Composite ranking weight constants for memory_search.
 *
 * Scores use "lower is better" (distance semantics).
 * Boosts subtract from the base cosine distance, making a memory rank higher.
 *
 * Formula:
 *   compositeScore = cosineDist - priorityBoost - recencyBoost - confidenceBoost
 *
 *   priorityBoost:  +0.05 for critical, -0.02 for low, 0 for normal
 *   recencyBoost:   +0.02 if age < 1 day, +0.01 if age < 7 days, 0 otherwise
 *   confidenceBoost: (confidence - 0.5) * 0.04  →  range [-0.02, +0.02]
 */
const PRIORITY_BOOST_CRITICAL = 0.05;
const PRIORITY_PENALTY_LOW = 0.02;
const RECENCY_BOOST_DAY = 0.02;
const RECENCY_BOOST_WEEK = 0.01;
const CONFIDENCE_SCALE = 0.04;
const FILTER_OVERSAMPLE_FACTOR = 5;

interface VectorDbLike {
  insert: (entry: {
    id?: string;
    vector: Float32Array | number[];
    metadata?: unknown;
  }) => Promise<string>;
  search: (query: {
    vector: Float32Array | number[];
    k: number;
    filter?: Record<string, unknown>;
  }) => Promise<Array<{ id: string; score: number; metadata?: unknown }>>;
  get: (id: string) => Promise<{
    id?: string;
    vector: Float32Array | number[];
    metadata?: unknown;
  } | null>;
}

function parseMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (typeof metadata !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function toEpochMs(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function includesAnyTag(metadata: Record<string, unknown>, expectedTags: string[]): boolean {
  if (!Array.isArray(metadata.tags)) {
    return false;
  }

  const tagSet = new Set(
    metadata.tags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
  );
  return expectedTags.some((tag) => tagSet.has(tag));
}

function includesAnyFramework(
  metadata: Record<string, unknown>,
  expectedFrameworks: string[],
): boolean {
  if (!Array.isArray(metadata.frameworks)) {
    return false;
  }

  const frameworkSet = new Set(
    metadata.frameworks
      .filter((framework): framework is string => typeof framework === "string")
      .map((framework) => framework.trim())
      .filter((framework) => framework.length > 0),
  );

  return expectedFrameworks.some((framework) => frameworkSet.has(framework));
}

function matchesFilters(metadata: Record<string, unknown>, filters: MemorySearchFilters): boolean {
  if (filters.tags && filters.tags.length > 0) {
    if (!includesAnyTag(metadata, filters.tags)) {
      return false;
    }
  }

  if (typeof filters.source === "string" && metadata.source !== filters.source) {
    return false;
  }

  if (typeof filters.project_name === "string" && metadata.projectName !== filters.project_name) {
    return false;
  }

  if (typeof filters.project_type === "string" && metadata.projectType !== filters.project_type) {
    return false;
  }

  if (
    typeof filters.primary_language === "string" &&
    metadata.primaryLanguage !== filters.primary_language
  ) {
    return false;
  }

  if (
    Array.isArray(filters.frameworks) &&
    filters.frameworks.length > 0 &&
    !includesAnyFramework(metadata, filters.frameworks)
  ) {
    return false;
  }

  if (filters.created_after !== undefined || filters.created_before !== undefined) {
    const createdAtEpoch = toEpochMs(metadata.created_at);
    if (createdAtEpoch === null) {
      return false;
    }

    if (typeof filters.created_after === "number" && !(createdAtEpoch > filters.created_after)) {
      return false;
    }

    if (typeof filters.created_before === "number" && !(createdAtEpoch < filters.created_before)) {
      return false;
    }
  }

  return true;
}

export class VectorStoreAdapter {
  private readonly config: RuVectorMemoryConfig;
  private readonly projectRoot: string;
  private initPromise: Promise<InitResult> | null = null;
  private lastInitResult: InitResult | null = null;
  private db: VectorDbLike | null = null;

  public constructor(config: RuVectorMemoryConfig, projectRoot: string) {
    this.config = config;
    this.projectRoot = projectRoot;
  }

  private async getDbOrNull(): Promise<VectorDbLike | null> {
    const init = await this.ensureInitialized();
    if (!init.success) {
      return null;
    }

    if (this.db) {
      return this.db;
    }

    const module = (await import("@ruvector/core")) as Partial<{
      VectorDb: new (options: {
        dimensions: number;
        storagePath?: string;
        // Note: @ruvector/core enum variants can be TitleCase in some builds.
        distanceMetric?: unknown;
      }) => VectorDbLike;
    }>;

    if (typeof module.VectorDb !== "function") {
      logger.error("vector_db_missing", { dependency: "@ruvector/core" });
      return null;
    }

    // Ensure we use an absolute storage path.
    const storagePath = resolve(this.projectRoot, this.config.db_path);
    const configuredMetric = this.config.vector_metric;
    // The NAPI enum expects TitleCase variants (e.g. "Cosine") in this project version.
    const coreMetric = configuredMetric === "cosine" ? ("Cosine" as const) : "Cosine";
    this.db = new module.VectorDb({
      dimensions: this.config.vector_dimensions,
      storagePath,
      distanceMetric: coreMetric as "cosine" | "euclidean" | "dot",
    });

    return this.db;
  }

  public async ensureInitialized(): Promise<InitResult> {
    if (this.lastInitResult?.success) {
      return {
        success: true,
        data: {
          ...this.lastInitResult.data,
          firstRun: false,
          created: false,
        },
      };
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = initializeDatabase({
      projectRoot: this.projectRoot,
      dbRelativePath: this.config.db_path,
      vectorDimensions: this.config.vector_dimensions,
      vectorMetric: this.config.vector_metric,
      similarityThreshold: this.config.similarity_threshold,
      feedbackWeight: this.config.feedback_weight,
      importanceDecay: this.config.importance_decay,
      backupRetentionDays: this.config.backup_retention_days,
      backupRetentionWeeks: this.config.backup_retention_weeks,
      backupRetentionMonths: this.config.backup_retention_months,
    });

    const result = await this.initPromise;
    this.lastInitResult = result;
    return result;
  }

  public async save(
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<ToolResponse<MemorySaveResult>> {
    const db = await this.getDbOrNull();
    if (!db) {
      return {
        success: false,
        error: "Memory database is not ready",
        code: "ENOTREADY",
        reason: "initialization",
      };
    }

    const vector = embedTextDeterministic(content, this.config.vector_dimensions);
    const id = await db.insert({
      vector,
      // Some @ruvector/core builds require metadata to be a string; store JSON.
      metadata: JSON.stringify({
        ...metadata,
        content,
        created_at: new Date().toISOString(),
      }),
    });

    return { success: true, data: { id } };
  }

  public async search(
    query: string,
    limit = 5,
    filters?: MemorySearchFilters,
  ): Promise<ToolResponse<MemorySearchResult>> {
    const db = await this.getDbOrNull();
    if (!db) {
      return {
        success: false,
        error: "Memory database is not ready",
        code: "ENOTREADY",
        reason: "initialization",
      };
    }

    const normalizedLimit = Math.max(1, Math.floor(limit));
    const hasFilters = Boolean(filters && Object.keys(filters).length > 0);
    const searchK = hasFilters
      ? Math.max(normalizedLimit, Math.floor(normalizedLimit * FILTER_OVERSAMPLE_FACTOR))
      : normalizedLimit;

    const vector = embedTextDeterministic(query, this.config.vector_dimensions);
    const results = await db.search({ vector, k: searchK });
    const now = Date.now();

    const scored = results.map((r) => {
      const metadata = parseMetadata(r.metadata) ?? {};

      const createdAtValue = toEpochMs(metadata.created_at);
      const ageMs = createdAtValue !== null && createdAtValue >= 0 ? now - createdAtValue : null;

      let priorityBoost = 0;
      const priority = metadata.priority;
      if (priority === "critical") {
        priorityBoost = PRIORITY_BOOST_CRITICAL;
      } else if (priority === "low") {
        priorityBoost = -PRIORITY_PENALTY_LOW;
      }

      let recencyBoost = 0;
      if (ageMs !== null) {
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        if (ageDays < 1) {
          recencyBoost = RECENCY_BOOST_DAY;
        } else if (ageDays < 7) {
          recencyBoost = RECENCY_BOOST_WEEK;
        }
      }

      const rawConfidence =
        typeof metadata.confidence === "number" && Number.isFinite(metadata.confidence)
          ? metadata.confidence
          : 0.0;
      const clampedConfidence = Math.max(-1.0, Math.min(1.0, rawConfidence));
      // Confidence is centered at 0.0 so legacy memories (without confidence)
      // keep neutral ordering while higher confidence is preferred and negative is penalized.
      const confidenceBoost = clampedConfidence * CONFIDENCE_SCALE;

      // Composite distance: base vector distance adjusted by metadata signals.
      // Lower composite score is still "better" for ranking.
      const compositeScore = r.score - priorityBoost - recencyBoost - confidenceBoost;

      return {
        raw: r,
        metadata,
        compositeScore,
      };
    });

    const activeFilters = hasFilters ? filters : undefined;
    const filtered = activeFilters
      ? scored.filter((entry) => matchesFilters(entry.metadata, activeFilters))
      : scored;
    const sorted = filtered.sort((a, b) => a.compositeScore - b.compositeScore);

    return {
      success: true,
      data: {
        /**
         * Each item contains:
         * - id: UUID assigned at insert time
         * - score: composite distance (lower = more relevant); used by formatter to compute relevance
         * - content: original text stored via memory_save()
         * - metadata: full parsed metadata object with all fields saved by memory_save:
         *     created_at, source, tags, priority, confidence, accessCount,
         *     positiveFeedbackCount, negativeFeedbackCount, projectContext, importance
         */
        items: sorted.slice(0, normalizedLimit).map((entry) => {
          const content =
            typeof entry.metadata.content === "string"
              ? (entry.metadata.content as string)
              : undefined;

          return {
            id: entry.raw.id,
            score: entry.compositeScore,
            ...(content !== undefined && { content }),
            metadata: entry.metadata,
          };
        }),
      },
    };
  }

  public async getById(id: string): Promise<ToolResponse<MemorySearchItem>> {
    const db = await this.getDbOrNull();
    if (!db) {
      return {
        success: false,
        error: "Memory database is not ready",
        code: "ENOTREADY",
        reason: "initialization",
      };
    }

    const entry = await db.get(id);
    if (!entry) {
      return {
        success: false,
        error: `Memory with id "${id}" not found`,
        code: "MEMORY_NOT_FOUND",
        reason: "not_found",
      };
    }

    const metadata = parseMetadata(entry.metadata) ?? {};
    const content = typeof metadata.content === "string" ? metadata.content : undefined;

    return {
      success: true,
      data: {
        id,
        // score: 0 is a sentinel — getById does not perform vector search so
        // there is no cosine distance to report. Do NOT mix results from
        // getById and search() in ranked lists.
        score: 0,
        ...(content !== undefined && { content }),
        metadata,
      },
    };

  }

  public async updateMetadata(
    id: string,
    metadataOverridesOrUpdater: Record<string, unknown> | ((existing: Record<string, unknown>) => Record<string, unknown>),
  ): Promise<ToolResponse<{ id: string }>> {
    const db = await this.getDbOrNull();
    if (!db) {
      return {
        success: false,
        error: "Memory database is not ready",
        code: "ENOTREADY",
        reason: "initialization",
      };
    }

    // Retrieve existing entry to get its vector so we can upsert.
    const existing = await db.get(id);
    if (!existing) {
      return {
        success: false,
        error: `Memory with id "${id}" not found`,
        code: "MEMORY_NOT_FOUND",
        reason: "not_found",
      };
    }

    // Re-insert with the same id and vector, merging metadata.
    // @ruvector/core insert with an explicit id performs an upsert.
    const existingMetadata = parseMetadata(existing.metadata) ?? {};
    const merged = typeof metadataOverridesOrUpdater === 'function' 
      ? metadataOverridesOrUpdater(existingMetadata)
      : { ...existingMetadata, ...metadataOverridesOrUpdater };

    await db.insert({
      id,
      vector: existing.vector,
      metadata: JSON.stringify(merged),
    });

    return { success: true, data: { id } };
  }

  public resetForTests(): void {
    this.initPromise = null;
    this.lastInitResult = null;
    this.db = null;
  }
}


export function createVectorStoreAdapter(
  config: RuVectorMemoryConfig,
  projectRoot: string,
): VectorStoreAdapter {
  return new VectorStoreAdapter(config, projectRoot);
}
