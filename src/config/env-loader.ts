import type { RuVectorMemoryConfig } from "../shared/types.js";

function normalizeEnv(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized === "undefined" || normalized === "null") {
    return undefined;
  }

  return normalized;
}

export function loadEnvConfig(): Partial<RuVectorMemoryConfig> {
  const cacheSize = normalizeEnv(process.env.RUVECTOR_MEMORY_CACHE_SIZE);
  const logLevel = normalizeEnv(process.env.RUVECTOR_MEMORY_LOG_LEVEL);
  const dbPath = normalizeEnv(process.env.RUVECTOR_MEMORY_DB_PATH);
  const preload = normalizeEnv(process.env.RUVECTOR_MEMORY_PRELOAD_TOP);

  return {
    ...(dbPath ? { db_path: dbPath } : {}),
    ...(cacheSize ? { cache_size: Number.parseInt(cacheSize, 10) } : {}),
    ...(logLevel ? { log_level: logLevel as RuVectorMemoryConfig["log_level"] } : {}),
    ...(preload ? { preload_top_memories: Number.parseInt(preload, 10) } : {}),
  };
}
