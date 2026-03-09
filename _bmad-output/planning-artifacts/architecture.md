---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - docs/RUVECTOR_BASE_EXPLAIN.md
  - docs/ruvector/README.md
  - docs/ruvector/core-api.md
  - docs/ruvector/architecture.md
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-03-09'
project_name: 'ruvector-memory-opencode'
user_name: 'Alexander'
date: '2026-03-09'
---

# Architecture Decision Document — ruvector-memory-opencode

**Author:** Alexander  
**Date:** 2026-03-09  
**Project:** OpenCode RuVector Persistent Memory Plugin

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

The plugin provides 46 functional requirements organized into 8 capability areas:
- Memory capture and storage (FR1-6): Persistent semantic knowledge with vector embeddings
- Memory retrieval and semantic discovery (FR7-11): k-NN search with relevance ranking
- Learning and continuous improvement (FR12-18): Feedback-driven pattern refinement
- Project context auto-detection (FR19-24): Isolated memory per project with automatic identification
- Data portability and migration (FR25-30): Export/import in RuVector `.rvf` format
- Agent integration and tool injection (FR31-36): Automatic tool availability without boilerplate
- Installation and zero-configuration setup (FR37-42): Single command install with sensible defaults
- Advanced configuration (FR43-46): Optional power-user customization

**Non-Functional Requirements:**

26 NFRs across 5 quality categories establish strict performance and reliability expectations:
- **Performance**: memory_save <100ms p99, memory_search <300ms p99, plugin init <1 second
- **Security**: AES-256-GCM encryption, all data local, zero external transmission
- **Reliability**: Zero data loss, automatic daily backups, graceful degradation
- **Scalability**: Support 1M+ memories with <5% performance degradation
- **Integration**: Framework-agnostic portable memory format (`.rvf`)

**Scale & Complexity:**

- Primary domain: Developer Tool (TypeScript/Node.js plugin for OpenCode)
- Complexity level: Medium-High (distributed concerns without traditional client-server architecture)
- Project context: Brownfield — integrates with existing OpenCode ecosystem
- Estimated architectural components: 6-8 major subsystems
  - Plugin core (lifecycle, initialization)
  - RuVector adapter (vector operations wrapper)
  - Tool injector (OpenCode agent integration)
  - Learning engine (feedback loop processor)
  - Import/export subsystem (portability layer)
  - Configuration manager (optional customization)

### Technical Constraints & Dependencies

**Platform Requirements:**
- Node.js ≥18 (native bindings via NAPI-RS)
- TypeScript for type safety and IDE support
- RuVector (`@ruvector/core`) as core dependency for vector storage and HNSW indexing

**Integration Constraints:**
- Must integrate with OpenCode agent context system (tool injection mechanism)
- Zero-config philosophy: sensible defaults, automatic project detection
- Privacy-first: no network calls, all operations local

**Performance Boundaries:**
- Sub-100ms latency for memory operations (p50)
- Sub-2s initialization for plugin load and first memory operation
- Memory database size <100MB for 100K typical memories

**Format Compatibility:**
- `.rvf` format must be Git-versionable and portable across machines
- Export format must be framework-agnostic for future integrations

### Cross-Cutting Concerns Identified

1. **Error Handling & Graceful Degradation**: Memory failures must never block agent reasoning; system continues functioning with reduced capability
2. **Observability & Analytics**: Track memory hit rate, token savings, learning velocity for measurable success validation
3. **Transaction Safety**: All memory operations must be atomic with automatic recovery from crashes
4. **Asynchronous Operations**: Memory operations must be non-blocking to avoid delaying agent responses
5. **Extensibility**: Clean API boundaries for future integrations (Python SDK, LangChain/LlamaIndex, custom vectorizers)
6. **Data Lifecycle Management**: Automatic backups, archiving, pruning strategies to prevent unbounded growth
7. **Security Boundaries**: Prevent accidental leakage of credentials/secrets in captured memories
8. **Testing Strategy**: Comprehensive integration tests for OpenCode compatibility; performance benchmarks for SLA validation

---

## Starter Template Evaluation

### Research Summary

Evaluated current (2026) TypeScript starter templates and modern toolchain:

**Starter Templates Investigated:**
- **skydiver/typescript-starter** (Jan 2026): Modern stack with tsup + Vitest + Biome + pnpm + tsx. Clean build scripts, DTS generation, ESM-first. Updated actively.
- **muneebhashone/ts-easy** (Nov 2025): Minimalist starter with tsup + Biome + Zod for environment validation. 43 stars, MIT license.
- **Generic GitHub starters** (27+ repos): Primarily optimized for web apps, CLIs, or generic libraries — not agent plugins.

**Modern Toolchain Stack (Current Versions):**
- **tsup v8.5.1** (Nov 2025): Zero-config bundler powered by esbuild, 127k users, .d.ts generation, watch mode, multi-format output (ESM/CJS/IIFE)
- **Biome v2.4.6** (Jan 2026): Unified linter/formatter, 98k users, 35x faster than Prettier, 455+ rules, replaces ESLint+Prettier
- **Vitest v4.0.18** (Jan 2026): Jest-compatible testing framework, 559k users, Vite-powered, instant watch mode, native code coverage
- **pnpm**: Modern package manager with fast installs and efficient disk usage

### Recommendation: Manual Configuration with Modern Stack

**Decision:** Build custom project structure using modern 2026 toolchain (tsup + Biome + Vitest + pnpm) without starter template.

**Rationale:**

Generic TypeScript starters optimize for web applications, CLIs, or traditional libraries. The ruvector-memory-opencode plugin requires specialized patterns that don't map to generic templates:

1. **Tool Injection Architecture**: Must auto-register `memory_save`, `memory_search`, `memory_learn_from_feedback` tools into OpenCode agent context at runtime. Generic starters assume library export patterns, not agent integration hooks.

2. **Multi-Project Context Isolation**: Each project gets isolated `.opencode/ruvector_memory.db` with automatic detection. Starters don't address per-project state management patterns.

