import type { RuVectorMemoryConfig } from "../shared/types.js";

function normalizeEnv(value: string | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = value.trim();
  // Only treat explicit "undefined" and "null" strings as undefined
  // Allow "0" and "false" as valid values (not falsy in string form)
  if (normalized === "undefined" || normalized === "null") {
    return undefined;
  }

  return normalized;
}

const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

function isValidLogLevel(value: string): value is RuVectorMemoryConfig["log_level"] {
  return VALID_LOG_LEVELS.includes(value as RuVectorMemoryConfig["log_level"]);
}

export function loadEnvConfig(): Partial<RuVectorMemoryConfig> {
  const cacheSize = normalizeEnv(process.env.RUVECTOR_MEMORY_CACHE_SIZE);
  const logLevel = normalizeEnv(process.env.RUVECTOR_MEMORY_LOG_LEVEL);
  const dbPath = normalizeEnv(process.env.RUVECTOR_MEMORY_DB_PATH);
  const preload = normalizeEnv(process.env.RUVECTOR_MEMORY_PRELOAD_TOP);

  return {
    ...(dbPath ? { db_path: dbPath } : {}),
    ...(cacheSize ? { cache_size: Number.parseInt(cacheSize, 10) } : {}),
    ...(logLevel && isValidLogLevel(logLevel) ? { log_level: logLevel } : {}),
    ...(preload ? { preload_top_memories: Number.parseInt(preload, 10) } : {}),
  };
}
