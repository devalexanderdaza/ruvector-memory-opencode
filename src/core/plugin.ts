import { loadConfig } from "../config/index.js";
import { NodeVersionError, RuVectorMemoryError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import type { ActivationResult, PluginActivationContext, ToolResponse } from "../shared/types.js";
import { validateNodeVersion } from "../shared/utils.js";

async function initializeVectorStore(): Promise<void> {
  return Promise.resolve();
}

async function detectProjectContext(): Promise<void> {
  return Promise.resolve();
}

async function preloadTopMemories(): Promise<void> {
  return Promise.resolve();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown plugin activation error";
}

export async function activatePlugin(
  context: PluginActivationContext = {},
): Promise<ToolResponse<ActivationResult>> {
  const start = performance.now();

  try {
    validateNodeVersion(context.runtimeNodeVersion);
    const config = loadConfig(context.projectRoot, context.configPath);
    logger.configure(config.log_level);

    Promise.all([initializeVectorStore(), detectProjectContext(), preloadTopMemories()]).catch(
      (error: unknown) => {
        logger.warn("plugin_background_init_failed", { error: toErrorMessage(error) });
      },
    );

    logger.info("plugin_activated", {
      activation_ms: Math.round(performance.now() - start),
      config_source: context.configPath ?? "default",
    });

    return {
      success: true,
      data: {
        activated: true,
        degraded: false,
        message: "Plugin activated",
      },
    };
  } catch (error) {
    const message = toErrorMessage(error);
    if (error instanceof NodeVersionError) {
      logger.error("plugin_activation_blocked", { reason: message });
      return { success: false, error: message, code: error.code, reason: "runtime-version" };
    }

    logger.error("plugin_activation_failed", { reason: message });
    const wrapped = new RuVectorMemoryError(message);
    return { success: false, error: wrapped.message, code: wrapped.code, reason: "activation" };
  }
}