3. **Native Bindings Build Configuration**: RuVector uses NAPI-RS Rust bindings requiring specific peer dependencies and build steps. Generic starters don't configure native addon support.

4. **Plugin Lifecycle Hooks**: OpenCode plugin activation, deactivation, and agent coordination require custom initialization patterns not present in library starters.

5. **Architectural Flexibility**: Core decisions still pending (API design, component boundaries, data flow patterns). Manual setup allows optimal structure to emerge from architectural decisions rather than retrofitting starter assumptions.

**Adopted Best Practices from Research:**
- Use tsup for bundling with automatic .d.ts generation
- Adopt Biome for unified linting/formatting (replaces ESLint+Prettier)
- Use Vitest for testing with Jest-compatible API
- Configure pnpm workspaces if multi-package structure emerges
- ESM-first architecture with dual CJS/ESM exports for compatibility
- Strict TypeScript configuration for type safety

**Architectural Decisions Breakdown:**

| Decision Area | Choice | Rationale |
|---|---|---|
| **Language/Runtime** | TypeScript 5+ on Node.js ≥18 | Type safety for complex async operations; Node.js 18+ for NAPI-RS compatibility |
| **Bundling** | tsup v8.5+ | Zero-config DTS generation, ESM/CJS dual output, esbuild performance |
| **Linting/Formatting** | Biome v2.4+ | Unified tooling (35x faster than Prettier), 455+ rules, modern choice for 2026 |
| **Testing** | Vitest v4+ | Jest-compatible API, instant watch mode, native coverage, Vite ecosystem integration |
| **Package Manager** | pnpm | Fast installs, efficient disk usage, modern standard |
| **Module System** | ESM-first with CJS fallback | Future-proof (ESM default), backward compatibility (CJS for legacy projects) |
| **Project Structure** | Custom plugin architecture | Tool injection, multi-project isolation, native bindings — not served by generic starters |

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- ✅ Tool Injection API Interface: Hybrid progressive disclosure (simple defaults + rich options)
- ✅ Graceful Degradation: Warning mode with agent awareness
- ✅ Error Handling: Best effort pattern (never block agent, log failures)
- ✅ Component Boundaries: Modular architecture with 8 distinct subsystems
- ✅ Internal Communication: Factory pattern for simplicity without DI framework overhead
- ✅ Plugin Lifecycle: Hybrid preload with background init, async initialization
- ✅ Multi-Project Isolation: Hybrid heuristics (explicit .opencode > git root > workspace root)

**Important Decisions (Shape Architecture):**
- ✅ Memory Data Model: Rich schema with learning metadata (accessCount, feedbackScore, importance)
- ✅ Database Evolution: Automatic migrations with pre-migration backup
- ✅ Embedding Cache Strategy: LRU cache (1000 entries in-memory RAM)
- ✅ Backup Strategy: Git-style incremental with delta compression
- ✅ Secret Detection: Regex patterns + entropy analysis
- ✅ Data Privacy: Local-only storage (inherent privacy, no sanitization overhead)
- ✅ Access Control: Single-tenant per project (future: tag-based scope opt-in)
- ✅ Encryption: RuVector native (ENVELOPE_SEG, CRYPTO_SEG)
- ✅ Distribution: npm package (marketplace adoption in phase 2)
- ✅ Versioning: Semantic versioning with strict breaking-change discipline
- ✅ Configuration: Progressive disclosure pattern (works zero-config, comments show options)
- ✅ Observability: JSON metrics + CLI dashboard (`opencode memory stats`)

### Data Architecture

#### Memory Schema Definition

Rich schema with learning metadata (accessCount, feedbackScore, importance) enables continuous learning and analytics. Storage overhead justified by measurable improvements in memory hit rate and token savings.

```typescript
interface Memory {
  id: string;                        // UUID v4, globally unique
  content: string;                   // User-provided text (up to 8KB default)
  embedding: Float32Array;           // 384-dim vector (all-MiniLM model default)
  
  created_at: Date;
  updated_at: Date;
  accessed_at: Date;
  
  tags: string[];                    // User-defined labels
  projectContext: string;            // Auto-detected project identifier
  source: 'manual' | 'agent' | 'import';
  
  importance: number;                // 1-5 scale, refined by user feedback
  accessCount: number;               // Usage frequency
  feedbackScore: number;             // -1 to +1, signal for learning engine
  
  relatedIds: string[];              // IDs of semantically similar memories
  
  hasSecretPattern: boolean;         // Flag if regex detected potential secret
  requiresAttention: boolean;        // Flag for PII concerns or anomalies
}
```

#### Database Evolution Strategy

Automatic migration on startup with pre-migration backup. Breaking changes only in major versions. Code supports reading old schema for 1 full major version.

#### Embedding Cache Strategy

LRU cache with 1000 entries (~1.5MB RAM). Cache hits accelerate repetitive queries common in agent workflows. RuVector's internal HNSW index provides persistence-layer caching.

#### Backup Strategy (Git-Style Incremental)

```
.opencode/
├── ruvector_memory.db              # Active database
├── backups/
│   ├── 2026-03-09.rvf.backup       # Daily snapshots
│   ├── 2026-03-08.rvf.backup
│   └── ...
```

Retention policy: 7 daily, 4 weekly, 12 monthly. Delta compression reduces storage by ~80%. Triggers: first backup of day, pre-migration, manual CLI command.

### Authentication & Security

#### Secret Detection Strategy

Regex patterns (20+ templates) + entropy analysis (threshold >4.5 bits/char). Detection sets flag `memory.hasSecretPattern = true` and logs to `.opencode/logs/security.log`. Memory still saved (user may have validating context). Flag exposed via `memory_info()` tool for agent awareness.

**Pattern Coverage:**
- API keys (OpenAI, Anthropic, etc.)
- OAuth tokens
- AWS credentials (IAM keys, session tokens)
- GitHub PATs
- Stripe & payment processor tokens
- Database passwords

#### Data Privacy & Local-Only Storage

