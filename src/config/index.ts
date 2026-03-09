import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { RuVectorMemoryConfig } from "../shared/types.js";
import { configSchema } from "./config-schema.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { loadEnvConfig } from "./env-loader.js";

function parseSimpleYaml(content: string): Partial<RuVectorMemoryConfig> {
  const parsed: Record<string, unknown> = {};
  for (const rawLine of content.split("\n")) {
    // Remove inline comments but preserve URLs and other colon-containing values
    const commentIndex = rawLine.indexOf("#");
    const lineWithoutComment = commentIndex > 0 ? rawLine.slice(0, commentIndex) : rawLine;
    const line = lineWithoutComment.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const key = line.slice(0, colonIndex).trim();
    const rawValue = line.slice(colonIndex + 1).trim();

    if (!key || rawValue.length === 0) {
      continue;
    }

    // Parse booleans
    if (rawValue === "true" || rawValue === "false") {
      parsed[key] = rawValue === "true";
    }
    // Parse integers
    else if (/^-?\d+$/.test(rawValue)) {
      parsed[key] = Number.parseInt(rawValue, 10);
    }
    // Parse strings (remove quotes if present)
    else {
      parsed[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
  return parsed as Partial<RuVectorMemoryConfig>;
}

export function loadConfig(
  projectRoot = process.cwd(),
  explicitConfigPath?: string,
): RuVectorMemoryConfig {
  const defaultPath = resolve(projectRoot, ".opencode/ruvector_memory_config.yaml");
  const configPath = explicitConfigPath ? resolve(projectRoot, explicitConfigPath) : defaultPath;

  const fileConfig = existsSync(configPath)
    ? parseSimpleYaml(readFileSync(configPath, "utf8"))
    : {};

  const merged = {
    ...DEFAULT_CONFIG,
    ...loadEnvConfig(),
    ...fileConfig,
  };

  return configSchema.parse(merged);
}
