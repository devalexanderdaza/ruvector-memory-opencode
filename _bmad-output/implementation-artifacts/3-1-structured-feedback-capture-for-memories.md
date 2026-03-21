# Story 3.1: Structured Feedback Capture for Memories

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an agent user,
I want to submit structured feedback (`helpful`, `incorrect`, `duplicate`, `outdated`) for a memory,
So that the system can improve future ranking and behavior.

## Acceptance Criteria

1. **Given** a memory returned by search
   **When** `memory_learn_from_feedback(memory_id, feedback_type)` is invoked with a valid `memory_id` and one of the four accepted feedback types
   **Then** feedback is persisted alongside the memory with a timestamp and actor/source metadata
   **And** the memory's `positiveFeedbackCount` or `negativeFeedbackCount` is updated atomically

2. **Given** an invalid `feedback_type` (e.g. `"bogus"`)
   **When** `memory_learn_from_feedback(memory_id, feedback_type)` is invoked
   **Then** a structured `ToolResponse` error is returned with `code: "INVALID_FEEDBACK_TYPE"` and an actionable error message listing valid types
   **And** no mutation occurs to any memory record

3. **Given** a `memory_id` that does not exist in the database
   **When** `memory_learn_from_feedback(memory_id, feedback_type)` is invoked
   **Then** a structured `ToolResponse` error is returned with `code: "MEMORY_NOT_FOUND"`
   **And** no mutation occurs to any memory record

4. **Given** the memory subsystem is in degraded mode or the database is not initialized
   **When** `memory_learn_from_feedback` is invoked
   **Then** the tool returns a structured `ToolResponse` error with `code: "ENOTREADY"`
   **And** the agent continues functioning (no throw, graceful degradation)

## Tasks / Subtasks

- [ ] **Task 1: Define Feedback Types and Input Schema** (AC: 1, 2)
  - [ ] Add `FeedbackType` literal union (`"helpful" | "incorrect" | "duplicate" | "outdated"`) to `src/shared/types.ts`
  - [ ] Add `MemoryFeedbackInput` interface to `src/shared/types.ts`:
    ```typescript
    interface MemoryFeedbackInput {
      memory_id: string;
      feedback_type: "helpful" | "incorrect" | "duplicate" | "outdated";
      source?: string;   // actor/caller identifier, defaults to "agent"
      context?: string;  // optional free-text reason for the feedback
    }
    ```
  - [ ] Add `MemoryFeedbackResult` interface to `src/shared/types.ts`:
    ```typescript
    interface MemoryFeedbackResult {
      memory_id: string;
      feedback_type: string;
      previous_confidence: number;
      new_confidence: number;
      total_feedback_count: number;
    }
    ```
  - [ ] Add Zod validation schema `MemoryFeedbackInputSchema` to a new `src/tools/schemas/feedback-schema.ts` (or inline in `memory-learn-tool.ts` if simpler; keep consistent with existing `memory-save-tool.ts` validation pattern)
  - [ ] Add `FeedbackValidationError` to `src/shared/errors.ts` with code `"INVALID_FEEDBACK_TYPE"`
  - [ ] Add `MemoryNotFoundError` to `src/shared/errors.ts` with code `"MEMORY_NOT_FOUND"`

- [ ] **Task 2: Extend VectorStoreAdapter with get and update** (AC: 1, 3)
  - [ ] Add `getById(id: string): Promise<ToolResponse<MemorySearchItem>>` to `VectorStoreAdapter` in `src/vector/vector-store.ts`
    - Uses `db.get(id)` already exposed by `VectorDbLike` interface
    - Returns `{ success: false, code: "MEMORY_NOT_FOUND" }` if `null` is returned
    - Parses metadata string to object using existing `parseMetadata()`
  - [ ] Add `updateMetadata(id: string, metadata: Record<string, unknown>): Promise<ToolResponse<{ id: string }>>` to `VectorStoreAdapter`
    - Reads current entry via `db.get(id)`, merges metadata, writes back via `db.insert({ id, vector, metadata: JSON.stringify(merged) })`
    - If `@ruvector/core` insert supports upsert-by-id, use it; otherwise delete-then-insert (check API below)
    - Returns `{ success: false, code: "MEMORY_NOT_FOUND" }` if entry doesn't exist

