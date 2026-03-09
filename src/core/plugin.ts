import { loadConfig } from "../config/index.js";
import { NodeVersionError, RuVectorMemoryError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import type { ActivationResult, PluginActivationContext, ToolResponse } from "../shared/types.js";
import { validateNodeVersion } from "../shared/utils.js";

// Global degraded state tracking for background init failures
let isDegraded = false;

// Placeholder implementations - will be implemented in Story 1.2 (RuVector Integration)
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

    // Background initialization - failures set degraded mode but don't block activation
    Promise.all([initializeVectorStore(), detectProjectContext(), preloadTopMemories()]).catch(
      (error: unknown) => {
        isDegraded = true;
        logger.warn("plugin_background_init_failed", {
          error: toErrorMessage(error),
          degraded: true,
        });
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
        degraded: isDegraded,
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

export function getPluginState(): { degraded: boolean } {
  return { degraded: isDegraded };
}
