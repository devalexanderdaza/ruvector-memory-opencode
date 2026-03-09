# Story 1.2: First-Run Initialization and Local Per-Project Database

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the project's local memory database to be created automatically on first use,
so that I have immediate persistence without additional configuration.

## Acceptance Criteria

**Given** a project without a previous memory database  
**When** I run the first memory operation  
**Then** `.opencode/ruvector_memory.db` is created automatically  
**And** safe default values are applied for initial operation

## Functional Requirements Implemented

- **FR4:** Memory is persisted locally in `.opencode/ruvector_memory.db` on the developer's machine
- **FR39:** System auto-detects if this is first run; creates `.opencode/ruvector_memory.db` automatically
- **FR40:** Sensible defaults apply: vector dimensions, similarity threshold, feedback weighting, retention policies

## Tasks / Subtasks

- [x] Task 1: Database initialization logic (AC: 1, 2, 3)
  - [x] 1.1: Create database initialization function in vector store adapter
  - [x] 1.2: Implement first-run detection (check if DB file exists)
  - [x] 1.3: Create `.opencode/` directory if it doesn't exist
  - [x] 1.4: Initialize RuVector database with default schema
  - [x] 1.5: Set up default vector configuration (dimensions, HNSW parameters)
  
- [x] Task 2: Default configuration values (AC: 4)
  - [x] 2.1: Define default vector dimensions (384-dim for all-MiniLM model)
  - [x] 2.2: Set default similarity threshold (0.75)
  - [x] 2.3: Configure default feedback weighting parameters
  - [x] 2.4: Set default retention policies (7 daily, 4 weekly, 12 monthly backups)
  - [x] 2.5: Document all defaults in config schema
  
- [x] Task 3: Safe initialization process (AC: All)
  - [x] 3.1: Create atomic database creation (prevent partial initialization)
  - [x] 3.2: Implement rollback mechanism if initialization fails
  - [x] 3.3: Add validation checks after DB creation
  - [x] 3.4: Create initial backup snapshot after successful init
  - [x] 3.5: Log initialization success/failure with actionable errors
  
- [x] Task 4: Integration with plugin lifecycle (AC: All)
  - [x] 4.1: Hook database initialization into plugin activation
  - [x] 4.2: Handle initialization errors gracefully (degraded mode)
  - [x] 4.3: Ensure initialization completes within 1 second SLA
  - [x] 4.4: Add initialization metrics to telemetry

## Dev Notes

### Architecture Compliance

**Component:** Vector Store Adapter (`src/vector/`)

**Database Path Resolution:**
- Primary path: `.opencode/ruvector_memory.db` (relative to project root)
- Project root determination: Use project detection heuristic from architecture
  - Priority order: Explicit `.opencode/` → Git root → Workspace root → Global fallback
- Path must be absolute when passed to RuVector

**RuVector Integration:**
```typescript
// Use @ruvector/core for vector database operations
import { VectorDb } from '@ruvector/core';

// Initialize with default configuration
const db = new VectorDb({
  path: resolvedDbPath,
  dimensions: 384,  // all-MiniLM-L6-v2 default
  indexType: 'hnsw',
  metric: 'cosine'
});
```

**Default Configuration Values** (from Architecture → Configuration section):
```typescript
interface DefaultConfig {
  vector: {
    dimensions: 384;           // all-MiniLM-L6-v2 embedding size
    similarityThreshold: 0.75; // Minimum relevance score
    indexType: 'hnsw';         // Hierarchical Navigable Small World
    metric: 'cosine';          // Distance metric for similarity
  };
  cache: {
    enabled: true;
    maxEntries: 1000;          // LRU cache size (1.5MB RAM)
  };
  backup: {
    enabled: true;
    retentionDays: 7;          // Daily backups for 7 days
    retentionWeeks: 4;         // Weekly backups for 4 weeks
    retentionMonths: 12;       // Monthly backups for 12 months
  };
  learning: {
    feedbackWeight: 0.1;       // Impact of single feedback event
    importanceDecay: 0.95;     // Decay factor for unused memories
  };
}
```

**Error Handling Requirements:**
- Never throw from initialization functions
- Return `Result<VectorStore, InitError>` type pattern
- If initialization fails, enter degraded mode (plugin still loads)
- Log errors to `.opencode/logs/ruvector-memory.log`
- Provide actionable error messages (e.g., "Disk full", "Permission denied")

**Performance Requirements:**
- Database initialization must complete in <1 second (NFR3)
- First memory operation after init must complete in <2 seconds total
- Async initialization to avoid blocking plugin activation

### Integration with Story 1.1

Story 1.1 implemented the plugin activation mechanism. This story extends that by:

1. **Adding database initialization** to the activation sequence
2. **Implementing lazy initialization** (DB created on first use, not on plugin load)
3. **Connecting to plugin lifecycle** hooks established in Story 1.1

**From Story 1.1 Implementation:**
```typescript
// src/core/plugin.ts established:
export function activatePlugin(context: ExtensionContext): void {
  // 1. Load configuration
  // 2. Initialize logger
  // 3. Validate Node.js version
  // 4. Register tool stubs
  // → NEW: 5. Initialize database on first tool invocation
}
```

**Integration Point:**
The database initialization should be **lazy** (triggered on first memory operation) to keep plugin activation fast (<1s requirement). Use a singleton pattern to ensure DB is initialized exactly once.

### Project Structure Notes

