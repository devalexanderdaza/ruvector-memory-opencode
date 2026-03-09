# Story 1.1: Plugin Installation and Automatic Activation

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to install the plugin and have it activate automatically in OpenCode,
so that I can use memory without manual bootstrap steps.

## Acceptance Criteria

**Given** an environment with Node.js `>=22`  
**When** I install the plugin with `npm` in the project  
**Then** the plugin is available in the next OpenCode session without manual activation  
**And** if Node.js is `<22`, I receive a clear and actionable error

## Functional Requirements Implemented

- **FR37:** Users can install plugin with single command: `npm install ruvector-memory`
- **FR38:** Plugin automatically initializes on next OpenCode agent session (no explicit activation)

## Tasks / Subtasks

- [ ] Task 1: Project initialization and package structure (AC: All)
  - [ ] 1.1: Create package.json with correct metadata and dependencies
  - [ ] 1.2: Configure tsup for bundling with DTS generation
  - [ ] 1.3: Configure Biome for linting/formatting
  - [ ] 1.4: Configure Vitest for testing framework
  - [ ] 1.5: Set up TypeScript configuration (strict mode)
  - [ ] 1.6: Create initial directory structure following architecture
  
- [ ] Task 2: Plugin entry point and activation mechanism (AC: 1, 2, 3)
  - [ ] 2.1: Create src/index.ts as package public entry point
  - [ ] 2.2: Create src/core/plugin.ts with activatePlugin() function
  - [ ] 2.3: Implement OpenCode plugin lifecycle hooks
  - [ ] 2.4: Create src/core/lifecycle.ts for deactivation logic
  - [ ] 2.5: Export public API from src/core/index.ts
  
- [ ] Task 3: Node.js version validation (AC: 4)
  - [ ] 3.1: Add engines field to package.json requiring Node.js >=22
  - [ ] 3.2: Implement runtime version check in plugin activation
  - [ ] 3.3: Create clear error messages for incompatible Node.js versions
  - [ ] 3.4: Test with Node.js versions <22, =22, >22
  
- [ ] Task 4: Zero-configuration defaults (AC: 2, 3)
  - [ ] 4.1: Create src/config/defaults.ts with sensible default values
  - [ ] 4.2: Create src/config/config-schema.ts with Zod validation
  - [ ] 4.3: Implement automatic config loading with fallback to defaults
  - [ ] 4.4: Document default values in BUILD.md
  
- [ ] Task 5: Error handling and logging infrastructure (AC: 4)
  - [ ] 5.1: Create src/shared/errors.ts with custom error classes
  - [ ] 5.2: Create src/shared/logger.ts with structured logging
  - [ ] 5.3: Implement graceful degradation strategy
  - [ ] 5.4: Create actionable error messages for common failures
  
- [ ] Task 6: Integration tests and validation (AC: All)
  - [ ] 6.1: Create tests/integration/plugin-activation.test.ts
  - [ ] 6.2: Test successful activation with Node.js >=22
  - [ ] 6.3: Test graceful error with Node.js <22
  - [ ] 6.4: Test zero-config installation and activation
  - [ ] 6.5: Validate package can be installed via npm
  
- [ ] Task 7: Documentation and build setup (AC: All)
  - [ ] 7.1: Create BUILD.md with installation instructions
  - [ ] 7.2: Create README.md with getting started guide
  - [ ] 7.3: Document npm scripts in package.json (build, test, lint)
  - [ ] 7.4: Add npm prepack script for validation before publish

## Dev Notes

### Architecture Patterns to Follow

**Plugin Lifecycle Pattern (Hybrid Preload + Async Init):**
```typescript
// src/core/plugin.ts
export async function activatePlugin(context: PluginActivationContext): Promise<void> {
  // Synchronous phase (critical path, <100ms)
  validateNodeVersion();
  const config = loadConfigOrDefaults();
  initializeLogger(config);
  
  // Asynchronous phase (non-blocking background)
  Promise.all([
    initializeVectorStore(config),
    detectProjectContext(),
    preloadTopMemories()
  ]).catch(handleGracefulDegradation);
}
```

