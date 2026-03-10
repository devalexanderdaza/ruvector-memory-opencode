import { resolve } from "node:path";

import { logger } from "../shared/logger.js";
import type {
  InitResult,
  MemorySaveResult,
  MemorySearchResult,
  RuVectorMemoryConfig,
  ToolResponse,
} from "../shared/types.js";
import { embedTextDeterministic } from "../shared/utils.js";
import { initializeDatabase } from "./initialization.js";

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
  get: (
    id: string,
  ) => Promise<{
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
    const coreMetric =
      configuredMetric === "cosine" ? ("Cosine" as const) : "Cosine";
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

    const vector = embedTextDeterministic(
      content,
      this.config.vector_dimensions,
    );
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

    const vector = embedTextDeterministic(query, this.config.vector_dimensions);
    const results = await db.search({ vector, k: limit });
    // In this project build, score behaves like distance for cosine (lower is better).
    const sorted = [...results].sort((a, b) => a.score - b.score);
    return {
      success: true,
      data: {
        items: sorted.map((r) => ({
          id: r.id,
          score: r.score,
          content:
            typeof parseMetadata(r.metadata)?.content === "string"
              ? (parseMetadata(r.metadata)?.content as string)
              : undefined,
          metadata: parseMetadata(r.metadata),
        })),
      },
    };
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
