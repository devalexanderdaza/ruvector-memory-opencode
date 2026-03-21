# Story 4.1: Full Memory Export to RVF

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story Foundation

**As a** developer,
**I want** to export project memory to a portable `.rvf` file,
**So that** I can back up, transfer, or reuse knowledge elsewhere.

**FRs implemented:** FR25, FR26

## Acceptance Criteria

1. **Given** an initialized project memory database with one or more saved memories
   **When** `memory_export()` is invoked (via the registered tool)
   **Then** a valid `.rvf` file is generated in the project's `.opencode/` directory
   **And** the file contains all memory vectors, metadata, confidence scores, and learning/feedback history

2. **Given** the exported `.rvf` artifact
   **When** the file structure is inspected
   **Then** it includes a version manifest, all memory entries with their embeddings, and all metadata fields (tags, source, priority, confidence, accessCount, feedbackHistory, patternKey, mergedIntoId, etc.)
   **And** the export is deterministic for the same database state

3. **Given** an empty memory database (zero memories)
   **When** `memory_export()` is invoked
   **Then** the tool returns a success response with a valid `.rvf` file containing zero memory entries
   **And** the manifest header is properly written

4. **Given** a degraded plugin state (vector store unavailable)
   **When** `memory_export()` is invoked
   **Then** a structured `ToolResponse` failure is returned with code `"ENOTREADY"` and an actionable message
   **And** no partial file is left on disk

## Tasks / Subtasks

- [x] Task 1: Define export contracts and types (AC: 1, 2)
  - [x] Add `MemoryExportInput`, `MemoryExportResult`, and `RvfManifest` interfaces to `src/shared/types.ts`
  - [x] Add Zod validation schema for export input (optional output path override, optional filters)
  - [x] Define RVF file format version constant (e.g. `RVF_FORMAT_VERSION = "1.0.0"`)

- [x] Task 2: Implement RVF exporter module (AC: 1, 2, 3)
  - [x] Create `src/import-export/` directory following architecture spec
  - [x] Create `src/import-export/index.ts` with public API `{ exportMemories }`
  - [x] Create `src/import-export/rvf-exporter.ts` with the core export logic
  - [x] Create `src/import-export/format-validator.ts` with RVF schema validation
  - [x] Exporter must iterate all memories from VectorStoreAdapter (use a new `listAll()` method or paginated approach)
  - [x] Serialize each memory: id, vector (Float32Array), all metadata fields, confidence, feedback history
  - [x] Write manifest header with: format version, export timestamp, source project name, memory count, vector dimensions
  - [x] Use JSON-based `.rvf` format for v1 (newline-delimited JSON: manifest line + one line per memory entry) for Git-friendliness (FR29 compatibility)

- [x] Task 3: Add `listAll()` capability to VectorStoreAdapter (AC: 1)
  - [x] Add `listAll(batchSize?: number)` method to `VectorStoreAdapter` in `src/vector/vector-store.ts`
  - [x] Method must return all stored memory entries with their vectors and parsed metadata
  - [x] Use the underlying `@ruvector/core` database iteration if available, or fallback to search with very high k
  - [x] Return `ToolResponse<{ entries: Array<{ id: string; vector: Float32Array | number[]; metadata: Record<string, unknown> }> }>`

- [x] Task 4: Create the `memory_export` tool (AC: 1, 3, 4)
  - [x] Create `src/tools/tools/memory-export-tool.ts` following existing tool factory pattern
  - [x] Integrate with `exportMemories` module
  - [x] Support optional `output_path` override
  - [x] Provide helpful error messages if export fails (e.g., disk full, permission denied)
- [x] Task 5: Register the tool in `tool-injector.ts` (AC: 1)
  - [x] Add `memory_export` to the centralized tool registry
  - [x] Ensure it's available via the OpenCode plugin interface
