import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import { logger } from "../shared/logger.js";
import type { InitMetricsPayload, InitResult } from "../shared/types.js";
import {
  DEFAULT_BACKUP_RETENTION_DAYS,
  DEFAULT_BACKUP_RETENTION_MONTHS,
  DEFAULT_BACKUP_RETENTION_WEEKS,
  DEFAULT_FEEDBACK_WEIGHT,
  DEFAULT_IMPORTANCE_DECAY,
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_VECTOR_DIMENSIONS,
  DEFAULT_VECTOR_METRIC,
} from "./defaults.js";

interface InitializeDatabaseOptions {
  projectRoot: string;
  dbRelativePath: string;
  vectorDimensions?: number;
  vectorMetric?: string;
  similarityThreshold?: number;
  feedbackWeight?: number;
  importanceDecay?: number;
  backupRetentionDays?: number;
  backupRetentionWeeks?: number;
  backupRetentionMonths?: number;
}

interface BackupOptions {
  projectRoot: string;
  dbPath: string;
}

interface VectorDbLike {
  insert?: (entry: {
    id?: string;
    vector: Float32Array | number[];
  }) => Promise<string>;
  delete?: (id: string) => Promise<boolean>;
}

interface VectorDbConstructor {
  new (options: {
    dimensions: number;
    storagePath: string;
    distanceMetric: string;
  }): VectorDbLike;
}

function safeRemove(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // Best-effort cleanup; initialization flow should return actionable error.
  }
}

export function toActionableInitErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Cannot initialize database: unknown error";
  }

  const err = error as NodeJS.ErrnoException;
  if (err.code === "EACCES" || err.code === "EPERM") {
    return `Cannot initialize database: permission denied (${err.code ?? "unknown"})`;
  }

  if (err.code === "ENOSPC") {
    return "Cannot initialize database: disk full (ENOSPC)";
  }

  return `Cannot initialize database: ${error.message}`;
}

function writeInitMetrics(projectRoot: string, payload: InitMetricsPayload): void {
  try {
    const metricsPath = join(projectRoot, ".opencode", "metrics.json");
    mkdirSync(dirname(metricsPath), { recursive: true });

    const output = {
      ...payload,
      timestamp: new Date().toISOString(),
    };

    writeFileSync(metricsPath, JSON.stringify(output, null, 2), "utf8");
  } catch {
    // Metrics are best-effort and must not alter initialization result.
  }
}

function writeAppliedDefaults(options: InitializeDatabaseOptions): void {
  const defaultsPath = join(options.projectRoot, ".opencode", "applied-defaults.json");
  const appliedDefaults = {
    vector: {
      dimensions: options.vectorDimensions ?? DEFAULT_VECTOR_DIMENSIONS,
      similarityThreshold: options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD,
      metric: options.vectorMetric ?? DEFAULT_VECTOR_METRIC,
    },
    learning: {
      feedbackWeight: options.feedbackWeight ?? DEFAULT_FEEDBACK_WEIGHT,
      importanceDecay: options.importanceDecay ?? DEFAULT_IMPORTANCE_DECAY,
    },
    backup: {
      retentionDays: options.backupRetentionDays ?? DEFAULT_BACKUP_RETENTION_DAYS,
      retentionWeeks: options.backupRetentionWeeks ?? DEFAULT_BACKUP_RETENTION_WEEKS,
      retentionMonths: options.backupRetentionMonths ?? DEFAULT_BACKUP_RETENTION_MONTHS,
    },
    createdAt: new Date().toISOString(),
  };

  writeFileSync(defaultsPath, JSON.stringify(appliedDefaults, null, 2), "utf8");
}