- [ ] **Task 3: Implement memory_learn_from_feedback Tool** (AC: 1, 2, 3, 4)
  - [ ] Replace the placeholder stub in `src/tools/tools/memory-learn-tool.ts`
  - [ ] Factory function `createMemoryLearnTool()` receives no parameters (uses `getVectorStoreAdapterForTools()` from plugin.ts)
  - [ ] Validation flow:
    1. Parse `input` with Zod schema → return `INVALID_FEEDBACK_TYPE` error if invalid
    2. Get vector store via `getVectorStoreAdapterForTools()` → return `ENOTREADY` if null
    3. Call `vectorStore.getById(memory_id)` → return `MEMORY_NOT_FOUND` if not found
    4. Read current metadata, compute new feedback counts:
       - `helpful` → increment `positiveFeedbackCount`
       - `incorrect` / `outdated` → increment `negativeFeedbackCount`
       - `duplicate` → increment `negativeFeedbackCount` (deprioritization; actual merge is Story 3.4)
    5. Recompute confidence using `computeConfidence()` from `src/vector/confidence-calculator.ts`
    6. Persist updated metadata via `vectorStore.updateMetadata()`
    7. Return `ToolResponse<MemoryFeedbackResult>`
  - [ ] Follow the tool response contract: never throw, always return `{ success: true/false, ... }`
  - [ ] Log feedback event via `logger.info("feedback_recorded", { ... })`

- [ ] **Task 4: Wire Tool Registration** (AC: 1, 4)
  - [ ] Verify `createMemoryLearnTool()` is already registered in `src/tools/tool-injector.ts` (it should be, since Epic 1 story 1.4 registered all three tools)
  - [ ] Ensure the tool receives the correct input parameter (currently the stub ignores `input`)

- [ ] **Task 5: Unit Tests** (AC: 1, 2, 3, 4)
  - [ ] Create/update `tests/unit/tools/memory-learn-tool.test.ts`:
    - Test valid `helpful` feedback updates `positiveFeedbackCount` and recomputes confidence
    - Test valid `incorrect` feedback updates `negativeFeedbackCount`
    - Test valid `outdated` feedback updates `negativeFeedbackCount`
    - Test valid `duplicate` feedback updates `negativeFeedbackCount`
    - Test invalid feedback type returns structured `INVALID_FEEDBACK_TYPE` error
    - Test non-existent memory_id returns `MEMORY_NOT_FOUND` error
    - Test plugin not activated returns `ENOTREADY` error
    - Test `source` and `context` metadata are persisted in feedback record
    - Test confidence recomputation uses `computeConfidence()` correctly
  - [ ] Create/update `tests/unit/vector/vector-store-get-update.test.ts`:
    - Test `getById()` returns parsed memory with metadata
    - Test `getById()` for non-existent ID
    - Test `updateMetadata()` correctly merges and persists
    - Test `updateMetadata()` for non-existent ID

- [ ] **Task 6: Integration Tests** (AC: 1, 2, 3)
  - [ ] Add integration test in `tests/integration/feedback-roundtrip.test.ts`:
    - Save a memory → get its ID → submit `helpful` feedback → verify confidence changed → search and verify updated metadata
    - Save a memory → submit `incorrect` feedback → verify negativeFeedbackCount increased
    - Attempt feedback on non-existent ID → verify structured error
    - Attempt feedback with invalid type → verify structured error

## Dev Notes

### Architecture & Integration Guardrails