All data persists only in `.opencode/` directory. Zero network transmission. Encryption at rest via RuVector ENVELOPE_SEG native segment.

No PII sanitization: data 100% local → inherent privacy. Sanitization adds latency and false positives. Users educated via documentation: "memories are local and permanent; don't save credentials or PII."

#### Access Control Model

Single-tenant architecture per project. All agents in a project share memory pool. No per-agent isolation (MVP simplicity).

Future enhancement (Phase 2): Tag-based scope with role-based access control.

#### Encryption at Rest

RuVector native ENVELOPE_SEG with CRYPTO_SEG key material (Ed25519 + ML-DSA-65). Key derivation from machine ID + workspace hash. Zero custom crypto code. Optional user key for high-security environments (config file).

### API & Communication Patterns

#### Tool Injection Interface (Progressive Disclosure)

**Level 1: Simple Default**
```typescript
memory_save("I just learned X");
memory_search("Find memories about Y");
memory_learn_from_feedback("That was confusing");
```

**Level 2: Rich Metadata (Power Users)**
```typescript
memory_save({
  content: "...",
  tags: ["type", "concept"],
  importance: 5,
  source: "documentation"
});

memory_search({
  query: "...",
  limit: 10,
  minRelevance: 0.85,
  filters: { tags: ["typescript"], createdAfter: Date }
});

memory_learn_from_feedback({
  memory_id: "mem-xyz",
  feedback_type: "positive",
  feedback: "Very useful",
  context: "..."
});
```

Implementation: union types allow parameter overloading. API infers capability from input type.

#### Graceful Degradation Strategy

Early detection of RuVector failures. If init fails: system enters degraded mode. Tools return warning responses with agent-actionable error messages. Agent can fallback to local context learning or skip memory operations. Logging enables post-mortem debugging.

#### Error Handling Pattern

Best effort + telemetry. Never throw from tools (agents depend on continued function). Retry transient failures (3 attempts, exponential backoff). Log all errors to `.opencode/logs/ruvector-memory.log`. Return structured error responses.

Transient errors: DB locked, too many open files, network resets. Hard failures trigger degraded mode.

### Component Architecture

#### Modular Subsystem Design

```
src/
├── core/           # Lifecycle and activation
├── vector/         # RuVector adapter + caching
├── tools/          # OpenCode integration
├── learning/       # Feedback-driven improvement
├── import-export/  # .rvf portability
├── config/         # Configuration management
├── detection/      # Project context auto-detection
├── security/       # Secret detection and audit
└── shared/         # Utilities and types
```

Clear separation of concerns. Each subsystem has single responsibility. Modular boundaries enable independent testing and future SDK extensions (Python, Go).

#### Internal Communication Pattern

Factory pattern for simplicity without DI framework overhead. Subsystems composed in dependency order during plugin activation. Pure functions for tool implementations. Easy to test (mock dependencies), easy to understand (explicit data flow).

#### Plugin Lifecycle Management

**Initialization Sequence:**
1. Synchronous: Load config, validate schema, initialize logger, register tool stubs
2. Async parallel: Open vector DB, pre-load top 100 memories, verify NAPI-RS, detect project context
3. Non-blocking: Preload runs in background; timeout prevents hung init
4. Deactivation: Flush writes, close handles, archive metrics

#### Multi-Project Context Isolation

Detection heuristic (priority order):
1. Explicit `.opencode/` config path (user override)
2. Git repository root (monorepo support)
3. OpenCode workspace root (multi-root support)
4. Global fallback `~/.opencode/ruvector_memory_global.db`

Supports multiple workflows: monorepo (one memory per branch), VSCode multi-root (isolated per folder), enterprise (user override).

### Infrastructure & Deployment

#### Distribution Strategy

**Phase 1 (MVP):** npm package (`@ruvector/opencode-memory`)  
**Phase 2 (Post-MVP):** OpenCode marketplace with auto-update

Installation: `npm install @ruvector/opencode-memory`  
Engines: Node.js ≥18.0.0  
Peer dependency: `@ruvector/core` ^0.88.0

#### Semantic Versioning Discipline

```
@ruvector/opencode-memory@X.Y.Z

X = Major (breaking changes only)
Y = Minor (backward-compatible features)
Z = Patch (bugfixes, performance)
```

Commitment: No breaking API or schema changes in minor updates. Safe to upgrade without testing.

#### Progressive Configuration (Zero-Config + Options)

Works out-of-box without `.opencode/ruvector_memory_config.yaml` file. Users can override selectively. Comments document power-user options without overwhelming defaults.

```yaml
memory:
  enabled: true
  # db_path: auto-detect
  # cache_size: 1000
  # backup_retention_days: 7
```

#### Observability: JSON Logs + CLI Dashboard

Metrics file (`.opencode/metrics.json`) tracks:
- Memory operations (saves, searches, cache hits)
- Learning signals (feedback events, iterations)
- Efficiency gains (token savings, average relevance)
- Performance (latency p50, p99 vs SLAs)

CLI dashboard command: `opencode memory stats` — displays hit rate, token savings, learning velocity, SLA status.

### Decision Impact Analysis

#### Implementation Sequence (Dependency Order)

**Week 1: Foundation**
- Core plugin lifecycle, logger, error handling, config loader

**Week 2: Data Layer**
- VectorStore adapter, memory schema, migrations, database initialization

**Week 2-3: Tool API**
- Tool injection framework, memory_save/search implementations

**Week 3: Learning System**
- memory_learn_from_feedback tool, LearningEngine, importance scoring

**Week 3-4: Robustness**
- Secret detection, graceful degradation, error handling

**Week 4: Portability**
- Import/export (.rvf), project detection, multi-project isolation

**Week 4: Observability**
- Metrics collection, CLI dashboard, performance telemetry

#### Cross-Component Dependencies

Vector store must initialize before tools can register. Tools must be registered before learning engine processes feedback. Config loader runs before vector store. Security detection runs in memory_save (no dependencies). Project detection runs during init before creating DBs.

