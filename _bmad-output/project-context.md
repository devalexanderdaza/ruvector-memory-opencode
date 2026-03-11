---
project_name: 'ruvector-memory-opencode'
user_name: 'Alexander'
date: '2026-03-11'
sections_completed:
  - technology_stack
  - language_rules
  - plugin_architecture_rules
  - testing_rules
  - code_quality_rules
  - workflow_rules
  - critical_dont_miss_rules
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **TypeScript** 5.7+ — strict mode, target ES2022, module NodeNext
- **Node.js** ≥22.0.0 — REQUIRED (NAPI-RS bindings from @ruvector/core)
- **tsup** 8.5.1 — bundler, ESM-only output, target node22, entry `src/index.ts`
- **Vitest** 4.0.18 — test runner, environment node, coverage via v8
- **Biome** 1.9.4 — unified linter + formatter (do NOT use ESLint or Prettier)
- **Zod** 3.24.1 — schema validation at all external boundaries
- **@ruvector/core** ^0.1.30 — optional peer dependency (vector store with NAPI-RS Rust bindings)

---

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- **All internal imports MUST use `.js` extension** (not `.ts`): `import { foo } from "./bar.js"` — required by ESM/NodeNext module resolution
- **Advanced strict flags are active**: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables` — never use `as` to bypass these checks
- **Never use `any`** — use `unknown` in catch blocks and untyped external parameters; narrow before use
- **Array index access**: with `noUncheckedIndexedAccess`, always narrow or use `??` default: `arr[0] ?? fallback`
- **Async/await always** — never use raw `.then()` chains; all memory operations are non-blocking
- **Validate all external input with Zod** — env vars, YAML config files, tool inputs — never assume types from external sources; see `config-schema.ts` for the pattern

### Tool Response Contract

Every tool handler and public API function MUST return `ToolResponse<T>` — a discriminated union:

```typescript
// Success
{ success: true, data: T }

// Failure — NEVER throw, always return
{ success: false, code: string, error: string, reason?: string }
```

- Tools must **never throw** — catch all errors and return `{ success: false, ... }`
- Error `code` must be a SCREAMING_SNAKE_CASE string (e.g., `"NODE_VERSION_UNSUPPORTED"`, `"DB_INIT_FAILED"`)
- Errors must include actionable messages with remediation hints (e.g., links to docs, specific next steps)

### Error Hierarchy

Always extend the base error class, never throw plain `Error`:

```typescript
// Base: src/shared/errors.ts
RuVectorMemoryError  (base, with .code: string)
  └── NodeVersionError      (code: "NODE_VERSION_UNSUPPORTED")
  └── InitializationError   (code: "DB_INIT_FAILED")
```

Add new error subclasses to `src/shared/errors.ts` only; do not create inline error classes.

---

### Plugin Architecture Rules

- **Plugin state is module-level singletons** in `src/core/plugin.ts` — `isDegraded`, `activeConfig`, `vectorStore`, `activeProjectRoot`, `activeProjectContext`, `memoryInjector`. Never pass these as function parameters; access via module exports.
- **`resetPluginStateForTests()`** MUST be called in `afterEach` in every test file that activates the plugin — this resets all singletons to initial state.
- **Factory pattern for tools** — each tool is created by a factory function (`createMemorySaveTool()`, `createMemorySearchTool()`, `createMemoryLearnTool()`); no DI framework.
- **Tool registration** happens via `ToolRegistryLike` interface — type guard `isToolRegistryLike()` must be used before calling `.registerTool()`; registration is silently skipped (not an error) if no registry is provided.
- **Config 3-layer merge order**: `DEFAULT_CONFIG` → env vars (`RUVECTOR_MEMORY_*` prefix) → YAML file (`.opencode/ruvector_memory_config.yaml`). Later layers override earlier ones.
- **Graceful degradation**: plugin enters `isDegraded = true` state on first-operation failures. Agent continues working; degraded state is reported in `ToolResponse`. Never block agent on memory failures.
- **Circuit breaker** in `MemoryContextInjector`: opens after 3 consecutive injection failures (`MAX_CONSECUTIVE_FAILURES = 3`). Returns empty context, never throws.
- **Project isolation**: each project stores its DB at `{projectRoot}/.opencode/ruvector_memory.db` — never share DB paths across projects.

### Composite Ranking Formula (memory_search)

Search uses "lower is better" distance semantics:

```
compositeScore = cosineDist - priorityBoost - recencyBoost - confidenceBoost

priorityBoost:  +0.05 (critical), 0 (normal), -0.02 (low)
recencyBoost:   +0.02 (< 1 day),  +0.01 (< 7 days), 0 otherwise
confidenceBoost: (confidence - 0.5) * 0.04  →  range [-0.02, +0.02]
```

Results are sorted ascending by `compositeScore` (lower = more relevant).

### Structured Logger

Always use the module-level singleton from `src/shared/logger.ts`. **Never use `console.log` directly** in production code:

```typescript
import { logger } from "../shared/logger.js";