- **Current state of `memory-learn-tool.ts`**: The file is a **placeholder stub** (17 lines) that returns `ENOTIMPLEMENTED`. You are replacing this stub entirely with a full implementation. Do NOT try to extend it; rewrite it from scratch following the pattern established in `memory-save-tool.ts` and `memory-search-tool.ts`.

- **VectorDbLike interface already has `get(id)`**: The `VectorDbLike` interface in `vector-store.ts:46-50` already exposes `get(id: string)` which returns the raw entry or `null`. Use this to implement `getById()` on `VectorStoreAdapter`.

- **Metadata is stored as a JSON string**: Always `JSON.parse()` on read and `JSON.stringify()` on write. Use the existing `parseMetadata()` private function (currently at `vector-store.ts:53-67`). You may need to make it package-accessible or create a comparable utility.

- **Confidence calculator already exists**: `src/vector/confidence-calculator.ts` has `computeConfidence()` which takes `{ accessCount, positiveFeedbackCount, negativeFeedbackCount }` and returns a score in `[-1.0, 1.0]`. Import and use it directly — do NOT reinvent confidence computation.

- **Plugin singleton accessors**: Use `getVectorStoreAdapterForTools()` from `src/core/plugin.ts` to get the vector store instance. If it returns `null`, the plugin is not activated — return `ENOTREADY`.

- **Tool factory pattern**: Follow the exact same factory pattern used in `memory-save-tool.ts`:
  ```typescript
  export function createMemoryLearnTool(): (input?: unknown) => Promise<ToolResponse<MemoryFeedbackResult>> {
    return async function memory_learn_from_feedback(input?: unknown): Promise<ToolResponse<MemoryFeedbackResult>> {
      // implementation
    };
  }
  ```

- **Never throw from tool handlers**: Catch all errors and return `{ success: false, code, error, reason }`.

- **Logger convention**: Use `logger.info("feedback_recorded", { memory_id, feedback_type, new_confidence })` — event names are `snake_case`, metadata is flat `Record<string, unknown>`.

### Confidence Update Semantics

The `confidence` field stored in metadata represents the output of `computeConfidence()`. When feedback is received:

1. Read current `positiveFeedbackCount` and `negativeFeedbackCount` from metadata (default to `0` if absent)
2. Increment the appropriate counter based on feedback_type:
   - `"helpful"` → `positiveFeedbackCount += 1`
   - `"incorrect"` → `negativeFeedbackCount += 1`
   - `"outdated"` → `negativeFeedbackCount += 1`
   - `"duplicate"` → `negativeFeedbackCount += 1` (real merge is Story 3.4)
3. Read current `accessCount` from metadata (default to `0`)
4. Call `computeConfidence({ accessCount, positiveFeedbackCount, negativeFeedbackCount })`
5. Store the new `confidence` value back in metadata

**Important**: The feedback counters (`positiveFeedbackCount`, `negativeFeedbackCount`) are ALREADY part of the metadata schema used by `confidence-calculator.ts` and `memory-response-formatter.ts`. The save tool persists `confidence: 0.5` by default. This story is the first time these counters get mutated.

### Update Pattern for @ruvector/core

The `VectorDbLike` interface has `insert()` which takes an optional `id`. Research whether `@ruvector/core` supports upsert behavior (insert with existing ID overwrites). If yes, use insert-with-id for update. If not, you'll need a delete-then-insert pattern (add `delete(id)` to the `VectorDbLike` interface if needed).

**Fallback**: If neither upsert nor delete is available, store feedback data in a separate sidecar metadata approach (e.g., an in-memory Map or a separate file). However, the preferred approach is direct metadata update on the vector entry.

### File Structure and Naming