#### Key Success Metrics (SLA Validation)

| Metric | Target | Component | Validation |
|--------|--------|-----------|-----------|
| memory_save p99 | <100ms | VectorStore + cache | Perf benchmarks |
| memory_search p99 | <300ms | Embedding cache + kNN | Perf benchmarks |
| plugin init | <1s | Preload + async init | Activation time |
| zero data loss | 100% | Backup + WAL | Crash recovery tests |
| no secrets leaked | 0% false neg | Secret detector | Security suite |
| learning velocity | Measurable | Learning engine | Integration tests |

---

## Implementation Patterns & Consistency Rules

### Critical Conflict Points Identified

8 areas where AI agents could make different choices that cause integration failures:

1. **Naming conventions** — tool names, function names, variable names, config keys
2. **Tool response format** — success/error structure, data payload format
3. **Error handling** — exception types, error codes, error logging
4. **File organization** — where to place components, tests, configs
5. **Logging format** — structured vs. unstructured, what fields to include
6. **Type definitions** — where types live, naming conventions
7. **Configuration structure** — YAML nesting, key naming
8. **Module exports** — what's public API vs. internal implementation

### Naming Patterns

#### Tools & Functions (camelCase + descriptive)

**Tool functions (exposed to OpenCode agents):**
```typescript
// ✅ Correct — snake_case for OpenCode tools
memory_save(input: MemorySaveInput): Promise<ToolResponse<SaveResult>>
memory_search(input: MemorySearchInput): Promise<ToolResponse<SearchResult>>
memory_learn_from_feedback(input: FeedbackInput): Promise<ToolResponse<LearnResult>>
```

**Internal functions (TypeScript camelCase):**
```typescript
// ✅ Correct
initializeMemorySystem(): Promise<void>
createVectorStore(config: Config): VectorStore
normalizeInput(input: unknown): NormalizedInput

// ❌ Avoid
memorySave()          // Don't mix snake and camel
SaveMemory()          // Don't use PascalCase for functions
_privateFunction()    // Use private keyword instead
```

**Rationale:** Tools exposed to OpenCode use snake_case (OpenCode standard). Internal TypeScript functions use camelCase (standard TypeScript convention).

#### Types & Interfaces (PascalCase)

```typescript
// ✅ Correct
interface Memory { }
interface ToolResponse<T> { }
type MemorySaveInput = string | MemorySaveOptions;
enum FeedbackType { POSITIVE, NEGATIVE, CORRECTION }

// ❌ Avoid
interface memory { }          // camelCase
type memory_save_input = ...; // snake_case
class IMemory { }             // Hungarian prefix
```

#### Variables (camelCase)

```typescript
// ✅ Correct
const vectorStore = new VectorStore();
const memoryId = "mem-123";
const cacheSize = 1000;

// ❌ Avoid
const VectorStore = ...       // PascalCase
const memory_id = ...         // snake_case
const CACHE_SIZE = 1000;      // SHOUTING_SNAKE (reserved for true constants)
```

#### Configuration Keys (snake_case)

```yaml
# .opencode/ruvector_memory_config.yaml
# ✅ Correct
memory:
  enabled: true
  db_path: .opencode/ruvector_memory.db
  cache_size: 1000
  backup_retention_days: 7

# ❌ Avoid
cacheSize: 1000               # camelCase
DBPath: ...                   # PascalCase
max-content-length: 8192      # kebab-case
```

### Tool Interface Format (Unified)

**All tools return consistent response structure:**

```typescript
// ✅ Correct — Unified format
type ToolResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: string; reason?: string; code?: string }

// Example: memory_save success
{
  success: true,
  data: { id: "mem-123", created_at: "2026-03-09T..." }
}

// Example: memory_search success
{
  success: true,
  data: [
    { id: "mem-1", content: "...", relevance: 0.94 },
    { id: "mem-2", content: "...", relevance: 0.87 }
  ]
}

// Example: Error response
{
  success: false,
  error: "Memory system temporarily unavailable",
  reason: "Vector database initialization failed",
  code: "ENOTREADY"
}
```

**Constraint:** Never throw from tool implementations. Always return structured response.

**Rationale:** Agents expect consistent handling. Single response shape enables predictable error handling. Boolean `success` flag makes status unambiguous.

### File & Directory Structure

**Subsystem organization with clear boundaries:**

```
src/
├── core/
│   ├── index.ts               # Public API: { activatePlugin }
│   ├── plugin.ts              # Main activation logic
│   └── lifecycle.ts           # Deactivation, cleanup
├── vector/
│   ├── index.ts               # Public API: { VectorStore }
│   ├── vector-store.ts        # Main NAPI-RS wrapper
│   ├── embedding-cache.ts     # LRU cache
│   └── migrations.ts          # Schema evolution
├── tools/
│   ├── index.ts               # Public API: { injectTools }
│   ├── tool-injector.ts       # Registration into OpenCode context
│   ├── memory-save-tool.ts    # Impl of memory_save
│   ├── memory-search-tool.ts  # Impl of memory_search
│   └── memory-learn-tool.ts   # Impl of memory_learn_from_feedback
├── learning/
│   ├── index.ts
│   ├── learning-engine.ts     # Feedback processor
│   ├── feedback-processor.ts  # Handler for feedback types
│   └── importance-scorer.ts   # Adjust importance by feedback
├── import-export/
│   ├── index.ts
│   ├── rvf-exporter.ts        # Export to .rvf format
│   ├── rvf-importer.ts        # Import from .rvf
│   └── format-validator.ts    # Validate .rvf structure
├── config/
│   ├── index.ts
│   ├── config-schema.ts       # Zod validation schema
│   ├── defaults.ts            # Default values
│   └── env-loader.ts          # Environment variable support
├── detection/
│   ├── index.ts
│   ├── project-detector.ts    # Find project context
│   ├── context-manager.ts     # Manage per-project DBs
│   └── db-locator.ts          # Resolve .opencode path
├── security/
│   ├── index.ts
│   ├── secret-detector.ts     # Regex + entropy analysis
│   ├── audit-logger.ts        # Security event logging
│   └── access-control.ts      # Future: RBAC placeholder
├── shared/
│   ├── logger.ts              # Singleton Logger instance
│   ├── types.ts               # All public TypeScript interfaces
│   ├── errors.ts              # Custom Error classes
│   └── utils.ts               # Helpers (UUID, entropy, etc)
└── index.ts                   # Package public API

tests/
├── unit/
│   ├── vector/                # Tests for src/vector
│   ├── tools/                 # Tests for src/tools
│   ├── learning/              # Tests for src/learning
│   └── ...                    # Mirror src/ structure
└── integration/
    └── open-code-integration.test.ts
```