- [x] Task 6: Add unit tests (AC: 1, 2, 3, 4)
  - [x] Create `tests/unit/tools/memory-export-tool.test.ts`
  - [x] Create `tests/unit/import-export/rvf-exporter.test.ts`
  - [x] Test: successful export with multiple memories → correct manifest + entries
  - [x] Test: empty database → valid empty export
  - [x] Test: degraded mode → structured error response
  - [x] Test: export includes all metadata fields (confidence, feedbackHistory, tags, etc.)
  - [x] Test: deterministic output for same input state
  - [x] Test: format validator rejects malformed RVF files
- [x] Task 7: Add integration tests (AC: 1, 2)
  - [x] Create `tests/integration/memory-export.test.ts`
  - [x] End-to-end: save 5 memories with varied metadata → export → read file → verify all data present
  - [x] End-to-end: save memories, apply feedback, export → verify confidence scores and feedback history are included
  - [x] Verify file is valid JSON lines and parseable

## Dev Notes

### Technical Requirements

- **RVF File Format (v1)**: Use newline-delimited JSON (NDJSON) for v1 to maximize Git-friendliness (FR29 requirement). The format consists of:
  - **Line 1**: Manifest JSON object with schema version, export metadata
  - **Lines 2+**: One JSON object per memory entry with all data
- This approach is simpler than the full binary RVF Cognitive Container format (`@ruvector/rvf`) which is designed for production deployment. The plugin's export is a **data portability format**, not a deployment container. However, the file extension is `.rvf` as specified in the PRD.
- Future stories (4.4) will handle backward compatibility and format versioning, so include a clear `format_version` field now.

- **Atomic file writes**: Always write to a temporary file (e.g., `export.rvf.tmp`) and rename upon completion. This prevents corrupt partial files if process crashes mid-export.

- **NFR5 compliance**: Batch operations must complete in <5 seconds for typical projects. Use streaming writes (write line-by-line) rather than building entire file in memory.

- **Security (NFR10)**: The `hasSecretPattern` flag must be preserved in export metadata so importing projects can maintain secret awareness. Do NOT strip secrets from exports; preserve the flag for the consuming import operation to handle.

### Architecture Compliance

- **New subsystem**: `src/import-export/` is a NEW directory following architecture spec. It must have its own `index.ts` with explicit public API exports.
- **Subsystem load order**: `import-export/` is #9 in the dependency chain (after `learning/`). It depends on `vector/` (for data access) and `shared/` (types, errors, logger).
- **ToolResponse contract**: All tool handlers return `ToolResponse<T>`, never throw. Follow pattern from existing tools.
- **ESM imports**: All internal imports use `.js` extension.
- **Logger usage**: Use `logger` singleton from `src/shared/logger.ts`. Event names: `memory_export_started`, `memory_export_completed`, `memory_export_failed`.
- **Error codes**: Use `SCREAMING_SNAKE_CASE`. Specific codes: `ENOTREADY`, `EXPORT_WRITE_FAILED`, `EXPORT_NO_MEMORIES` (for info, not error).

### Library / Framework Requirements

- **No new dependencies**: The export feature uses only Node.js built-ins (`fs/promises`, `path`, `os`) and existing project dependencies (Zod for validation).
- **@ruvector/core**: Continue using as optional peer dependency. The export does NOT require `@ruvector/rvf` package — we're writing our own NDJSON-based `.rvf` format for portability.
- **Node.js ≥22**: Use modern APIs like `fs/promises.writeFile` with `{ flush: true }` for durability.

### File Structure Requirements

Files to create:
- `src/import-export/index.ts` — Public API: `{ exportMemories }`
- `src/import-export/rvf-exporter.ts` — Core export logic
- `src/import-export/format-validator.ts` — RVF schema validation
- `src/tools/tools/memory-export-tool.ts` — Tool handler factory

Files to modify:
- `src/shared/types.ts` — Add export-related interfaces
- `src/tools/tool-injector.ts` — Register `memory_export` tool
- `src/vector/vector-store.ts` — Add `listAll()` method

Test files to create:
- `tests/unit/tools/memory-export-tool.test.ts`
- `tests/unit/import-export/rvf-exporter.test.ts`
- `tests/integration/memory-export.test.ts`

