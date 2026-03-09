import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createInitialBackupSnapshot,
  initializeDatabase,
  toActionableInitErrorMessage,
  validateDatabaseFile,
} from "../../../src/vector/index.js";

const TMP_ROOT = join(process.cwd(), ".tmp-vector-init-tests");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("Database Initialization", () => {
  it("creates .opencode directory if missing", async () => {
    const result = await initializeDatabase({
      projectRoot: TMP_ROOT,
      dbRelativePath: ".opencode/ruvector_memory.db",
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(TMP_ROOT, ".opencode"))).toBe(true);
  });

  it("initializes database with default configuration", async () => {
    const result = await initializeDatabase({
      projectRoot: TMP_ROOT,
      dbRelativePath: ".opencode/ruvector_memory.db",
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(TMP_ROOT, ".opencode", "ruvector_memory.db"))).toBe(true);
    expect(existsSync(join(TMP_ROOT, ".opencode", "metrics.json"))).toBe(true);
    expect(existsSync(join(TMP_ROOT, ".opencode", "applied-defaults.json"))).toBe(true);

    const appliedDefaults = JSON.parse(
      readFileSync(join(TMP_ROOT, ".opencode", "applied-defaults.json"), "utf8"),
    ) as {
      vector: { dimensions: number; similarityThreshold: number; metric: string };
      learning: { feedbackWeight: number; importanceDecay: number };
      backup: { retentionDays: number; retentionWeeks: number; retentionMonths: number };
    };

    expect(appliedDefaults.vector.dimensions).toBe(384);
    expect(appliedDefaults.vector.similarityThreshold).toBe(0.75);
    expect(appliedDefaults.learning.feedbackWeight).toBe(0.1);
    expect(appliedDefaults.backup.retentionDays).toBe(7);
  });

  it("detects existing database and skips initialization", async () => {
    mkdirSync(join(TMP_ROOT, ".opencode"), { recursive: true });
    writeFileSync(join(TMP_ROOT, ".opencode", "ruvector_memory.db"), "existing-db", "utf8");

    const result = await initializeDatabase({
      projectRoot: TMP_ROOT,
      dbRelativePath: ".opencode/ruvector_memory.db",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstRun).toBe(false);
      expect(result.data.created).toBe(false);
    }
  });

  it("handles initialization errors gracefully", async () => {
    mkdirSync(TMP_ROOT, { recursive: true });
    // Force mkdir failure by creating .opencode as a file instead of directory.
    writeFileSync(join(TMP_ROOT, ".opencode"), "not-a-directory", "utf8");

    const result = await initializeDatabase({
      projectRoot: TMP_ROOT,
      dbRelativePath: ".opencode/ruvector_memory.db",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Cannot initialize database");
    }
  });

  it("validates database after creation", async () => {
    mkdirSync(join(TMP_ROOT, ".opencode"), { recursive: true });
    const dbPath = join(TMP_ROOT, ".opencode", "ruvector_memory.db");
    writeFileSync(dbPath, "db-content", "utf8");

    expect(validateDatabaseFile(dbPath)).toBe(true);
  });

  it("returns false when validating a missing database file", () => {
    const missingPath = join(TMP_ROOT, ".opencode", "missing.db");
    expect(validateDatabaseFile(missingPath)).toBe(false);
  });

  it("recreates database when an existing file is invalid", async () => {
    mkdirSync(join(TMP_ROOT, ".opencode"), { recursive: true });
    const dbPath = join(TMP_ROOT, ".opencode", "ruvector_memory.db");
    writeFileSync(dbPath, "", "utf8");

    const result = await initializeDatabase({
      projectRoot: TMP_ROOT,
      dbRelativePath: ".opencode/ruvector_memory.db",
    });

    expect(result.success).toBe(true);
    expect(validateDatabaseFile(dbPath)).toBe(true);
  });

  it("creates initial backup snapshot after successful init", async () => {
    mkdirSync(join(TMP_ROOT, ".opencode"), { recursive: true });
    const dbPath = join(TMP_ROOT, ".opencode", "ruvector_memory.db");
    writeFileSync(dbPath, "db-content", "utf8");

    const backupPath = await createInitialBackupSnapshot({ projectRoot: TMP_ROOT, dbPath });

    expect(backupPath).toContain(".opencode/.ruvector_backups");
    expect(existsSync(backupPath)).toBe(true);
    expect(readFileSync(backupPath, "utf8")).toBe("db-content");
  });

  it("maps non-Error values to an unknown actionable message", () => {
    const message = toActionableInitErrorMessage("boom");
    expect(message).toContain("unknown error");
  });

  it("maps permission failures to actionable permission denied message", () => {
    const err = new Error("permission denied") as NodeJS.ErrnoException;
    err.code = "EACCES";

    const message = toActionableInitErrorMessage(err);
    expect(message).toContain("permission denied");
  });

  it("maps no-space failures to actionable disk full message", () => {
    const err = new Error("disk full") as NodeJS.ErrnoException;
    err.code = "ENOSPC";

    const message = toActionableInitErrorMessage(err);
    expect(message).toContain("disk full");
  });
});