**Key Rules:**
- Each subsystem has `index.ts` exporting public API
- Tests mirror source structure (parallel hierarchy)
- `shared/` contains cross-cutting utilities
- Single package `index.ts` for public re-exports

### Error Handling & Logging

**Error class hierarchy:**

```typescript
// ✅ Correct — Custom error classes
export class RuVectorMemoryError extends Error {
  code: string;
  statusCode: number = 500;
  
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
  }
}

export class DatabaseInitializationError extends RuVectorMemoryError {
  statusCode = 503;  // Service Unavailable
  constructor(message: string) { super(message, 'ENOTREADY'); }
}

export class ValidationError extends RuVectorMemoryError {
  statusCode = 400;  // Bad Request
  constructor(message: string) { super(message, 'EINVALID'); }
}

export class SecretDetectedError extends RuVectorMemoryError {
  statusCode = 400;
  constructor(patterns: string[]) {
    super(`Secrets detected: ${patterns.join(', ')}`, 'ESECRET');
  }
}
```

**Structured logging format:**

```typescript
// ✅ Correct — Structured with object payload
logger.info('memory_saved', {
  memoryId: 'mem-123',
  contentLength: 256,
  tags: ['typescript', 'design'],
  duration_ms: 45
});

logger.warn('secret_detected', {
  memoryId: 'mem-456',
  patterns: ['api_key', 'github_pat'],
  severity: 'warn'
});

logger.error('memory_save_failed', {
  error: error.message,
  code: error.code || 'EUNKNOWN',
  memoryId: 'mem-789',
  duration_ms: 250
});

// ❌ Avoid
logger.info("Saved memory 123");                    // Unstructured
console.log("Memory saved, time: 45ms");           // No context
logger.debug(`Details: ${JSON.stringify({...})}`); // Stringified
```

### Type Definitions (Centralized)

**All public types in `shared/types.ts`:**

```typescript
// ✅ Correct — Single source of truth
export interface Memory {
  id: string;
  content: string;
  embedding: Float32Array;
  // ... full definition
}

export interface MemorySaveInput {
  content: string;
  tags?: string[];
  importance?: number;
  source?: 'manual' | 'agent' | 'import';
}

export type ToolResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: string; reason?: string; code?: string };

export enum FeedbackType {
  POSITIVE = 'positive',
  NEGATIVE = 'negative',
  CORRECTION = 'correction'
}
```

**Type naming conventions:**
- Use `interface` for object structures
- Use `type` for unions or function signatures
- Use `enum` for constants with a closed set of values
- PascalCase always

### Configuration Structure (YAML)

**Single root with nested sections:**

```yaml
# .opencode/ruvector_memory_config.yaml
# ✅ Correct
memory:
  enabled: true
  
  storage:
    db_path: .opencode/ruvector_memory.db
    backup_retention_days: 7
    max_database_size_mb: 100
  
  performance:
    cache_size: 1000
    max_content_length: 8192
    embedding_model: all-MiniLM-L6-v2
  
  security:
    detect_secrets: true
    encryption: false
  
  logging:
    level: info
    output: .opencode/logs/ruvector-memory.log
```

**Schema validation (always use Zod):**

```typescript
// ✅ Correct
import { z } from 'zod';

const MemoryConfigSchema = z.object({
  memory: z.object({
    enabled: z.boolean().default(true),
    storage: z.object({
      db_path: z.string().default('.opencode/ruvector_memory.db'),
      backup_retention_days: z.number().min(1).default(7),
      max_database_size_mb: z.number().min(10).default(100)
    }),
    performance: z.object({
      cache_size: z.number().min(100).default(1000),
      max_content_length: z.number().min(256).default(8192),
      embedding_model: z.string().default('all-MiniLM-L6-v2')
    }),
    security: z.object({
      detect_secrets: z.boolean().default(true),
      encryption: z.boolean().default(false)
    }),
    logging: z.object({
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
      output: z.string().default('.opencode/logs/ruvector-memory.log')
    })
  })
});

type Config = z.infer<typeof MemoryConfigSchema>;
const config = MemoryConfigSchema.parse(loadedYaml);
```

### Module Exports (Public API Surfaces)

**Each subsystem defines public API in `index.ts`:**

```typescript
// src/core/index.ts
// ✅ Correct — Explicit public API
export { activatePlugin } from './plugin';
export type { PluginActivationContext, PluginDeactivationContext } from '../shared/types';

// src/vector/index.ts
export { VectorStore } from './vector-store';
export type { Memory, VectorStoreOptions } from '../shared/types';

// src/tools/index.ts
export { injectTools } from './tool-injector';
export type { ToolResponse, MemorySaveInput } from '../shared/types';

// src/index.ts — Package public API
export { activatePlugin } from './core';
export type { /* All public types */ } from './shared/types';

// ❌ Avoid
export * from './vector-store';              // Star imports hide real API
export * as internal from '../config';       // Exposing internals
const VectorStore = require('./impl/store');  // Deep paths, CommonJS
```

**Rules:**
- Only export from subsystem `index.ts` files
- Don't import from internal modules (use exports from `index.ts`)
- Don't export private implementation details
- Always export types alongside implementations

---

## Enforcement Guidelines

### All AI Agents MUST:

