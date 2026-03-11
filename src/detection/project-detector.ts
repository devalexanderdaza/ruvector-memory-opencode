import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { logger } from "../shared/logger.js";
import type { ProjectDetectionOptions, ProjectDetectionResult } from "../shared/types.js";

type ParsedPackage = {
  name?: string;
  private?: boolean;
  workspaces?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const FRAMEWORK_DEPENDENCY_MAP: Array<{ dep: string; framework: string }> = [
  { dep: "@angular/core", framework: "angular" },
  { dep: "astro", framework: "astro" },
  { dep: "remix", framework: "remix" },
  { dep: "next", framework: "nextjs" },
  { dep: "react", framework: "react" },
  { dep: "solid-js", framework: "solidjs" },
  { dep: "vue", framework: "vue" },
  { dep: "nuxt", framework: "nuxt" },
  { dep: "svelte", framework: "svelte" },
  { dep: "koa", framework: "koa" },
  { dep: "@hapi/hapi", framework: "hapi" },
  { dep: "@adonisjs/core", framework: "adonisjs" },
  { dep: "nestjs", framework: "nestjs" },
  { dep: "express", framework: "express" },
  { dep: "fastify", framework: "fastify" },
];

function findGitRoot(startDir: string): string | null {
  let current: string | null = startDir;

  while (current) {
    const gitPath = join(current, ".git");
    // Accept .git as either a directory (normal clone) or a plain file
    // (git worktrees and submodules write a "gitfile" instead of a directory).
    if (existsSync(gitPath)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

export function detectProjectRoot(options: ProjectDetectionOptions = {}): ProjectDetectionResult {
  const explicitRoot = options.projectRoot;
  const cwd = process.cwd();

  // 1) Explicit projectRoot from activation context wins.
  if (explicitRoot) {
    logger.debug("project_root_explicit", { project_root: explicitRoot });
    return {
      projectRoot: explicitRoot,
      projectName: getFolderName(explicitRoot),
      projectType: "generic",
      primaryLanguage: "unknown",
      frameworks: [],
      stackSignals: ["root:explicit"],
    };
  }

  // 2) Prefer repository root if inside a git repo.
  const gitRoot = findGitRoot(cwd);
  if (gitRoot) {
    logger.debug("project_root_git", { project_root: gitRoot });
    return {
      projectRoot: gitRoot,
      projectName: getFolderName(gitRoot),
      projectType: "generic",
      primaryLanguage: "unknown",
      frameworks: [],
      stackSignals: ["root:git"],
    };
  }

  // 3) Fallback to current working directory.
  logger.debug("project_root_cwd_fallback", { project_root: cwd });
  return {
    projectRoot: cwd,
    projectName: getFolderName(cwd),
    projectType: "generic",
    primaryLanguage: "unknown",
    frameworks: [],
    stackSignals: ["root:cwd"],
  };
}

function getFolderName(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  const folder = basename(normalized);
  return folder.length > 0 ? folder : "unknown-project";
}

async function readTextFileSafely(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (err) {
    logger.debug("project_detection_file_missing", {
      file_path: filePath,
      reason: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function parsePackageJson(content: string | null, packagePath: string): ParsedPackage | null {
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as ParsedPackage;
    }
  } catch (error) {
    logger.warn("project_detection_package_json_malformed", {
      signal: "file:package.json",
      file_path: packagePath,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  return null;
}

function detectPrimaryLanguage(
  packageJsonExists: boolean,
  tsconfigExists: boolean,
  readmeText: string,
  allDependencies: Set<string>,
): string {
  const readmeLower = readmeText.toLowerCase();

  if (tsconfigExists || allDependencies.has("typescript")) {
    return "typescript";
  }

  if (packageJsonExists) {
    return "javascript";
  }

  if (readmeLower.includes("typescript")) {
    return "typescript";
  }

  if (readmeLower.includes("javascript") || readmeLower.includes("node.js")) {
    return "javascript";
  }

  return "unknown";
}

function hasWorkspaceConfiguration(workspaces: unknown): boolean {
  if (Array.isArray(workspaces)) {
    return workspaces.some((entry) => typeof entry === "string" && entry.trim().length > 0);
  }

  if (workspaces && typeof workspaces === "object") {
    const maybePackages = (workspaces as Record<string, unknown>).packages;
    if (Array.isArray(maybePackages)) {
      return maybePackages.some(
        (entry) => typeof entry === "string" && entry.trim().length > 0,
      );
    }
  }

  return false;
}

function detectProjectType(
  frameworks: string[],
  packageJsonExists: boolean,
  packageJson: ParsedPackage | null,
): string {
  const frameworkSet = new Set(frameworks);

  if (hasWorkspaceConfiguration(packageJson?.workspaces)) {
    return "monorepo";
  }

  if (
    frameworkSet.has("angular") ||
    frameworkSet.has("astro") ||
    frameworkSet.has("remix") ||
    frameworkSet.has("nextjs") ||
    frameworkSet.has("react") ||
    frameworkSet.has("solidjs") ||
    frameworkSet.has("vue") ||
    frameworkSet.has("nuxt") ||
    frameworkSet.has("svelte")
  ) {
    return "web-app";
  }

  if (
    frameworkSet.has("adonisjs") ||
    frameworkSet.has("nestjs") ||
    frameworkSet.has("express") ||
    frameworkSet.has("fastify") ||
    frameworkSet.has("koa") ||
    frameworkSet.has("hapi")
  ) {
    return "api-service";
  }

  if (packageJsonExists) {
    return "node-package";
  }

  return "generic";
}

export async function detectProjectContext(
  options: ProjectDetectionOptions = {},
): Promise<ProjectDetectionResult> {
  const rootResult = detectProjectRoot(options);
  const projectRoot = rootResult.projectRoot;

  const packagePath = join(projectRoot, "package.json");
  const tsconfigPath = join(projectRoot, "tsconfig.json");
  const readmePath = join(projectRoot, "README.md");

  const [packageJsonContent, tsconfigContent, readmeContent] = await Promise.all([
    readTextFileSafely(packagePath),
    readTextFileSafely(tsconfigPath),
    readTextFileSafely(readmePath),
  ]);

  const stackSignals: string[] = [];
  if (packageJsonContent !== null) {
    stackSignals.push("file:package.json");
  }
  if (tsconfigContent !== null) {
    stackSignals.push("file:tsconfig.json");
  }
  if (readmeContent !== null) {
    stackSignals.push("file:README.md");
  }

  const packageJson = parsePackageJson(packageJsonContent, packagePath);
  const packageName =
    typeof packageJson?.name === "string" && packageJson.name.trim().length > 0
      ? packageJson.name.trim()
      : getFolderName(projectRoot);

  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
  };
  const allDependencies = new Set(Object.keys(dependencies));

  const frameworks: string[] = [];
  for (const entry of FRAMEWORK_DEPENDENCY_MAP) {
    if (allDependencies.has(entry.dep)) {
      frameworks.push(entry.framework);
      stackSignals.push(`dep:${entry.dep}`);
    }
  }

  const primaryLanguage = detectPrimaryLanguage(
    packageJsonContent !== null,
    tsconfigContent !== null,
    readmeContent ?? "",
    allDependencies,
  );

  const projectType = detectProjectType(frameworks, packageJsonContent !== null, packageJson);

  const result: ProjectDetectionResult = {
    projectRoot,
    projectName: packageName,
    projectType,
    primaryLanguage,
    frameworks,
    stackSignals,
  };

  logger.info("project_context_detected", {
    project_root: result.projectRoot,
    project_name: result.projectName,
    project_type: result.projectType,
    primary_language: result.primaryLanguage,
    frameworks: result.frameworks,
  });

  return result;
}