**Error Handling Pattern (Never Block Agent):**
```typescript
// All tool implementations MUST return ToolResponse, never throw
type ToolResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: string; reason?: string; code?: string };

// Example usage in plugin activation
try {
  await activatePlugin(context);
} catch (error) {
  // Log error, enter degraded mode, but DON'T fail plugin load
  logger.error('plugin_activation_failed', { error });
  enterDegradedMode(error);
}
```

**Naming Conventions (Critical for Consistency):**
- Plugin functions: camelCase (`activatePlugin`, `initializeVectorStore`)
- Tool functions (OpenCode): snake_case (`memory_save`, `memory_search`)
- Types/Interfaces: PascalCase (`PluginActivationContext`, `ToolResponse`)
- Config keys: snake_case (`db_path`, `cache_size`)

### Critical Technical Constraints

**Node.js Version Enforcement:**
- package.json engines field: `"node": ">=22.0.0"`
- Runtime check: Use `process.versions.node` and semver comparison
- Error message template: "ruvector-memory requires Node.js >=22.0.0. Current: {version}. Please upgrade: https://nodejs.org"

**Zero-Configuration Philosophy:**
- Plugin MUST work without any configuration file
- All defaults in src/config/defaults.ts
- User can optionally override via .opencode/ruvector_memory_config.yaml
- Config loading: explicit config > env vars > defaults

**Performance SLAs (This Story):**
- Plugin activation (synchronous phase): <100ms p99
- Total initialization (with async background): <1 second p99
- No blocking of OpenCode agent startup sequence

**Security Constraints:**
- No network calls during installation or activation
- All data operations local to .opencode/ directory
- No telemetry or analytics transmission

### Project Structure (Based on Architecture)

```
ruvector-memory-opencode/
├── package.json              # npm manifest with Node.js >=22 requirement
├── tsconfig.json             # TypeScript strict mode config
├── biome.json                # Linter/formatter config
├── vitest.config.ts          # Test runner config
├── BUILD.md                  # Build and installation instructions
├── README.md                 # Getting started guide
│
├── src/
│   ├── index.ts              # 📌 Package entry point: export { activatePlugin }
│   ├── core/
│   │   ├── index.ts          # Public API: { activatePlugin }
│   │   ├── plugin.ts         # Main activation logic
│   │   └── lifecycle.ts      # Deactivation hooks
│   ├── config/
│   │   ├── index.ts          # Public API: { loadConfig }
│   │   ├── config-schema.ts  # Zod validation schema
│   │   ├── defaults.ts       # Default configuration values
│   │   └── env-loader.ts     # Environment variable support
│   └── shared/
│       ├── types.ts          # All public TypeScript interfaces
│       ├── errors.ts         # Custom error hierarchy
│       ├── logger.ts         # Structured logging singleton
│       └── utils.ts          # Helper functions (version check, etc.)
│
└── tests/
    ├── unit/
    │   ├── core/
    │   │   └── plugin.test.ts
    │   └── config/
    │       ├── defaults.test.ts
    │       └── config-schema.test.ts
    └── integration/
        └── plugin-activation.test.ts
```

### Module Dependencies (This Story)

**Production Dependencies:**
- None for this story (RuVector integration comes in Story 1.2)

**Dev Dependencies:**
- typescript: ^5.7.0
- tsup: ^8.5.1
- biome: ^2.4.6
- vitest: ^4.0.18
- zod: ^3.24.1 (for config validation)