logger.info("event_name", { key: value });   // event names are snake_case strings
logger.warn("event_name", { key: value });
logger.error("event_name", { key: value });
```

- Event names: `snake_case` strings identifying the operation (e.g., `"tools_registered"`, `"plugin_deactivate"`, `"memories_preloaded"`)
- Metadata: always a flat `Record<string, unknown>` — no nested structures in log metadata

---

### Testing Rules

- **Test files location**: `tests/unit/` and `tests/integration/` — mirror `src/` directory structure exactly. E.g., `src/core/plugin.ts` → `tests/unit/core/plugin.test.ts`
- **Coverage thresholds** (enforced by Vitest, CI fails below these):
  - Lines: 90%, Branches: 85%, Functions: 90%, Statements: 90%
- **Integration tests** use real filesystem via `process.cwd()/.tmp-{name}-tests` — always clean up with `rmSync(TMP_ROOT, { recursive: true, force: true })` in `afterEach`
- **Unit tests** use vi.mock / spies; never touch the real filesystem
- **`resetPluginStateForTests()`** in `afterEach` is mandatory in every plugin test — forgetting this causes test pollution across the suite
- **No `describe` nesting beyond 2 levels** — keep test structure flat
- **Test naming**: `it("verb + expected behavior", ...)` — describes behavior, not implementation
- **Performance SLA tests**: activation must complete in <1000ms; search must complete in <300ms (p99)

---

### Code Quality & Style Rules

- **Formatter**: Biome with 2-space indent, `lineWidth: 100`, double quotes (enforced automatically — run `npm run format`)
- **Linting**: `npm run lint` covers `src/`, `tests/`, and config files — must pass before commit
- **File naming**: `kebab-case` for all files (e.g., `vector-store.ts`, `memory-save-tool.ts`)
- **Module exports**: always use named exports from `index.ts` barrel files — no default exports
- **No inline magic numbers** — extract constants with SCREAMING_SNAKE_CASE names at module level (e.g., `MAX_SEARCH_LIMIT = 100`, `MAX_CONSECUTIVE_FAILURES = 3`)
- **Type assertions (`as`)**: avoid entirely — use type guards or Zod parsing instead
- **`public constructor`** visibility keyword required by Biome rules (see `MemoryContextInjector`)
- **`public` method visibility**: explicit on class methods (Biome enforces this)

---

### Development Workflow Rules

- **Build**: `npm run build` (tsup, outputs to `dist/`)
- **Test**: `npm test` (Vitest with coverage)
- **Type check**: `npm run typecheck` (tsc --noEmit, no output)
- **Lint + format**: `npm run lint` / `npm run format`
- **Pre-publish gate** (`prepack`): `lint → typecheck → test → build` — all must pass
- **Module system**: ESM-only (`"type": "module"` in package.json) — no CJS output
- **Distribution**: npm package `@ruvector/opencode-memory` — do not add CJS exports without explicit decision

---

### Critical Don't-Miss Rules

#### Never Do These

- ❌ **Never import with `.ts` extension** — always `.js` even for TypeScript files
- ❌ **Never throw errors from tool handlers** — always return `{ success: false, ... }`
- ❌ **Never use `console.log/warn/error` directly** — always use `logger` singleton
- ❌ **Never share DB paths between projects** — isolation is per `projectRoot`
- ❌ **Never use ESLint or Prettier** — project uses Biome exclusively
- ❌ **Never add CJS output to tsup** — ESM only; changing this requires architecture decision
- ❌ **Never block the agent on memory failures** — always degrade gracefully
- ❌ **Never call `detectProjectRoot()` directly from tools** — use `ensureProjectContextForTools()` from `plugin.ts` which handles caching and in-flight deduplication

#### Edge Cases Agents Must Handle

- **`@ruvector/core` absent**: the peer dependency is optional. When not installed, `createVectorStoreAdapter()` must still return a valid adapter that gracefully handles the absence (returns empty results, not throws).
- **First operation before activation**: `initializeMemoryOnFirstOperation()` returns `{ success: false, code: "PLUGIN_NOT_ACTIVATED" }` — never assumes activation happened.
- **Config file absent**: silently falls back to `DEFAULT_CONFIG` — no error, no warning.
- **Concurrent project context detection**: `inFlightProjectContextPromise` deduplicates concurrent calls to `detectAndStoreProjectContext()` — do not add additional locking.
- **`noUncheckedIndexedAccess` gotcha**: `search.data.results[0]` may be `undefined` — always check length or use `?? fallback` before accessing indexed results.
- **Metadata stored as JSON string**: vector DB stores metadata as a JSON-serialized string — always `JSON.parse` on read, `JSON.stringify` on write. See `parseMetadata()` in `vector-store.ts`.

#### Security Rules

- **Secret detection**: tag memories with `hasSecretPattern: true` using regex patterns — do NOT silently drop memories; flag and continue
- **No network calls**: all operations must be local-only — zero external HTTP/network calls allowed
- **Local data only**: DB lives in `.opencode/` under project root — never write outside this directory

