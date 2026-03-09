import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import { logger } from "../shared/logger.js";
import type { InitMetricsPayload, InitResult } from "../shared/types.js";
import {
  DEFAULT_VECTOR_DIMENSIONS,
  DEFAULT_VECTOR_INDEX_TYPE,
  DEFAULT_VECTOR_METRIC,
} from "./defaults.js";

interface InitializeDatabaseOptions {
  projectRoot: string;
  dbRelativePath: string;
}

interface BackupOptions {
  projectRoot: string;
  dbPath: string;
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
  const tempPath = `${dbPath}.tmp`;

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

    safeRemove(tempPath);

    const bootstrapPayload = {
      format: "ruvector-local",
      schemaVersion: 1,
      vector: {
        dimensions: DEFAULT_VECTOR_DIMENSIONS,
        indexType: DEFAULT_VECTOR_INDEX_TYPE,
        metric: DEFAULT_VECTOR_METRIC,
      },
      createdAt: new Date().toISOString(),
    };

    writeFileSync(tempPath, JSON.stringify(bootstrapPayload), "utf8");
    chmodSync(tempPath, 0o600);

    if (!validateDatabaseFile(tempPath)) {
      throw new Error("temporary database validation failed");
    }

    renameSync(tempPath, dbPath);

    if (!validateDatabaseFile(dbPath)) {
      throw new Error("database validation failed after creation");
    }

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
    safeRemove(tempPath);

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