**Peer Dependencies (Document but don't install yet):**
- @ruvector/core: ^0.88.0 (will be added in Story 1.2)

### Key Files to Create (This Story)

**Package Configuration:**
1. **package.json** — Name: `@ruvector/opencode-memory`, version: `0.1.0`, engines: `node >=22`
2. **tsconfig.json** — Strict mode, ESM target, declaration: true
3. **biome.json** — 455+ rules enabled, formatter defaults
4. **vitest.config.ts** — Test configuration with coverage
5. **BUILD.md** — Installation and build instructions

**Source Code:**
1. **src/index.ts** — Export activatePlugin and types
2. **src/core/plugin.ts** — Main activation function with version validation
3. **src/core/lifecycle.ts** — Placeholder for deactivation (used later)
4. **src/config/defaults.ts** — Default config object
5. **src/config/config-schema.ts** — Zod schema for validation
6. **src/shared/types.ts** — PluginActivationContext, Config interfaces
7. **src/shared/errors.ts** — RuVectorMemoryError, NodeVersionError classes
8. **src/shared/logger.ts** — Structured logger implementation
9. **src/shared/utils.ts** — Version comparison, UUID generation

**Tests:**
1. **tests/unit/core/plugin.test.ts** — Test activatePlugin logic
2. **tests/unit/config/defaults.test.ts** — Validate default values
3. **tests/integration/plugin-activation.test.ts** — End-to-end activation test

### Testing Strategy (This Story)

**Unit Tests:**
- Node.js version validation logic (test with semver comparisons)
- Config loading with defaults
- Error class instantiation and properties

**Integration Tests:**
- Full plugin activation sequence
- Graceful error handling for Node.js <22
- Config loading from file vs. defaults fallback

**Manual Validation:**
- Install in test project: `npm install file:../ruvector-memory-opencode`
- Verify no activation errors in OpenCode console
- Test with Node.js 20, 22, 23 to validate version check

### References

**Architecture Document:**
- [Starter Template Evaluation](../../planning-artifacts/architecture.md#starter-template-evaluation) — Modern toolchain stack (tsup, Biome, Vitest)
- [Plugin Lifecycle Management](../../planning-artifacts/architecture.md#plugin-lifecycle-management) — Hybrid preload + async init pattern
- [Naming Patterns](../../planning-artifacts/architecture.md#naming-patterns) — Consistent naming conventions across codebase
- [Error Handling Pattern](../../planning-artifacts/architecture.md#error-handling-pattern) — Never throw from tools, structured responses
- [Project Structure](../../planning-artifacts/architecture.md#project-structure--boundaries) — Complete directory layout

**PRD Document:**
- [FR37: Single Command Install](../../planning-artifacts/prd.md#installation--zero-configuration-setup) — `npm install ruvector-memory`
- [FR38: Automatic Activation](../../planning-artifacts/prd.md#installation--zero-configuration-setup) — No manual bootstrap
- [NFR3: Plugin Initialization](../../planning-artifacts/prd.md#performance) — <1 second on first run

**Epics Document:**
- [Epic 1: Persistent Memory Ready in Minutes](../../planning-artifacts/epics.md#epic-1-persistent-memory-ready-in-minutes) — Full epic context
- [Story 1.1: Acceptance Criteria](../../planning-artifacts/epics.md#story-11-plugin-installation-and-automatic-activation) — Complete BDD scenarios

### Critical Success Factors

**For DEV Agent:**
1. ✅ Follow modular architecture — don't create monolithic files
2. ✅ Use Zod for all config validation — runtime type safety is critical
3. ✅ Implement structured logging from day one — essential for debugging
4. ✅ Never throw from public APIs — always return ToolResponse format
5. ✅ Test Node.js version validation thoroughly — prevents production issues
6. ✅ Document all npm scripts in BUILD.md — enable contributors

**Common Pitfalls to Avoid:**
- ❌ Don't hardcode configuration values — use src/config/defaults.ts
- ❌ Don't use console.log — always use structured logger
- ❌ Don't create circular dependencies between subsystems
- ❌ Don't mix naming conventions (snake_case vs camelCase)
- ❌ Don't skip TypeScript strict checks — catches bugs early

### Definition of Done

This story is complete when:
1. ✅ Package can be installed via `npm install @ruvector/opencode-memory`
2. ✅ Plugin activates automatically in OpenCode without errors
3. ✅ Node.js >=22 requirement is enforced at runtime
4. ✅ Clear error message shown for Node.js <22
5. ✅ All unit tests pass with >90% coverage
6. ✅ Integration test validates end-to-end activation
7. ✅ BUILD.md documents installation and build process
8. ✅ No lint or type errors (npm run lint, npm run typecheck pass)
9. ✅ Package builds successfully (npm run build produces dist/)
10. ✅ Manual testing confirms zero-config activation works

---

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent during implementation_

### Debug Log References

_To be filled by dev agent during implementation_

### Completion Notes List

_To be filled by dev agent during implementation_

### File List

_To be filled by dev agent during implementation_
