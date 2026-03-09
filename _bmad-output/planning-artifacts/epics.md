---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
---

# ruvector-memory-opencode - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for ruvector-memory-opencode, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Agents can invoke `memory_save(content, metadata)` to capture project knowledge (architecture decisions, patterns, rules, error lessons, code examples)
FR2: System automatically vectorizes plain-text, markdown, code, and structured content using semantic embeddings
FR3: Users can provide optional metadata tags (content_type, priority, source) to organize captured memories
FR4: Memory is persisted locally in `.opencode/ruvector_memory.db` on the developer's machine
FR5: System maintains confidence scores for each memory (how reliable is this knowledge?)
FR6: Users can manually mark memories with priority levels (critical, normal, low) to influence retrieval ranking
FR7: Agents can invoke `memory_search(query, limit, threshold)` to retrieve memories semantically related to a given context or question
FR8: Search results are ranked by relevance score (similarity + confidence + recency)
FR9: System filters results by optional metadata (content_type, tags, date range)
FR10: System returns not just raw content but also metadata context (where this was learned, how confident, when added)
FR11: Agents automatically receive top 3-5 relevant memories in their context before generating responses (transparent retrieval)
FR12: Agents can invoke `memory_learn_from_feedback(memory_id, feedback_type)` with feedback types: helpful, incorrect, duplicate, outdated
FR13: "Helpful" feedback increases memory confidence score, improving ranking in future searches
FR14: "Incorrect" feedback lowers confidence; system may eventually deprioritize or archive eroded memories
FR15: "Duplicate" feedback allows agents to merge related memories and deduplicate knowledge base
FR16: System tracks feedback patterns; if pattern corrected 3+ times, system auto-deprioritizes the bad pattern
FR17: Users can manually review memory statistics (hit rate, feedback trends, learning velocity) to understand what the agent has learned
FR18: System maintains learning history (who corrected what, when) for auditability
FR19: Plugin auto-detects project structure on agent initialization (reads `.opencode/`, `package.json`, `tsconfig.json`, README, architecture docs)
FR20: System creates isolated memory database per project (memories don't leak between projects)
FR21: System automatically identifies project language, framework, and tech stack from context files
FR22: Project metadata is saved with memory (project name, type, tech stack) to enable cross-project collaboration later
FR23: User can optionally configure project identity in `.opencode/ruvector.config.ts` (project name, team, retention policies)
FR24: System automatically detects when developer switches projects and loads that project's memory context
FR25: Users can invoke `memory_export()` to export all project memories as a portable `.rvf` file (RuVector format)
FR26: Exported memory includes all vectors, metadata, confidence scores, and learning history
FR27: Users can invoke `memory_import(file)` to import previously exported memories into a new project
FR28: System automatically resolves conflicts when importing (duplicate detection, version resolution)
FR29: Exported memories can be version-controlled in Git alongside project code
FR30: Teams can share curated memory exports to standardize practices across projects
FR31: Plugin auto-registers memory tools with OpenCode agent context on initialization
FR32: `memory_save()`, `memory_search()`, and `memory_learn_from_feedback()` are automatically available as "tools" agents can invoke
FR33: Zero boilerplate required; developers don't need to import or initialize memory in their agent code
FR34: Agent context automatically includes top relevant memories in system prompt (passive context enrichment)
FR35: Agents can explicitly trigger `memory_search()` when they need to find relevant patterns or rules
FR36: System gracefully handles memory failures; if memory is unavailable, agent continues functioning (memory is additive, not critical)
FR37: Users can install plugin with single command: `npm install ruvector-memory`
FR38: Plugin automatically initializes on next OpenCode agent session (no explicit activation)
FR39: System auto-detects if this is first run; creates `.opencode/ruvector_memory.db` automatically
FR40: Sensible defaults apply: vector dimensions, similarity threshold, feedback weighting, retention policies
FR41: Plugin integrates transparently; existing OpenCode workflows and agent code require zero changes
FR42: Error handling includes helpful messages if memory is misconfigured (e.g., disk full, permission issues)
FR43: Users can create `.opencode/ruvector.config.ts` to customize: vector dimensions, similarity threshold, retention policy, learning aggressiveness
FR44: Team leads can create shared memory configs (e.g., `.opencode/team-memory.ts`) to enforce org-wide standards
FR45: Users can define custom memory schema (what metadata fields matter for their project)
FR46: Configuration changes apply immediately to future memory operations (no restart required)

### NonFunctional Requirements

NFR1: `memory_save()` completes in <50ms p50, <100ms p99 (non-blocking)
NFR2: `memory_search()` returns top-5 results in <100ms p50, <300ms p99 for project with 10K memories
NFR3: Plugin initialization completes in <1 second on first run (project discovery + DB init)
NFR4: Memory queries don't block agent response generation (async/concurrent support)
NFR5: Batch operations (export/import) complete in <5 seconds for typical projects
NFR6: All memory data encrypted at-rest using AES-256-GCM (local device only)
NFR7: Memory database file is not readable/writable by processes outside the developer's user account
NFR8: No memory data transmitted externally; all operations remain on local machine
NFR9: No authentication required (single-user assumption); access control enforced at OS level
NFR10: Sensitive patterns (API keys, passwords in captured memory) don't leak in logs or exports
NFR11: Zero data loss: all commits to memory database are durable (transaction safety)
NFR12: Automatic daily backups to `.opencode/.ruvector_backups/` with rollback capability
NFR13: Graceful degradation: if memory fails, agent continues functioning (memory is additive)
NFR14: Recovery from corrupted index: automated index rebuild without data loss
NFR15: System must survive crashes: in-flight transactions don't corrupt future operations
NFR16: Memory consistency verified on every startup (checksum validation)
NFR17: System supports projects with up to 1M memories with <5% performance degradation
NFR18: Memory database footprint stays reasonable: <100MB for 100K typical memories
NFR19: HNSW index tuning prevents memory explosion (configurable dimensions, M factor)
NFR20: Vector operations scale linearly with memory size (not exponentially)
NFR21: Feedback loop doesn't degrade performance as confidence scores accumulate
NFR22: Plugin auto-detects and integrates with OpenCode agent context on init (zero config)
NFR23: Memory tools available in any OpenCode-compatible agent framework (not hardcoded to OpenCode)
NFR24: Portable memory format (.rvf) is framework-agnostic and versioned for compatibility
NFR25: Plugin maintains backward compatibility with past exported memory formats (import after updates)
NFR26: Clean API surface (documented payload schemas) enables third-party tools to read/import memory

### Additional Requirements

- No starter template; custom project setup with tsup, Biome, Vitest
- Node.js >=22 with TypeScript 5+ and NAPI-RS native bindings for `@ruvector/core`
- Package manager strategy: npm as default for install/CI compatibility with OpenCode + RuVector docs; pnpm supported for contributor workflows; bun not default for this plugin
- Local-only storage in `.opencode/` with zero network transmission
- `.rvf` export/import must be portable and Git-versionable
- Automatic daily backups with retention policy and pre-migration snapshots
- Graceful degradation: memory failures never block agent reasoning
- Observability via structured logs and JSON metrics (hit rate, token savings, latency)
- Project auto-detection with per-project isolation (explicit `.opencode` > git root > workspace root)
- Secret detection (regex + entropy) with audit logging
- Unified tool response format; never throw from tool handlers

### FR Coverage Map

FR1: Epic 1 - Knowledge capture through `memory_save`
FR2: Epic 1 - Automatic vectorization
FR3: Epic 2 - Tagging and optional metadata
FR4: Epic 1 - Local persistence in `.opencode`
FR5: Epic 2 - Confidence score per memory
FR6: Epic 2 - Manual memory prioritization
FR7: Epic 1 - Baseline semantic search
FR8: Epic 1 - Relevance ranking
FR9: Epic 2 - Metadata-based filters
FR10: Epic 2 - Context-enriched result payload
FR11: Epic 2 - Automatic top 3-5 context injection
FR12: Epic 3 - Structured feedback capture
FR13: Epic 3 - Reinforcement of useful memories
FR14: Epic 3 - Penalization of incorrect memories
FR15: Epic 3 - Dedupe/merge from feedback
FR16: Epic 3 - Auto-deprioritization of repeated bad patterns
FR17: Epic 3 - Learning metrics and statistics
FR18: Epic 3 - Auditable history
FR19: Epic 1 - Automatic context detection
FR20: Epic 1 - Per-project isolation
FR21: Epic 2 - Stack/language detection
FR22: Epic 2 - Project metadata persisted with memory
FR23: Epic 5 - Configurable project identity
FR24: Epic 1 - Automatic context switch on project change
FR25: Epic 4 - `.rvf` export
FR26: Epic 4 - Full export with metadata/history
FR27: Epic 4 - Import from `.rvf`
FR28: Epic 4 - Conflict resolution on import
FR29: Epic 4 - Git versioning support
FR30: Epic 4 - Curated sharing across teams
FR31: Epic 1 - Automatic tool registration
FR32: Epic 1 - Tools available without boilerplate
FR33: Epic 1 - Zero setup in agent code
FR34: Epic 1 - Passive prompt enrichment from memory
FR35: Epic 1 - Explicit agent-triggered search
FR36: Epic 1 - Graceful degradation on failure
FR37: Epic 1 - One-command installation
FR38: Epic 1 - Auto-init in next session
FR39: Epic 1 - First-run DB bootstrap
FR40: Epic 1 - Sensible defaults
FR41: Epic 1 - Transparent integration without workflow changes
FR42: Epic 1 - Actionable configuration errors
FR43: Epic 5 - Advanced behavior configuration
FR44: Epic 5 - Shared team configuration
FR45: Epic 5 - Customizable metadata schema
FR46: Epic 5 - Apply config changes without restart

## Epic List

### Epic 1: Persistent Memory Ready in Minutes
The developer installs the plugin and gets local semantic memory working without manual configuration, with per-project isolation and resilient operation.
**FRs covered:** FR1, FR2, FR4, FR7, FR8, FR19, FR20, FR24, FR31, FR32, FR33, FR35, FR36, FR37, FR38, FR39, FR40, FR41, FR42

### Epic 2: Reliable and Relevant Context Retrieval
The agent returns useful and traceable context with ranking, filters, and metadata so responses remain consistent with the project.
**FRs covered:** FR3, FR5, FR6, FR9, FR10, FR11, FR21, FR22

### Epic 3: Continuous Learning with Control and Auditability
The system improves with real team feedback, reduces wrong patterns, and maintains an auditable learning history.
**FRs covered:** FR12, FR13, FR14, FR15, FR16, FR17, FR18

### Epic 4: Knowledge Portability and Collaboration
Users export/import memory in `.rvf`, resolve conflicts, and share knowledge across projects/teams.
**FRs covered:** FR25, FR26, FR27, FR28, FR29, FR30

### Epic 5: Advanced Configuration and Governance
Power users and team leads customize behavior, schema, and policies without restarts.
**FRs covered:** FR23, FR43, FR44, FR45, FR46

## Epic 1: Persistent Memory Ready in Minutes

The developer installs the plugin and gets local semantic memory working without manual configuration, with per-project isolation and resilient operation.

### Story 1.1: Plugin Installation and Automatic Activation

As a developer,
I want to install the plugin and have it activate automatically in OpenCode,
So that I can use memory without manual bootstrap steps.

**FRs implemented:** FR37, FR38

**Acceptance Criteria:**

**Given** an environment with Node.js `>=22`
**When** I install the plugin with `npm` in the project
**Then** the plugin is available in the next OpenCode session without manual activation
**And** if Node.js is `<22`, I receive a clear and actionable error

### Story 1.2: First-Run Initialization and Local Per-Project Database

As a developer,
I want the project's local memory database to be created automatically on first use,
So that I have immediate persistence without additional configuration.

**FRs implemented:** FR4, FR39, FR40

**Acceptance Criteria:**

**Given** a project without a previous memory database
**When** I run the first memory operation
**Then** `.opencode/ruvector_memory.db` is created automatically
**And** safe default values are applied for initial operation

### Story 1.3: Context Detection and Isolation Across Projects

As a developer working across multiple repos,
I want the system to detect the active context and isolate memories per project,
So that knowledge is not mixed between different repositories.

**FRs implemented:** FR19, FR20, FR24

**Acceptance Criteria:**

**Given** two different projects with OpenCode
**When** I save memories in each project
**Then** each project persists and retrieves only its own memories
**And** when switching projects, memory context switches automatically

### Story 1.4: Automatic Registration of Memory Tools

As an agent integrator,
I want memory tools to register automatically in the agent context,
So that agents can use them without boilerplate.

**FRs implemented:** FR31, FR32, FR33

**Acceptance Criteria:**

**Given** an active plugin in a valid project
**When** an agent session starts
**Then** `memory_save`, `memory_search`, and `memory_learn_from_feedback` are registered automatically
**And** registration requires no imports or additional initialization code

### Story 1.5: Core Save and Search Operations with Ranking

As a developer,
I want to store and retrieve semantic memory with relevance ranking,
So that the agent can retrieve useful context quickly.

**FRs implemented:** FR1, FR2, FR7, FR8, FR35

**Acceptance Criteria:**

**Given** saved memories with textual content
**When** I run `memory_search(query, limit, threshold)`
**Then** I receive results ordered by relevance
**And** response time meets the defined MVP latency targets

### Story 1.6: Graceful Degradation and Actionable Errors

As a developer,
I want memory failures to avoid breaking the agent workflow,
So that I can continue working even with partial failures.

**FRs implemented:** FR36, FR42

**Acceptance Criteria:**

**Given** a transient or permanent failure in the memory subsystem
**When** a memory tool is invoked
**Then** the agent keeps operating and receives a structured error response
**And** the message indicates cause and recommended next action

### Story 1.7: Package Manager Compatibility for Installation and CI

As a maintainer,
I want an explicit package manager strategy (npm default, pnpm support),
So that installation, CI, and contributions remain consistent with OpenCode/RuVector.

**FRs implemented:** FR37, FR41

**Acceptance Criteria:**

**Given** the plugin installation and CI documentation
**When** I review the official commands
**Then** `npm` appears as the default flow for install/CI (`npm ci`)
**And** `pnpm` is documented as a supported alternative for contributors

## Epic 2: Reliable and Relevant Context Retrieval

The agent returns useful and traceable context with ranking, filters, and metadata so responses remain consistent with the project.

### Story 2.1: Standard Metadata in Memory Save

As a developer,
I want to attach useful metadata (tags, source, priority) when saving memory,
So that retrieval becomes more precise and traceable.

**FRs implemented:** FR3

**Acceptance Criteria:**

**Given** a `memory_save` request with optional metadata
**When** memory is persisted
**Then** tags, source, and priority are stored consistently
**And** if metadata is not provided, valid default values are applied

### Story 2.2: Relevance Scoring with Composite Signals

As an agent user,
I want results to use a combined score (similarity, confidence, recency),
So that the most useful context appears first.

**FRs implemented:** FR5, FR8

**Acceptance Criteria:**

**Given** multiple candidate memories for a query
**When** I run `memory_search`
**Then** results are ordered by a documented composite score
**And** the score is deterministic for equivalent inputs

### Story 2.3: Search Filters by Metadata and Time Range

As a developer,
I want to filter searches by tags, content type, and dates,
So that I can narrow results to a specific operational context.

**FRs implemented:** FR9

**Acceptance Criteria:**

**Given** a query with metadata and date filters
**When** `memory_search` is processed
**Then** only results matching all filters are returned
**And** invalid filters return a structured and actionable error

### Story 2.4: Enriched Response with Source Context

As an agent integrator,
I want each result to include source context and confidence,
So that the agent can justify why it uses a memory.

**FRs implemented:** FR10

**Acceptance Criteria:**

**Given** search results
**When** the tool response is constructed
**Then** each item includes content, relevance score, confidence, timestamp, and source
**And** response format remains consistent with the tools contract

### Story 2.5: Passive Injection of Top Memories into Agent Context

As an end user,
I want the agent to automatically receive the most relevant memories,
So that it responds aligned with the project without requiring explicit searches every time.

**FRs implemented:** FR11, FR34

**Acceptance Criteria:**

**Given** a new agent interaction in a project with memory
**When** execution context is prepared
**Then** top relevant memories are injected automatically
**And** the mechanism respects configured count/token limits

### Story 2.6: Stack Detection and Project Metadata Enrichment

As a developer,
I want the system to detect stack/language and associate it with each memory,
So that it enables contextual retrieval by technology/project.

**FRs implemented:** FR21, FR22

**Acceptance Criteria:**

**Given** a project with detectable stack files (`package.json`, `tsconfig`, etc.)
**When** project context initializes
**Then** primary language/framework are identified
**And** that metadata is available for indexing and search filters

## Epic 3: Continuous Learning with Control and Auditability

The system improves with real team feedback, reduces wrong patterns, and maintains an auditable learning history.

### Story 3.1: Structured Feedback Capture for Memories

As an agent user,
I want to submit structured feedback (`helpful`, `incorrect`, `duplicate`, `outdated`) for a memory,
So that the system can improve future ranking and behavior.

**FRs implemented:** FR12

**Acceptance Criteria:**

**Given** a memory returned by search
**When** `memory_learn_from_feedback(memory_id, feedback_type)` is invoked
**Then** feedback is persisted with timestamp and actor/source metadata
**And** invalid feedback types return a structured validation error

### Story 3.2: Positive Feedback Reinforcement

As a developer,
I want helpful feedback to improve memory confidence,
So that high-quality memories appear more often in future retrievals.

**FRs implemented:** FR13

**Acceptance Criteria:**

**Given** a memory with one or more `helpful` events
**When** ranking is recalculated
**Then** its confidence score increases according to documented rules
**And** score changes are bounded to prevent runaway amplification

### Story 3.3: Negative Feedback Deprioritization

As a developer,
I want incorrect/outdated feedback to reduce confidence,
So that low-quality memories are less likely to influence agent responses.

**FRs implemented:** FR14

**Acceptance Criteria:**

**Given** a memory marked `incorrect` or `outdated`
**When** ranking is recalculated
**Then** its confidence score decreases according to policy
**And** the memory remains traceable for audit unless explicitly archived by rule

### Story 3.4: Duplicate Detection and Memory Merge Workflow

As a maintainer,
I want duplicate feedback to enable merge/deduplication,
So that redundant memories do not fragment ranking quality.

**FRs implemented:** FR15

**Acceptance Criteria:**

**Given** two or more memories marked as duplicates
**When** dedupe workflow executes
**Then** a canonical memory is selected and linked history is preserved
**And** merged records remain auditable with reversible metadata links

### Story 3.5: Pattern-Level Auto-Deprioritization

As a team lead,
I want repeated corrections of the same bad pattern to trigger automatic deprioritization,
So that the system stops re-suggesting known low-quality patterns.

**FRs implemented:** FR16

**Acceptance Criteria:**

**Given** a pattern corrected at least 3 times
**When** the learning engine evaluates pattern quality
**Then** related memories are automatically deprioritized per policy
**And** an audit event is recorded with rationale and impacted memory IDs

### Story 3.6: Learning Metrics and Audit History

As a product owner,
I want visibility into learning metrics and feedback history,
So that I can assess learning velocity and governance quality.

**FRs implemented:** FR17, FR18

**Acceptance Criteria:**

**Given** accumulated feedback events
**When** learning metrics are requested
**Then** the system returns hit rate, feedback trend, and learning velocity indicators
**And** history includes who/what/when details needed for auditability

## Epic 4: Knowledge Portability and Collaboration

Users export/import memory in `.rvf`, resolve conflicts, and share knowledge across projects/teams.

### Story 4.1: Full Memory Export to RVF

As a developer,
I want to export project memory to a portable `.rvf` file,
So that I can back up, transfer, or reuse knowledge elsewhere.

**FRs implemented:** FR25, FR26

**Acceptance Criteria:**

**Given** an initialized project memory database
**When** `memory_export()` is invoked
**Then** a valid `.rvf` artifact is generated
**And** it includes vectors, metadata, confidence scores, and learning history

### Story 4.2: Safe Import from RVF

As a developer,
I want to import a previously exported `.rvf` file into a project,
So that I can bootstrap memory without re-teaching the agent.

**FRs implemented:** FR27

**Acceptance Criteria:**

**Given** a valid `.rvf` input file
**When** `memory_import(file)` is invoked
**Then** memory records are loaded into the target project store
**And** schema/version validation is performed before any write is committed

### Story 4.3: Conflict Resolution During Import

As a maintainer,
I want deterministic conflict resolution for duplicate or diverging memory records,
So that import operations remain predictable and auditable.

**FRs implemented:** FR28

**Acceptance Criteria:**

**Given** incoming records that collide with existing records
**When** import conflict handling executes
**Then** the system applies documented conflict rules (merge/replace/skip as configured)
**And** an import report records every conflict decision and reason

### Story 4.4: Backward-Compatible RVF Version Handling

As a product owner,
I want backward compatibility for prior exported formats,
So that upgrades do not break historical memory assets.

**FRs implemented:** FR26, FR27, FR28

**Acceptance Criteria:**

**Given** an `.rvf` produced by an earlier supported version
**When** import runs on a newer plugin version
**Then** compatibility checks and migrations are applied automatically
**And** unsupported versions fail with a clear and actionable compatibility error

### Story 4.5: Git-Friendly Export Workflow

As a developer,
I want exports to be version-control friendly,
So that memory artifacts can be tracked alongside source code.

**FRs implemented:** FR29

**Acceptance Criteria:**

**Given** an exported `.rvf` artifact
**When** it is committed into Git workflows
**Then** file naming/version metadata follows documented conventions
**And** export manifests allow traceability across commits/releases

### Story 4.6: Curated Team Sharing of Memory Packs

As a team lead,
I want to share curated memory packs across projects/teams,
So that proven practices can be reused quickly and consistently.

**FRs implemented:** FR30

**Acceptance Criteria:**

**Given** a curated export set approved by the team
**When** another project imports that pack
**Then** shared knowledge becomes searchable in the target context
**And** provenance metadata identifies source team/project and curation timestamp

## Epic 5: Advanced Configuration and Governance

Power users and team leads customize behavior, schema, and policies without restarts.

### Story 5.1: Project Identity Configuration

As a developer,
I want to define project identity settings (name, team, retention defaults),
So that memory behavior matches my project context and governance needs.

**FRs implemented:** FR23

**Acceptance Criteria:**

**Given** a project configuration file in `.opencode`
**When** identity settings are provided
**Then** project identity is loaded and applied to new memory operations
**And** invalid identity config returns actionable validation feedback

### Story 5.2: Advanced Runtime Memory Tuning

As a power user,
I want to tune vector dimensions, similarity threshold, and learning aggressiveness,
So that memory quality and performance can be optimized for my use case.

**FRs implemented:** FR43

**Acceptance Criteria:**

**Given** advanced config options are declared
**When** runtime loads configuration
**Then** tuning parameters are validated and applied safely
**And** unsupported values are rejected with explicit error messages

### Story 5.3: Team-Shared Configuration Baseline

As a team lead,
I want a shared team-level memory configuration,
So that all contributors follow consistent memory behavior and standards.

**FRs implemented:** FR44

**Acceptance Criteria:**

**Given** a team-shared config file (for example `.opencode/team-memory.ts`)
**When** contributors run the plugin in the project
**Then** team baseline settings are applied consistently
**And** local overrides follow documented precedence rules

### Story 5.4: Custom Metadata Schema Definition

As a maintainer,
I want to define a custom metadata schema for memory records,
So that indexing and retrieval align with domain-specific project semantics.

**FRs implemented:** FR45

**Acceptance Criteria:**

**Given** a custom schema definition in configuration
**When** memory save/import operations occur
**Then** metadata is validated against the schema before persistence
**And** schema violations return structured validation errors

### Story 5.5: Hot Reload of Configuration Changes

As a developer,
I want configuration changes to apply without restarting OpenCode sessions,
So that I can iterate on memory behavior quickly.

**FRs implemented:** FR46

**Acceptance Criteria:**

**Given** an active plugin session
**When** configuration files are modified
**Then** updated settings are applied to subsequent memory operations without restart
**And** failed reload attempts keep prior known-good configuration active

### Story 5.6: Governance and Audit Events for Config Changes

As a product owner,
I want config and policy changes to be auditable,
So that governance decisions are traceable across the project lifecycle.

**FRs implemented:** FR43, FR44, FR46

**Acceptance Criteria:**

**Given** a configuration or policy change event
**When** the change is applied (or rejected)
**Then** an audit record captures actor/source, timestamp, changed fields, and outcome
**And** audit records are queryable through documented tooling/interfaces
