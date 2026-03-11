import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

import { logger } from "../../../src/shared/logger.js";
import {
  detectProjectContext,
  detectProjectRoot,
} from "../../../src/detection/project-detector.js";

const TMP_ROOT = join(process.cwd(), ".tmp-detection-tests");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("detectProjectRoot", () => {
  it("prefers explicit projectRoot when provided", () => {
    const result = detectProjectRoot({ projectRoot: "/explicit/root" });
    expect(result.projectRoot).toBe("/explicit/root");
  });

  it("returns cwd when no projectRoot override is provided", () => {
    const result = detectProjectRoot();
    expect(result.projectRoot).toBe(process.cwd());
  });

  it("falls back to cwd outside git repositories", () => {
    const outsideGitDir = join(tmpdir(), `ruvector-no-git-${Date.now()}`, "nested");
    mkdirSync(outsideGitDir, { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(outsideGitDir);
      const result = detectProjectRoot();
      expect(result.projectRoot).toBe(outsideGitDir);
      expect(result.stackSignals).toContain("root:cwd");
    } finally {
      process.chdir(originalCwd);
      rmSync(join(outsideGitDir, ".."), { recursive: true, force: true });
    }
  });

  it("detects git root when .git is a plain file (worktree / submodule)", () => {
    // In git worktrees and submodules .git is a plain text file, not a directory.
    // The old code used statSync(...).isDirectory() which returned false for files,
    // causing the walker to miss the git root and fall back to cwd.
    const worktreeRoot = join(TMP_ROOT, "worktree-project");
    const subDir = join(worktreeRoot, "src");
    mkdirSync(subDir, { recursive: true });
    // Write a gitfile — same line format git itself uses for worktrees.
    writeFileSync(
      join(worktreeRoot, ".git"),
      "gitdir: ../.git/worktrees/worktree-project\n",
      "utf8",
    );

    // Change cwd into the sub-directory so findGitRoot must walk up to worktreeRoot.
    const originalCwd = process.cwd();
    try {
      process.chdir(subDir);
      const result = detectProjectRoot(); // no explicit root → uses findGitRoot(cwd)
      expect(result.projectRoot).toBe(worktreeRoot);
      expect(result.stackSignals).toContain("root:git");
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe("detectProjectContext", () => {
  it("detects TypeScript + React stack from project files", async () => {
    const projectRoot = join(TMP_ROOT, "ts-react");
    mkdirSync(projectRoot, { recursive: true });

    writeFileSync(
      join(projectRoot, "package.json"),
      JSON.stringify(
        {
          name: "ts-react-app",
          dependencies: { react: "18.0.0" },
          devDependencies: { typescript: "5.0.0" },
        },
        null,
        2,
      ),
      "utf8",
    );
    writeFileSync(join(projectRoot, "tsconfig.json"), "{}", "utf8");
    writeFileSync(join(projectRoot, "README.md"), "TypeScript app", "utf8");

    const result = await detectProjectContext({ projectRoot });

    expect(result.projectName).toBe("ts-react-app");
    expect(result.primaryLanguage).toBe("typescript");
    expect(result.projectType).toBe("web-app");
    expect(result.frameworks).toContain("react");
    expect(result.stackSignals).toContain("file:package.json");
    expect(result.stackSignals).toContain("file:tsconfig.json");
    expect(result.stackSignals).toContain("dep:react");
  });

  it("is deterministic for same project state", async () => {
    const projectRoot = join(TMP_ROOT, "deterministic");
    mkdirSync(projectRoot, { recursive: true });

    writeFileSync(
      join(projectRoot, "package.json"),
      JSON.stringify({ name: "deterministic-app", dependencies: { express: "5.0.0" } }),
      "utf8",
    );
    writeFileSync(join(projectRoot, "README.md"), "Node.js service", "utf8");

    const first = await detectProjectContext({ projectRoot });
    const second = await detectProjectContext({ projectRoot });

    expect(second).toEqual(first);
  });

  it("degrades gracefully with malformed package.json", async () => {
    const projectRoot = join(TMP_ROOT, "malformed-json");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, "package.json"), "{ invalid-json", "utf8");

    const warnSpy = vi.spyOn(logger, "warn");

    const result = await detectProjectContext({ projectRoot });

    expect(result.projectName).toBe("malformed-json");
    expect(result.projectType).toBe("node-package");
    expect(result.primaryLanguage).toBe("javascript");
    expect(result.frameworks).toEqual([]);
    expect(result.stackSignals).toContain("file:package.json");

    const malformedWarn = warnSpy.mock.calls.find(
      ([event]) => event === "project_detection_package_json_malformed",
    );
    expect(malformedWarn).toBeDefined();
    expect((malformedWarn?.[1] as Record<string, unknown>).file_path).toBe(
      join(projectRoot, "package.json"),
    );

    warnSpy.mockRestore();
  });

  it("emits structured debug log for each missing optional file (AC3)", async () => {
    // Directory with NO files — tsconfig.json and README.md are absent.
    const projectRoot = join(TMP_ROOT, "no-optional-files");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(
      join(projectRoot, "package.json"),
      JSON.stringify({ name: "no-optional-files" }),
      "utf8",
    );

    const debugSpy = vi.spyOn(logger, "debug");
    debugSpy.mockReset();

    await detectProjectContext({ projectRoot });

    // One debug log per missing file (tsconfig.json + README.md == 2).
    const missingLogs = debugSpy.mock.calls.filter(
      ([event]) => event === "project_detection_file_missing",
    );
    expect(missingLogs.length).toBe(2);

    const loggedPaths = missingLogs.map(([, meta]) => (meta as Record<string, unknown>).file_path);
    expect(loggedPaths).toContain(join(projectRoot, "tsconfig.json"));
    expect(loggedPaths).toContain(join(projectRoot, "README.md"));

    debugSpy.mockRestore();
  });
});