async function initializeRuVectorDb(
  options: InitializeDatabaseOptions,
  dbPath: string,
): Promise<void> {
  const configuredMetric = options.vectorMetric ?? DEFAULT_VECTOR_METRIC;
  const coreDistanceMetric = configuredMetric === "cosine" ? "Cosine" : configuredMetric;

  const module = (await import("@ruvector/core")) as Partial<{ VectorDb: VectorDbConstructor }>;
  const VectorDb = module.VectorDb;

  if (typeof VectorDb !== "function") {
    throw new Error("@ruvector/core does not export a usable VectorDb constructor");
  }

  const db = new VectorDb({
    dimensions: options.vectorDimensions ?? DEFAULT_VECTOR_DIMENSIONS,
    storagePath: dbPath,
    distanceMetric: coreDistanceMetric,
  });

  // Force first-write so persistent storage is materialized on first run.
  if (typeof db.insert === "function") {
    const bootstrapId = `bootstrap-${Date.now()}`;
    const vector = new Float32Array(options.vectorDimensions ?? DEFAULT_VECTOR_DIMENSIONS);

    await db.insert({
      id: bootstrapId,
      vector,
    });

    if (typeof db.delete === "function") {
      await db.delete(bootstrapId);
    }
  }

  if (!existsSync(dbPath)) {
    writeFileSync(
      dbPath,
      JSON.stringify(
        {
          engine: "@ruvector/core",
          createdAt: new Date().toISOString(),
          note: "Database initialized via VectorDb; storage internals are managed by the library.",
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

export function validateDatabaseFile(dbPath: string): boolean {
  if (!existsSync(dbPath)) {
    return false;
  }

  const stats = statSync(dbPath);
  return stats.isFile() && stats.size > 0;
}

export async function createInitialBackupSnapshot(options: BackupOptions): Promise<string> {
  const backupsDir = join(options.projectRoot, ".opencode", ".ruvector_backups");
  mkdirSync(backupsDir, { recursive: true });

  const backupName = `initial-${Date.now()}.db.backup`;
  const backupPath = join(backupsDir, backupName);

  copyFileSync(options.dbPath, backupPath);
  return backupPath;
}

export async function initializeDatabase(options: InitializeDatabaseOptions): Promise<InitResult> {
  const startedAt = performance.now();
  const dbPath = resolve(options.projectRoot, options.dbRelativePath);
  const dbDir = dirname(dbPath);

  logger.info("database_initialization_started", {
    db_path: dbPath,
  });

  try {
    mkdirSync(dbDir, { recursive: true });

    if (validateDatabaseFile(dbPath)) {
      const stats = statSync(dbPath);
      const elapsed = Math.round(performance.now() - startedAt);
      writeInitMetrics(options.projectRoot, {
        initializationTime: elapsed,
        firstOperationTime: elapsed,
        databaseSize: stats.size,
        success: true,
      });

      return {
        success: true,
        data: {
          firstRun: false,
          created: false,
          dbPath,
          initializationMs: elapsed,
          databaseSize: stats.size,
        },
      };
    }

    if (existsSync(dbPath)) {
      safeRemove(dbPath);
    }

    await initializeRuVectorDb(options, dbPath);
    chmodSync(dbPath, 0o600);

    if (!validateDatabaseFile(dbPath)) {
      throw new Error("database validation failed after creation");
    }

    writeAppliedDefaults(options);

    const backupPath = await createInitialBackupSnapshot({
      projectRoot: options.projectRoot,
      dbPath,
    });

    const stats = statSync(dbPath);
    const elapsed = Math.round(performance.now() - startedAt);

    writeInitMetrics(options.projectRoot, {
      initializationTime: elapsed,
      firstOperationTime: elapsed,
      databaseSize: stats.size,
      success: true,
    });

    logger.info("database_initialization_completed", {
      db_path: dbPath,
      backup_path: backupPath,
      initialization_ms: elapsed,
    });

    return {
      success: true,
      data: {
        firstRun: true,
        created: true,
        dbPath,
        initializationMs: elapsed,
        databaseSize: stats.size,
      },
    };
  } catch (error) {
    safeRemove(dbPath);

    const elapsed = Math.round(performance.now() - startedAt);
    const message = toActionableInitErrorMessage(error);

    writeInitMetrics(options.projectRoot, {
      initializationTime: elapsed,
      firstOperationTime: elapsed,
      databaseSize: 0,
      success: false,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    logger.error("database_initialization_failed", {
      db_path: dbPath,
      error: message,
      initialization_ms: elapsed,
    });

    return {
      success: false,
      error: message,
      code: "DB_INIT_FAILED",
      reason: "initialization",
    };
  }
}
