import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { RuVectorMemoryConfig } from "../shared/types.js";
import { configSchema } from "./config-schema.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { loadEnvConfig } from "./env-loader.js";

function parseSimpleYaml(content: string): Partial<RuVectorMemoryConfig> {
  const parsed: Record<string, unknown> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (!key || value.length === 0) {
      continue;
    }

    if (/^-?\d+$/.test(value)) {
      parsed[key] = Number.parseInt(value, 10);
    } else {
      parsed[key] = value.replace(/^['\"]|['\"]$/g, "");
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