**File Organization:**
```
src/
├── vector/
│   ├── index.ts               # Public exports
│   ├── vector-store.ts        # VectorStore class with init logic
│   ├── initialization.ts      # First-run DB creation
│   └── defaults.ts            # Default configuration constants
├── config/
│   ├── defaults.ts            # Shared default values
│   └── config-schema.ts       # Zod schemas for validation
└── shared/
    ├── types.ts               # Common type definitions
    └── errors.ts              # Error types (InitError, etc.)
```

**Naming Conventions** (from Architecture → Implementation Patterns):
- Internal functions: `camelCase` (e.g., `initializeDatabase`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_VECTOR_DIMENSIONS`)
- Types/Interfaces: `PascalCase` (e.g., `VectorStore`, `InitError`)
- Files: `kebab-case.ts` (e.g., `vector-store.ts`)

### Testing Requirements

**Unit Tests:**
```typescript
// tests/unit/vector/initialization.test.ts
describe('Database Initialization', () => {
  it('creates .opencode directory if missing', async () => {});
  it('initializes database with default configuration', async () => {});
  it('detects existing database and skips initialization', async () => {});
  it('handles initialization errors gracefully', async () => {});
  it('validates database after creation', async () => {});
});
```

**Integration Tests:**
```typescript
// tests/integration/first-run.test.ts
describe('First-Run Experience', () => {
  it('creates database on first memory_save operation', async () => {});
  it('reuses existing database on subsequent operations', async () => {});
  it('initialization completes within 1 second', async () => {});
});
```

**Performance Benchmarks:**
- Measure initialization time (target: <1s p99)
- Measure first operation after init (target: <2s total)
- Test with various project sizes (empty, small, large workspaces)

### References

**Source Documents:**
- [Architecture - Database Evolution Strategy](../planning-artifacts/architecture.md#database-evolution-strategy)
- [Architecture - Plugin Lifecycle Management](../planning-artifacts/architecture.md#plugin-lifecycle-management)
- [Architecture - Progressive Configuration](../planning-artifacts/architecture.md#progressive-configuration-zero-config--options)
- [PRD - FR4, FR39, FR40](../planning-artifacts/prd.md#functional-requirements)
- [Story 1.1 - Plugin Activation](./1-1-plugin-installation-and-automatic-activation.md)

**RuVector Documentation:**
- [RuVector Core API](../../docs/ruvector/core-api.md) - VectorDb initialization
- [RuVector Architecture](../../docs/ruvector/architecture.md) - Storage internals
- [RuVector Deployment](../../docs/ruvector/deployment.md) - Configuration patterns

### Security & Privacy Considerations

**Data Privacy:**
- All data stays local in `.opencode/` directory
- No network transmission during initialization
- Database file permissions: Owner read/write only (chmod 600)

**Secret Detection:**
- Not applicable for this story (save operations handled in Story 1.5)
- Database initialization does not process user content

### Observability

**Metrics to Track:**
```typescript
interface InitMetrics {
  initializationTime: number;       // milliseconds
  firstOperationTime: number;       // milliseconds (init + first op)
  databaseSize: number;             // bytes
  success: boolean;                 // true if init succeeded
  errorType?: string;               // if initialization failed
}
```

**Log Events:**
- `[INFO] Database initialization started`
- `[INFO] Database created at: .opencode/ruvector_memory.db`
- `[INFO] Applied default configuration: {dimensions: 384, threshold: 0.75, ...}`
- `[INFO] Database initialization completed in <time>ms`
- `[ERROR] Database initialization failed: <actionable-error>`

**Telemetry Integration:**
Write metrics to `.opencode/metrics.json` for CLI dashboard consumption.

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- `npm test` (Vitest + coverage): 38 tests passed, branch coverage 88.23%
- `npm run lint` (Biome): all checks passed
- `npx biome format --write src/core/plugin.ts src/vector/initialization.ts tests/unit/core/plugin.test.ts tests/unit/vector/initialization.test.ts tests/unit/vector/vector-store.test.ts tests/integration/first-run.test.ts`

### Completion Notes List

- Implemented `src/vector/initialization.ts` with first-run detection, `.opencode/` directory creation, atomic temp-file + rename flow, validation gates, rollback cleanup, actionable error mapping, and metrics emission.
- Implemented `src/vector/vector-store.ts` singleton adapter with lazy initialization semantics and predictable subsequent-call behavior.
- Added backup snapshot creation after successful initialization under `.opencode/.ruvector_backups/`.
- Integrated lazy first-operation initialization into plugin lifecycle via `initializeMemoryOnFirstOperation()` and degraded-mode transition on initialization failures.
- Updated runtime defaults and schema validation to include Story 1.2 required values (dimensions, threshold, feedback weighting, retention policies).
- Added/updated unit and integration tests covering first-run creation, reuse, SLA timing, error/degraded behavior, and initialization edge cases.
- Verified quality gates: tests and lint passed.

### File List

- `src/config/config-schema.ts`
- `src/config/defaults.ts`
- `src/core/plugin.ts`
- `src/shared/errors.ts`
- `src/shared/types.ts`
- `src/vector/defaults.ts`
- `src/vector/index.ts`
- `src/vector/initialization.ts`
- `src/vector/vector-store.ts`
- `tests/integration/first-run.test.ts`
- `tests/integration/plugin-activation.test.ts`
- `tests/unit/config/defaults.test.ts`
- `tests/unit/core/plugin.test.ts`
- `tests/unit/vector/initialization.test.ts`
- `tests/unit/vector/vector-store.test.ts`

## Change Log

- 2026-03-09: Implemented Story 1.2 end-to-end (first-run local DB initialization, safe defaults, rollback/backup/validation, plugin lazy integration, tests, and lint/test validation).
