import { logger } from "../shared/logger.js";

export async function deactivatePlugin(): Promise<void> {
  logger.info("plugin_deactivate", { reason: "manual_or_shutdown" });
}
