import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { logger } from "../shared/logger.js";

interface ProjectDetectionOptions {
  projectRoot?: string;
}

interface ProjectDetectionResult {
  projectRoot: string;
}

function findGitRoot(startDir: string): string | null {
  let current: string | null = startDir;

  while (current) {
    const gitPath = join(current, ".git");
    if (existsSync(gitPath) && statSync(gitPath).isDirectory()) {
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

export function detectProjectRoot(
  options: ProjectDetectionOptions = {},
): ProjectDetectionResult {
  const explicitRoot = options.projectRoot;
  const cwd = process.cwd();

  // 1) Explicit projectRoot from activation context wins.
  if (explicitRoot) {
    logger.debug("project_root_explicit", { project_root: explicitRoot });
    return { projectRoot: explicitRoot };
  }

  // 2) Prefer repository root if inside a git repo.
  const gitRoot = findGitRoot(cwd);
  if (gitRoot) {
    logger.debug("project_root_git", { project_root: gitRoot });
    return { projectRoot: gitRoot };
  }

  // 3) Fallback to current working directory.
  logger.debug("project_root_cwd_fallback", { project_root: cwd });
  return { projectRoot: cwd };
}