Files to create/modify:
- `src/tools/tools/memory-learn-tool.ts` — **REWRITE** (replace stub)
- `src/shared/types.ts` — ADD `MemoryFeedbackInput`, `MemoryFeedbackResult`, `FeedbackType`
- `src/shared/errors.ts` — ADD `FeedbackValidationError`, `MemoryNotFoundError`
- `src/vector/vector-store.ts` — ADD `getById()`, `updateMetadata()` methods
- `tests/unit/tools/memory-learn-tool.test.ts` — CREATE or rewrite
- `tests/unit/vector/vector-store-get-update.test.ts` — CREATE
- `tests/integration/feedback-roundtrip.test.ts` — CREATE

Files that MUST NOT be modified:
- `src/vector/confidence-calculator.ts` — use as-is, do not change the formula
- `src/tools/memory-response-formatter.ts` — no changes needed for this story
- `src/tools/memory-context-injector.ts` — no changes needed for this story

### Testing Standards

- **Test files location**: `tests/unit/` mirrors `src/` structure. `tests/integration/` for roundtrip tests.
- **Coverage thresholds**: Lines 90%, Branches 85%, Functions 90%, Statements 90%.
- **`resetPluginStateForTests()`** in `afterEach` is **mandatory** in every plugin-related test.
- **No `describe` nesting beyond 2 levels**.
- **Test naming**: `it("verb + expected behavior", ...)`.
- **Integration tests** use real filesystem via `process.cwd()/.tmp-{name}-tests` — clean up with `rmSync` in `afterEach`.
- **Mock pattern**: Unit tests mock `getVectorStoreAdapterForTools()` from plugin.ts to control vector store availability.

### Critical Don't-Miss Rules

- ❌ **Never import with `.ts` extension** — always use `.js` even for TypeScript files
- ❌ **Never throw from tool handlers** — always return `{ success: false, ... }`
- ❌ **Never use `console.log`** — always use `logger` singleton
- ❌ **Never use `any`** — use `unknown` and narrow before use
- ❌ **Never use `as` type assertions** — use Zod parsing or type guards
- ✅ **Always validate external input with Zod** — the `input` parameter is `unknown`
- ✅ **Array index access**: with `noUncheckedIndexedAccess`, always narrow or use `?? fallback`
- ✅ **ESM imports**: use `node:path`, `node:fs`, etc. for Node.js built-ins
- ✅ **File naming**: `kebab-case` for all files

### Previous Story Intelligence (Epic 2)

Key learnings from the completed Epic 2 stories:

1. **Story 2.6** revealed that `parseMetadata()` is critical — always parse metadata strings before accessing fields. Forgetting this causes silent undefined access with `noUncheckedIndexedAccess`.
2. **Story 2.5** established the circuit breaker pattern in `MemoryContextInjector` — this story's feedback tool does NOT need a circuit breaker; it's a direct tool invocation, not passive injection.
3. **Story 2.4** fixed a relevance mapping inversion bug — the `compositeScore` uses "lower is better" distance semantics. Confidence updates from this story affect future ranking via the composite formula.
4. **Story 2.1** established the metadata merge pattern in `memory-save-tool.ts` — feedback metadata updates should follow the same merge-then-stringify-then-persist pattern.

### Git Intelligence Summary

Recent commits show:
- `6420771` — Merge PR from copilot analysis branch
- `40be17d` — docs: finished and closed epic 2
- `c730a9c` — Merge story 2.6 branch into develop
- `f13a630` — bump version to 0.2.0

The codebase is stable at v0.2.0 with all Epic 2 stories done. Epic 3 is greenfield — no WIP conflicts expected.

### Project Structure Notes