1. **Follow naming conventions exactly:**
   - Tools: snake_case (`memory_save`, `memory_search`)
   - Functions: camelCase (`initializeVectorStore`, `normalizeInput`)
   - Types: PascalCase (`Memory`, `ToolResponse`)
   - Config keys: snake_case (`db_path`, `cache_size`)
   - Variables: camelCase (`memoryId`, `vectorStore`)

2. **Use unified tool response format:**
   - All tools return `{ success: boolean; data?: T; error?: string; code?: string }`
   - Never throw from tool implementations
   - Include error code for programmatic handling

3. **Organize by subsystem:**
   - One subsystem per directory (core/, vector/, tools/, etc.)
   - Public API in `index.ts` of each subsystem
   - Tests parallel source structure
   - No circular dependencies between subsystems

4. **Use structured logging always:**
   - `logger.info/warn/error(eventName, objectPayload)`
   - Include contextual fields (memoryId, duration_ms, error code, etc.)
   - Never log raw strings without structure

5. **Define types centrally:**
   - All public types in `shared/types.ts`
   - Validate configs with Zod schemas
   - Use interface for structures, type for unions
   - No duplicate type definitions

6. **Validate all inputs:**
   - Use Zod for config validation on startup
   - Validate tool input parameters
   - Return ValidationError with helpful messages

7. **Use custom error classes:**
   - Extend `RuVectorMemoryError`
   - Include proper error code (ENOTREADY, EINVALID, etc.)
   - Provide context in messages for debugging

8. **Respect module boundaries:**
   - Only import from subsystem `index.ts` files
   - Don't access internal modules directly
   - Don't export internal implementation details

### Pattern Compliance Checklist

Before committing code, verify:

- [ ] All new functions follow naming convention
- [ ] All tools return unified response format
- [ ] All new types defined in `shared/types.ts`
- [ ] All config reads use Zod validation
- [ ] All errors use custom error classes with codes
- [ ] All logging uses structured format with payloads
- [ ] New subsystems have `index.ts` with public API documented
- [ ] Tests mirror source structure (parallel hierarchy)
- [ ] Module imports only from `index.ts` files
- [ ] No circular dependencies between subsystems

---

## Project Structure & Boundaries

### Complete Project Directory Structure

