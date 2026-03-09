import { z } from "zod";

export const configSchema = z.object({
  db_path: z.string().min(1),
  cache_size: z.number().int().positive(),
  log_level: z.enum(["debug", "info", "warn", "error"]),
  preload_top_memories: z.number().int().min(0),
});

export type ConfigSchema = z.infer<typeof configSchema>;
