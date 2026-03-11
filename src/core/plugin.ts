import { loadConfig } from "../config/index.js";
import { detectProjectRoot } from "../detection/project-detector.js";
import { NodeVersionError, RuVectorMemoryError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import type {
  ActivationResult,
  InitResult,
  MemoryInjectionConfig,
  MemoryInjectionResult,
  PluginActivationContext,
  RuVectorMemoryConfig,
  ToolResponse,
} from "../shared/types.js";
import { validateNodeVersion } from "../shared/utils.js";
import { injectTools } from "../tools/index.js";
import { MemoryContextInjector } from "../tools/memory-context-injector.js";
import { type VectorStoreAdapter, createVectorStoreAdapter } from "../vector/index.js";

// Global degraded state tracking for background init failures
let isDegraded = false;
let activeProjectRoot = process.cwd();
let activeConfig: RuVectorMemoryConfig | null = null;
let vectorStore: VectorStoreAdapter | null = null;
let memoryInjector: MemoryContextInjector | null = null;
let preloadedMemoryContext = "";

// Placeholder implementations - initializeVectorStore and preloadTopMemories will be
// expanded in later stories. Project context detection is wired to detection subsystem.
async function initializeVectorStore(): Promise<void> {
  return Promise.resolve();
}

async function detectProjectContext(): Promise<void> {
  const { projectRoot } = detectProjectRoot({ projectRoot: activeProjectRoot });
  activeProjectRoot = projectRoot;

  logger.info("project_context_detected", {
    project_root: activeProjectRoot,
  });
}

async function preloadTopMemories(): Promise<void> {
  if (!vectorStore || !memoryInjector) {
    return;
  }

  try {
    const result = await memoryInjector.inject(vectorStore);
    preloadedMemoryContext = result.context;

    if (result.memoriesInjected > 0) {
      logger.info("memories_preloaded", {
        count: result.memoriesInjected,
        tokensUsed: result.tokensUsed,
      });
    }
  } catch {
    // Graceful degradation — plugin continues with no preloaded context
    preloadedMemoryContext = "";
  }
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

    activeProjectRoot = context.projectRoot ?? process.cwd();
    activeConfig = config;
    vectorStore = createVectorStoreAdapter(config, activeProjectRoot);
    isDegraded = false;

    const injectionConfig: MemoryInjectionConfig = {
      enablePassiveInjection: config.memory_injection_enabled,
      maxMemoriesToInject: config.preload_top_memories,
      relevanceThreshold: config.memory_injection_relevance_threshold,
      maxTokenBudget: config.memory_injection_max_token_budget,
      formattingStyle: "markdown",
    };
    memoryInjector = new MemoryContextInjector(injectionConfig);

    // Register OpenCode tools synchronously (stubs allowed); never blocks activation.
    injectTools(context);

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
      return {
        success: false,
        error: message,
        code: error.code,
        reason: "runtime-version",
      };
    }

    logger.error("plugin_activation_failed", { reason: message });
    const wrapped = new RuVectorMemoryError(message);
    return {
      success: false,
      error: wrapped.message,
      code: wrapped.code,
      reason: "activation",
    };
  }
}

export async function initializeMemoryOnFirstOperation(): Promise<InitResult> {
  if (!activeConfig || !vectorStore) {
    return {
      success: false,
      error: "Cannot initialize database: plugin is not activated",
      code: "PLUGIN_NOT_ACTIVATED",
      reason: "initialization",
    };
  }

  const result = await vectorStore.ensureInitialized();
  if (!result.success) {
    isDegraded = true;
    logger.warn("plugin_entered_degraded_mode", {
      project_root: activeProjectRoot,
      reason: result.error,
    });
  }

  return result;
}

export function resetPluginStateForTests(): void {
  isDegraded = false;
  activeProjectRoot = process.cwd();
  activeConfig = null;
  preloadedMemoryContext = "";
  memoryInjector = null;
  if (vectorStore) {
    vectorStore.resetForTests();
  }
  vectorStore = null;
}

export function getPluginState(): { degraded: boolean } {
  return { degraded: isDegraded };
}

export function getVectorStoreAdapterForTools(): VectorStoreAdapter | null {
  return vectorStore;
}

/**
 * Returns the last cached passive memory context string.
 * This string is set during plugin startup (background preload) and can be
 * refreshed on-demand via refreshPreloadedContext().
 *
 * Returns empty string if the plugin is not activated or no memories exist.
 */
export function getPreloadedMemoryContext(): string {
  return preloadedMemoryContext;
}

/**
 * Explicitly triggers the memory context injection pipeline and updates the
 * cached preloaded context.
 *
 * Use this to refresh the context mid-session or in tests to await preloading.
 *
 * @param query - Optional semantic query for context-aware retrieval (default: "")
 * @returns InjectionResult or null if the plugin is not activated
 */
export async function refreshPreloadedContext(query = ""): Promise<MemoryInjectionResult | null> {
  if (!vectorStore || !memoryInjector) {
    return null;
  }

  const result = await memoryInjector.inject(vectorStore, query);
  preloadedMemoryContext = result.context;

  logger.info("memory_context_refreshed", {
    memoriesInjected: result.memoriesInjected,
    tokensUsed: result.tokensUsed,
    skipped: result.skipped,
  });

  return result;
}