```
ruvector-memory-opencode/
│
├── 📄 ROOT CONFIGURATION FILES
├── package.json                    # npm/pnpm manifest with deps, scripts
├── pnpm-lock.yaml                  # Lock file
├── tsconfig.json                   # TypeScript strict mode config
├── biome.json                      # Biome linter + formatter config
├── vitest.config.ts                # Test runner configuration
├── BUILD.md                        # Build instructions (tsup)
│
├── 📂 src/
│   │
│   ├── 📂 core/                    # Plugin lifecycle & activation
│   │   ├── index.ts                # ✅ Public API: { activatePlugin }
│   │   ├── plugin.ts               # Main activation + deactivation
│   │   ├── lifecycle.ts            # Hooks for OpenCode integration
│   │   └── types.ts                # (internal only, use shared/types)
│   │
│   ├── 📂 vector/                  # RuVector adapter layer
│   │   ├── index.ts                # ✅ Public API: { VectorStore }
│   │   ├── vector-store.ts         # Main NAPI-RS @ruvector/core wrapper
│   │   ├── embedding-cache.ts      # LRU cache (1000 entries in-memory)
│   │   ├── migrations.ts           # Auto-migrate Memory schema on upgrades
│   │   └── types.ts                # (internal only)
│   │
│   ├── 📂 tools/                   # OpenCode agent tool integration
│   │   ├── index.ts                # ✅ Public API: { injectTools }
│   │   ├── tool-injector.ts        # Register tools into OpenCode context
│   │   ├── memory-save-tool.ts     # Impl: memory_save(input)
│   │   ├── memory-search-tool.ts   # Impl: memory_search(input)
│   │   ├── memory-learn-tool.ts    # Impl: memory_learn_from_feedback()
│   │   └── tool-response-builder.ts # Shared response formatting
│   │
│   ├── 📂 learning/                # Feedback-driven learning engine
│   │   ├── index.ts                # ✅ Public API: { LearningEngine }
│   │   ├── learning-engine.ts      # Main orchestrator
│   │   ├── feedback-processor.ts   # Handle feedback_type: positive|negative|correction
│   │   ├── importance-scorer.ts    # Adjust memory.importance based on feedback
│   │   └── metrics-tracker.ts      # Track learning velocity
│   │
│   ├── 📂 import-export/           # .rvf format handling
│   │   ├── index.ts                # ✅ Public API: { exportMemories, importMemories }
│   │   ├── rvf-exporter.ts         # Export memories to .rvf file
│   │   ├── rvf-importer.ts         # Import from .rvf, validate structure
│   │   └── format-validator.ts     # Validate .rvf schema
│   │
│   ├── 📂 config/                  # Configuration management
│   │   ├── index.ts                # ✅ Public API: { loadConfig }
│   │   ├── config-schema.ts        # Zod validation schema (runtime)
│   │   ├── defaults.ts             # Default config values
│   │   └── env-loader.ts           # Support env vars (e.g., RUVECTOR_MEMORY_ENABLED)
│   │
│   ├── 📂 detection/               # Project context auto-detection
│   │   ├── index.ts                # ✅ Public API: { detectProjectContext }
│   │   ├── project-detector.ts     # Find git root / workspace / explicit .opencode
│   │   ├── context-manager.ts      # Create per-project database references
│   │   └── db-locator.ts           # Resolve final path: .opencode/ruvector_memory.db
│   │
│   ├── 📂 security/                # Secret detection & audit logging
│   │   ├── index.ts                # ✅ Public API: { detectSecrets, auditLog }
│   │   ├── secret-detector.ts      # Regex patterns + entropy analysis
│   │   ├── audit-logger.ts         # Security event logging
│   │   └── access-control.ts       # (Future: RBAC placeholder)
│   │
│   ├── 📂 shared/                  # Cross-cutting utilities
│   │   ├── types.ts                # 📌 All public TypeScript interfaces
│   │   │                            # (Memory, ToolResponse, Config, etc.)
│   │   ├── errors.ts               # Custom Error hierarchy
│   │   │                            # RuVectorMemoryError, DatabaseInitError, etc.
│   │   ├── logger.ts               # Singleton Logger (structured logging)
│   │   └── utils.ts                # Helpers (uuid, entropy, date utils, etc.)
│   │
│   └── index.ts                    # 📌 Package public entry point
│                                    # Re-exports: activatePlugin, types
│
├── 📂 tests/
│   │
│   ├── 📂 unit/
│   │   ├── vector/
│   │   │   ├── vector-store.test.ts
│   │   │   ├── embedding-cache.test.ts
│   │   │   └── migrations.test.ts
│   │   ├── tools/
│   │   │   ├── memory-save-tool.test.ts
│   │   │   ├── memory-search-tool.test.ts
│   │   │   └── memory-learn-tool.test.ts
│   │   ├── learning/
│   │   │   ├── feedback-processor.test.ts
│   │   │   └── importance-scorer.test.ts
│   │   ├── config/
│   │   │   ├── config-schema.test.ts
│   │   │   └── config-loader.test.ts
│   │   ├── detection/
│   │   │   ├── project-detector.test.ts
│   │   │   └── db-locator.test.ts
│   │   ├── security/
│   │   │   └── secret-detector.test.ts
│   │   └── shared/
│   │       └── utils.test.ts
│   │
│   ├── 📂 integration/
│   │   ├── open-code-integration.test.ts  # End-to-end tool injection + agent sim
│   │   ├── full-workflow.test.ts          # Save → Search → Learn → Check relevance
│   │   └── multi-project-isolation.test.ts # Verify .opencode path separation
│   │
│   ├── fixtures/
│   │   ├── sample-memories.ts      # Test data
│   │   ├── mock-vector-store.ts    # Mock RuVector for testing
│   │   └── mock-logger.ts          # Capture logs in tests
│   │
│   └── vitest.setup.ts             # Global test setup
│
├── 📂 dist/                        # Build output (generated, .gitignored)
│   ├── index.js                    # CJS + ESM dual exports
│   ├── index.mjs
│   ├── index.d.ts                  # TypeScript declaration
│   └── ...
│
├── 📂 docs/
│   ├── INSTALLATION.md             # Installation instructions
│   ├── API.md                       # Tool API documentation
│   ├── ARCHITECTURE.md             # This architecture document
│   ├── CONTRIBUTING.md             # Developer guide
│   ├── TRAINING.md                 # Learning engine mechanics
│   └── examples/
│       ├── basic-usage.ts          # memory_save + memory_search
│       ├── with-feedback.ts        # Full learning flow
│       └── multi-project.ts        # Multi-project context handling
│
├── 📂 .github/
│   ├── workflows/
│   │   ├── ci.yml                  # Lint, test, build, coverage
│   │   ├── release.yml             # npm publish on tags
│   │   └── docs-publish.yml        # Publish docs on main
│   └── ISSUE_TEMPLATE/
│       ├── bug.yml
│       └── feature.yml
│
├── 📂 .opencode/
│   ├── config.yaml                 # User-facing plugin config (example)
│   ├── ruvector_memory.db           # Runtime: created by plugin
│   ├── logs/
│   │   └── ruvector-memory.log     # Runtime: plugin logs
│   ├── backups/
│   │   ├── 2026-03-09.rvf.backup   # Runtime: daily snapshots
│   │   └── .metadata.json          # Runtime: backup index
│   └── metrics.json                # Runtime: hit rate, token savings
│
├── 📄 .gitignore
├── 📄 .env.example                 # Sample env vars (RUVECTOR_MEMORY_ENABLED, etc.)
├── 📄 LICENSE                      # MIT
└── README.md                       # Project overview
```

### Architectural Boundaries

#### Subsystem Dependencies (Acyclic)

Load order (implementation sequence):
1. `shared/` — foundation (types, errors, logger, utils)
2. `config/` — configuration loading + validation
3. `vector/` — RuVector wrapper + caching
4. `detection/` — project context detection
5. `security/` — secret detection
6. `core/` — plugin activation lifecycle
7. `tools/` — OpenCode tool injection
8. `learning/` — feedback processing
9. `import-export/` — .rvf format handling

**No circular dependencies:** Every subsystem only imports from lower-level subsystems via `index.ts` files.

#### Tool API Boundary

Only these functions exposed to OpenCode agents:
- `memory_save(input: MemorySaveInput | string)`
- `memory_search(input: MemorySearchInput | string)`
- `memory_learn_from_feedback(input: FeedbackInput | string)`

All internal subsystems are NOT exposed to agents.

#### Storage Boundary

All data persists in `.opencode/` directory only:
- `ruvector_memory.db` — active vector database
- `config.yaml` — user configuration
- `logs/` — structured logs
- `backups/` — incremental snapshots
- `metrics.json` — performance telemetry

Zero network transmission (all local).

### Requirements-to-Structure Mapping

| Functional Requirements | Component | Key Files |
|---|---|---|
| FR1-6: Save & store | vector/, security/ | vector-store.ts, secret-detector.ts |
| FR7-11: Retrieve & search | vector/ | vector-store.ts, embedding-cache.ts |
| FR12-18: Learning | learning/ | learning-engine.ts, feedback-processor.ts |
| FR19-24: Auto-detect context | detection/ | project-detector.ts, db-locator.ts |
| FR25-30: Data portability | import-export/ | rvf-exporter.ts, rvf-importer.ts |
| FR31-36: Agent tools | tools/, core/ | tool-injector.ts, memory-*-tool.ts |
| FR37-42: Zero-config setup | config/ | config-schema.ts, defaults.ts |
| FR43-46: Advanced config | config/ | config-schema.ts, env-loader.ts |