```
src/
├── core/plugin.ts              # getVectorStoreAdapterForTools(), ensureProjectContextForTools()
├── shared/
│   ├── types.ts                # ADD MemoryFeedbackInput, MemoryFeedbackResult, FeedbackType
│   ├── errors.ts               # ADD FeedbackValidationError, MemoryNotFoundError
│   ├── logger.ts               # Use logger singleton (never console.log)
│   └── utils.ts                # Shared utilities
├── tools/
│   └── tools/
│       ├── memory-learn-tool.ts # REWRITE (currently a 17-line stub)
│       ├── memory-save-tool.ts  # Reference pattern for tool implementation
│       └── memory-search-tool.ts # Reference pattern
├── vector/
│   ├── vector-store.ts          # ADD getById(), updateMetadata() methods
│   ├── confidence-calculator.ts # USE AS-IS — computeConfidence()
│   └── initialization.ts       # No changes
tests/
├── unit/tools/memory-learn-tool.test.ts  # CREATE
├── unit/vector/vector-store-get-update.test.ts  # CREATE
└── integration/feedback-roundtrip.test.ts # CREATE
```

### References

- [Epic 3 Story 3.1 in Epics](../planning-artifacts/epics.md#story-31-structured-feedback-capture-for-memories)
- [FR12 Requirements](../planning-artifacts/prd.md)
- [Architecture: Tool Interface Format](../planning-artifacts/architecture.md)
- [Architecture: Confidence Calculator](../planning-artifacts/architecture.md)
- [Current Learn Tool Stub](../../src/tools/tools/memory-learn-tool.ts)
- [Vector Store Adapter](../../src/vector/vector-store.ts)
- [Confidence Calculator](../../src/vector/confidence-calculator.ts)
- [Project Context](../project-context.md)
- [Previous Story 2.6 Learnings](./2-6-stack-detection-and-project-metadata-enrichment.md)

## Dev Agent Record

### Agent Model Used

Antigravity (Gemini 2.5 Pro)

### Debug Log References

- All tests passing at 183/183
- TypeScript typecheck: 0 errors
- Coverage: memory-learn-tool.ts at 100% statements/functions

### Completion Notes List

- ✅ AC1: Feedback persisted with timestamp + positiveFeedbackCount/negativeFeedbackCount increment + confidence recomputed
- ✅ AC2: INVALID_FEEDBACK_TYPE returned for invalid feedback_type via Zod validation (before any mutation)
- ✅ AC3: MEMORY_NOT_FOUND returned for non-existent memory_id
- ✅ AC4: ENOTREADY returned when plugin not activated (graceful, no throw)
- ✅ All tasks completed: Types, errors, VectorStoreAdapter extension, tool implementation, tests
- ✅ Zod schema inline in tool (consistent with project pattern)
- ✅ computeConfidence() used correctly (accessCount=0 + 1 helpful = 0.5 confidence)
- ✅ upsert-by-id via db.insert() with explicit id (confirmed @ruvector/core supports it)
- ℹ️ Coverage thresholds: two global thresholds (functions 90%, branches 85%) remain below due to pre-existing gaps in memory-search-tool.ts and vector-store.ts (outside this story's scope)

### File List

**Created:**
- `src/tools/tools/memory-learn-tool.ts` (rewritten from stub)
- `tests/unit/tools/memory-learn-tool.test.ts`
- `tests/unit/tools/memory-learn-error-paths.test.ts`
- `tests/unit/vector/vector-store-get-update.test.ts`
- `tests/integration/feedback-roundtrip.test.ts`

**Modified:**
- `src/shared/types.ts` (added FeedbackType, MemoryFeedbackInput, MemoryFeedbackResult)
- `src/shared/errors.ts` (added FeedbackValidationError, MemoryNotFoundError, NotReadyError)
- `src/vector/vector-store.ts` (added getById(), updateMetadata(), MemorySearchItem import)
- `tests/unit/tools/tool-injector.test.ts` (updated ENOTIMPLEMENTED → INVALID_FEEDBACK_TYPE)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-21 | 3.1.0 | Story created with comprehensive architecture constraints, previous-story intelligence, and implementation guardrails | Antigravity |
| 2026-03-21 | 3.1.1 | Full implementation complete: types, errors, VectorStoreAdapter.getById/updateMetadata, memory-learn-tool.ts rewritten, 4 test files created, 183/183 tests passing | Antigravity |
