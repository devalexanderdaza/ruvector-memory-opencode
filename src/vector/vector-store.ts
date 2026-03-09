import type { RuVectorMemoryConfig } from "../shared/types.js";
import type { InitResult } from "../shared/types.js";
import { initializeDatabase } from "./initialization.js";

export class VectorStoreAdapter {
  private readonly config: RuVectorMemoryConfig;
  private readonly projectRoot: string;
  private initPromise: Promise<InitResult> | null = null;
  private lastInitResult: InitResult | null = null;

  public constructor(config: RuVectorMemoryConfig, projectRoot: string) {
    this.config = config;
    this.projectRoot = projectRoot;
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

  public resetForTests(): void {
    this.initPromise = null;
    this.lastInitResult = null;
  }
}

export function createVectorStoreAdapter(
  config: RuVectorMemoryConfig,
  projectRoot: string,
): VectorStoreAdapter {
  return new VectorStoreAdapter(config, projectRoot);
}