| Non-Functional Requirements | Component | Validation Method |
|---|---|---|
| <100ms memory_save p99 | vector/ | Vitest perf benchmarks |
| <300ms memory_search p99 | vector/ | Vitest kNN + cache benchmarks |
| <1s plugin init | core/, detection/ | Integration test timing |
| Zero data loss | vector/ | Crash recovery tests |
| AES-256-GCM encryption | (RuVector native) | Verify .rvf ENVELOPE_SEG |
| Daily backups | vector/ | Backup strategy tests |

### Component Communication Patterns

**Save Flow (FR1-6):**
```
Agent → memory_save() → secret-detector → vector-store → embedding-cache → RuVector
                                                                ↓
                                                        (async) learning-engine
```

**Search Flow (FR7-11):**
```
Agent → memory_search() → embedding-cache (LRU hit?) → vector-store → RuVector HNSW
                               ↓
                          logger (metrics)
```

**Learning Flow (FR12-18):**
```
Agent → memory_learn_from_feedback() → feedback-processor → importance-scorer → vector-store
```

**Project Detection (FR19-24):**
```
Plugin activation → project-detector → (git root / workspace / explicit .opencode)
                       ↓
                  context-manager → database reference
```

### Development Workflow

**For implementing features:**
1. Define types in `src/shared/types.ts`
2. Add config keys in `src/config/config-schema.ts`
3. Implement logic in appropriate subsystem
4. Write tests in `tests/unit/{subsystem}/`
5. Add integration test to `tests/integration/`
6. Update documentation in `docs/`

**For running tests:**
```bash
npm run test                    # All tests
npm run test:watch             # Watch mode
npm run test:coverage          # With coverage report
npm run test:integration       # Multi-component tests only
```

**For building & publishing:**
```bash
npm run lint                   # Biome checks
npm run build                  # tsup → dist/
npm run release                # SemVer bump + npm publish
```

---

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:**
- All selected technologies are compatible: TypeScript 5+, Node.js >=18, tsup, Biome, Vitest, pnpm, and `@ruvector/core`.
- No version conflicts detected across build, lint, test, and runtime stack.
- ESM-first + CJS fallback is consistent with bundling decisions.
- No contradictory architectural decisions identified.

**Pattern Consistency:**
- Implementation patterns directly support architecture choices.
- Naming conventions are coherent across tools, code, config, and types.
- Response/error/logging formats are standardized for all tool handlers.
- Structure and boundary patterns align with the modular subsystem model.

**Structure Alignment:**
- Project tree supports all subsystems and responsibilities from prior decisions.
- Component boundaries are explicit and enforceable via index-based exports.
- Integration points are clearly defined between core, tools, vector, learning, and config.
- Test structure mirrors source boundaries and supports consistency validation.

### Requirements Coverage Validation

**Feature Coverage:**
- All 8 FR capability groups are mapped to concrete subsystems and key files.
- Cross-cutting concerns (security, observability, reliability, extensibility) are mapped to concrete modules.
- No uncovered functional requirement category found.

**Functional Requirements Coverage:**
- FR1-6 (capture/storage): covered by `vector/` + `security/`.
- FR7-11 (retrieval/search): covered by `vector/` + cache path.
- FR12-18 (learning): covered by `learning/` pipeline.
- FR19-24 (project detection): covered by `detection/`.
- FR25-30 (portability): covered by `import-export/`.
- FR31-36 (tool injection): covered by `tools/` + `core/`.
- FR37-42 and FR43-46 (config): covered by `config/` + schema validation.

**Non-Functional Requirements Coverage:**
- Performance: addressed by LRU caching, async lifecycle, and benchmark validation points.
- Security: addressed by local-only data path, secret detection, and RuVector native encryption segments.
- Reliability: addressed by graceful degradation, structured errors, and backup strategy.
- Scalability: addressed by RuVector/HNSW and modular data path.
- Integration: addressed by explicit tool API contract and `.rvf` portability.

### Implementation Readiness Validation

**Decision Completeness:**
- Critical decisions are documented with rationale and concrete implementation implications.
- Technology stack and boundaries are specific enough for direct coding handoff.
- Rules for consistency are explicit and enforceable.

**Structure Completeness:**
- Directory structure is complete with root configs, source modules, tests, docs, CI, and runtime artifacts.
- Integration points and ownership boundaries are explicit.

**Pattern Completeness:**
- Conflict-prone areas are covered: naming, responses, errors, logging, types, exports, and module boundaries.
- Checklist available for implementation-time compliance.

### Gap Analysis Results

**Critical Gaps:**
- None identified.

**Important Gaps:**
- Optional future detail: define exact performance benchmark harness scripts in `package.json` once implementation starts.
- Optional future detail: formalize agent-facing API markdown examples in `docs/API.md` after first implementation pass.

**Nice-to-Have Gaps:**
- Add lint rules that automatically enforce selected naming patterns where feasible.
- Add architectural decision traceability table linking each FR to test IDs post-implementation.

### Validation Issues Addressed

- Confirmed no contradictions between module boundaries and communication patterns.
- Confirmed no mismatch between tool contract format and error-handling patterns.
- Confirmed structure supports zero-config defaults and advanced configuration overrides.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Cohesive end-to-end architecture from requirements through implementation boundaries.
- Clear conventions that reduce multi-agent implementation drift.
- Concrete structure and integration maps suitable for immediate build-out.
- Explicit validation checkpoints for performance, security, and reliability.

**Areas for Future Enhancement:**
- Expand automated conformance checks (lint + CI policy) once codebase is scaffolded.
- Add richer API examples and troubleshooting scenarios after first implementation cycle.

### Implementation Handoff

**AI Agent Guidelines:**
- Follow architectural decisions and consistency rules exactly.
- Respect subsystem boundaries and index-based module exports.
- Use unified tool response and error structures in all handlers.
- Keep config validation and logging patterns consistent across modules.

**First Implementation Priority:**
- Scaffold the project using the defined directory structure and root configuration files.
- Implement `core`, `config`, `vector`, and `tools` foundation path first.
- Add baseline unit and integration tests aligned with declared structure.