### Testing Requirements

- Maintain project coverage thresholds: lines/statements/functions ≥ 90%, branches ≥ 85%
- Unit tests: mock VectorStoreAdapter, test tool input validation, test exporter serialization logic, test format validator
- Integration tests: use real filesystem via `.tmp-test-export/` directory pattern (clean up in `afterEach`)
- Call `resetPluginStateForTests()` in `afterEach` for any tests that activate the plugin
- Test naming: `it("verb + expected behavior", ...)`
- No `describe` nesting beyond 2 levels

### Previous Story Intelligence (from 3.6)

- Story 3.6 added `memory_learning_metrics` and `memory_learning_audit_history` tools, extending the tools subsystem and registering new tools through `src/tools/tool-injector.ts`. Follow the exact same registration pattern.
- The `feedbackHistory` field on memory metadata is stored as a flat semicolon-delimited string (not array). The exporter must preserve this format exactly.
- The `patternKey` field (from story 3.5) is stored in metadata for pattern auto-deprioritization tracking. Must be included in export.
- Metadata fields confirmed in use across all stories: `content`, `created_at`, `source`, `tags`, `priority`, `confidence`, `accessCount`, `positiveFeedbackCount`, `negativeFeedbackCount`, `feedbackHistory`, `patternKey`, `patternNegativeCount`, `patternThreshold`, `mergedIntoId`, `projectContext`, `projectName`, `projectType`, `primaryLanguage`, `frameworks`, `importance`, `hasSecretPattern`.
- The tool factory pattern used consistently: `createMemory<X>Tool()` returning a tool definition object with `name`, `description`, `parameters`, and `execute` function.

### Git Intelligence Summary

Recent commits show:
- Feature work followed by targeted hardening + coverage improvements
- Review-driven corrections are common around edge cases and contract consistency
- The `tool-injector.ts` file is frequently updated to register new tools — keep changes minimal and consistent
- All new tools follow the same non-throw, structured response pattern

## Latest Technical Information

- **Node.js 22**: `fs/promises.writeFile` supports `{ flush: true }` option for forced fsync — use for data durability
- **NDJSON format**: Standard newline-delimited JSON format widely supported. Each line is a valid JSON object. This is the most Git-friendly approach for `.rvf` export files
- **Atomic file rename**: `fs/promises.rename()` is atomic on POSIX systems within the same filesystem — use temp file in the same directory as target
- **Vitest 4.0.18**: Stable; use `vi.mock()` for mocking filesystem operations in unit tests
- **Zod 3.24.1**: Continue using for input validation; avoid regex-heavy patterns (known ReDoS concerns)

## RVF Export Format Specification (v1)

```
// Line 1: Manifest
{"format_version":"1.0.0","export_timestamp":"2026-03-21T...","source_project":"my-project","memory_count":42,"vector_dimensions":128}

// Lines 2+: One memory per line
{"id":"uuid-1","vector":[0.1,0.2,...],"metadata":{"content":"...","created_at":"...","confidence":0.7,...}}
{"id":"uuid-2","vector":[0.3,0.4,...],"metadata":{"content":"...","created_at":"...","confidence":0.5,...}}
```

This format satisfies:
- **FR25**: Portable `.rvf` file
- **FR26**: Includes vectors, metadata, confidence scores, and learning history
- **FR29 (future)**: Git-friendly (text-based, diff-able line-by-line)
- **NFR5**: Streamable write (no full in-memory buffer needed)
- **NFR24**: Framework-agnostic and versioned

## Project Context Reference

- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 4`]
- [Source: `_bmad-output/planning-artifacts/architecture.md#import-export subsystem`]
- [Source: `_bmad-output/planning-artifacts/prd.md#FR25-FR26`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `docs/ruvector/rvf-cognitive-containers.md`]
- [Source: `_bmad-output/implementation-artifacts/3-6-learning-metrics-and-audit-history.md`]

---

**Completion Note:** Ultimate context engine analysis completed — comprehensive developer guide created.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
