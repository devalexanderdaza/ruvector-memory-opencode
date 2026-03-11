# Story 2.6: Stack Detection and Project Metadata Enrichment

Status: done

---

## Story

As a developer,
I want the system to detect stack/language and associate it with each memory,
So that it enables contextual retrieval by technology/project.

## Acceptance Criteria

1. **Given** a project with detectable stack files (`package.json`, `tsconfig`, etc.)
   **When** project context initializes
   **Then** primary language/framework are identified
   **And** detection is deterministic for the same project state.

2. **Given** stack and project context are detected
   **When** a memory is saved or returned through search
   **Then** project metadata (project name, project type, language, framework/stack) is attached and persisted
   **And** metadata is available for indexing and search filters.

3. **Given** required context files are missing or malformed
   **When** stack detection runs
   **Then** the system degrades gracefully with safe defaults (no throw to tool caller)
   **And** structured diagnostics are logged for troubleshooting.

4. **Given** existing memory workflows from Stories 2.1-2.5
   **When** metadata enrichment is introduced
   **Then** existing save/search/injection behavior remains backward compatible
   **And** no regression is introduced in response contracts.

## Tasks / Subtasks

- [x] **Task 1: Expand Project Detection Model** (AC: 1, 3)
  - [x] Extend [src/detection/project-detector.ts](src/detection/project-detector.ts) to detect stack signals from `package.json`, `tsconfig.json`, `README.md`, and optional framework markers.
  - [x] Introduce a typed detection result in [src/shared/types.ts](src/shared/types.ts) that includes:
        `projectName`, `projectType`, `primaryLanguage`, `frameworks`, `stackSignals`.
  - [x] Keep explicit root override precedence unchanged (current behavior is correct and already tested).
  - [x] Add defensive parsing for malformed JSON and missing files.

- [x] **Task 2: Persist Project Metadata in memory_save** (AC: 2, 3)
  - [x] Update [src/tools/tools/memory-save-tool.ts](src/tools/tools/memory-save-tool.ts) to merge user metadata with detected project metadata.
  - [x] Ensure persisted metadata keys are normalized and stable (`projectContext`, `projectName`, `projectType`, `primaryLanguage`, `frameworks`).
  - [x] Preserve existing defaults from Story 2.1 (`tags`, `source`, `priority`, `confidence`).
  - [x] Verify metadata remains JSON-serializable for [src/vector/vector-store.ts](src/vector/vector-store.ts).

- [x] **Task 3: Surface Metadata in Search Response** (AC: 2, 4)
  - [x] Extend result mapping in [src/tools/memory-response-formatter.ts](src/tools/memory-response-formatter.ts) to include new project metadata fields.
  - [x] Keep existing response compatibility (`projectContext` optional remains valid).
  - [x] Add non-breaking optional fields to [src/shared/types.ts](src/shared/types.ts) search interfaces.

- [x] **Task 4: Enable Metadata Filters in Search** (AC: 2, 4)
  - [x] Extend `MemorySearchFilters` in [src/shared/types.ts](src/shared/types.ts) with project metadata filters:
        `project_name`, `project_type`, `primary_language`, `frameworks`.
  - [x] Validate and normalize filters in [src/tools/tools/memory-search-tool.ts](src/tools/tools/memory-search-tool.ts).
  - [x] Apply filtering in [src/vector/vector-store.ts](src/vector/vector-store.ts) without breaking existing tag/source/date filters.

- [x] **Task 5: Plugin Context Wiring** (AC: 1, 2, 3)
  - [x] In [src/core/plugin.ts](src/core/plugin.ts), store full detection context (not only root) during activation.
  - [x] Expose read-only accessor(s) for tool layer usage without circular dependencies.
  - [x] Keep background initialization non-blocking and graceful-degradation semantics intact.

- [x] **Task 6: Test Coverage and Regression Guardrails** (AC: 1-4)
  - [x] Expand [tests/unit/detection/project-detector.test.ts](tests/unit/detection/project-detector.test.ts) with stack/language detection cases.
  - [x] Add unit tests for metadata merge behavior in `memory_save` and filter validation in `memory_search`.
  - [x] Add integration tests to confirm metadata persistence + retrieval roundtrip and backward compatibility.
  - [x] Run full suite and ensure no regression in previously completed Epic 2 stories.

## Dev Notes

### Architecture & Integration Guardrails

- Node runtime requirement is `>=22` and this repo is ESM-first; keep imports on `node:*` modules.
- Current plugin lifecycle already centralizes project-context detection in [src/core/plugin.ts](src/core/plugin.ts); extend it there instead of duplicating detection logic in tools.
- `memory_save` currently builds metadata in one place ([src/tools/tools/memory-save-tool.ts](src/tools/tools/memory-save-tool.ts)); enrich there, do not add ad-hoc metadata mutation in multiple layers.
- `memory_search` filters are validated before store invocation; keep this contract to return structured validation errors.
- Vector metadata is serialized JSON in [src/vector/vector-store.ts](src/vector/vector-store.ts); new metadata must remain shallow, deterministic, and schema-stable.

### Previous Story Intelligence (2.5)

- Story 2.5 introduced passive context injection and emphasized strict graceful-degradation behavior; maintain the same no-throw contract for enrichment/detection paths.
- A prior bug came from mode-specific filtering behavior in passive mode; for 2.6 keep behavior explicit and covered by tests to avoid hidden branching regressions.
- `noUncheckedIndexedAccess` and lint constraints have already surfaced subtle undefined cases; use explicit guards for optional metadata fields.

### Git Intelligence Summary

Recent commits indicate progressive Epic 2 enhancements:
- `ba748b8` story 2.5 (injection)
- `5f39c12` review fixes for 2.4
- `848fa08` story 2.3 (metadata/time filters)
- `3f19967` stories 2.1 and 2.2 (standard metadata + composite scoring)

Implementation should reuse and extend existing metadata/filtering patterns from 2.1-2.4 instead of introducing parallel abstractions.

### Latest Technical Information

- Node.js v22 docs reinforce async `fs/promises` for non-blocking operations and explicit error handling over pre-check races.
- Path behavior differs across POSIX/Windows; use `path.resolve()`/`path.join()` consistently to keep detection deterministic across environments.
- Avoid race-prone pre-checks (e.g., checking access then reading); perform read directly and handle exceptions.

### Project Structure Notes

- Detection logic: [src/detection/project-detector.ts](src/detection/project-detector.ts)
- Plugin context lifecycle: [src/core/plugin.ts](src/core/plugin.ts)
- Save/search tool boundaries: [src/tools/tools/memory-save-tool.ts](src/tools/tools/memory-save-tool.ts), [src/tools/tools/memory-search-tool.ts](src/tools/tools/memory-search-tool.ts)
- Search response shaping: [src/tools/memory-response-formatter.ts](src/tools/memory-response-formatter.ts)
- Metadata persistence/filtering: [src/vector/vector-store.ts](src/vector/vector-store.ts)
- Type contracts: [src/shared/types.ts](src/shared/types.ts)

### Testing Standards

- Add deterministic fixture-based tests for stack detection (`package.json` only, `package.json + tsconfig`, malformed files, empty project).
- Validate metadata defaults remain stable when detection partially fails.
- Verify filter combinations (existing + new project filters) do not alter previous semantics.
- Include regression test for `projectContext` behavior expected by formatter tests.

## References

- [Epic 2 Story 2.6](../planning-artifacts/epics.md#story-26-stack-detection-and-project-metadata-enrichment)
- [FR21/FR22 Requirements](../planning-artifacts/prd.md)
- [Architecture: API and Integration Constraints](../planning-artifacts/architecture.md)
- [Current Detection Implementation](../../src/detection/project-detector.ts)
- [Current Save Metadata Flow](../../src/tools/tools/memory-save-tool.ts)
- [Current Search Formatting](../../src/tools/memory-response-formatter.ts)
- [Current Search Filters and Ranking](../../src/vector/vector-store.ts)
- [Previous Story 2.5 Learnings](./2-5-passive-injection-of-top-memories-into-agent-context.md)

## Dev Agent Record

### Agent Model Used

GPT-5.3-Codex

### Debug Log References

- `npm run typecheck`
- `npm test`

### Completion Notes List

- Implemented deterministic stack detection (`package.json`, `tsconfig.json`, `README.md`) with malformed JSON handling and structured diagnostics.
- Added typed project detection model and propagated enriched metadata through save, search filtering, and response formatting.
- Wired plugin-level project context caching/accessors with graceful fallback and non-blocking startup behavior.
- Added/updated unit and integration tests for detection, metadata enrichment, project filters, and response compatibility.
- Validated with full typecheck and test suite: 24 test files and 151 tests passing.
- Expanded framework heuristics (angular/astro/remix/solidjs/koa/hapi/adonisjs), added monorepo project-type detection via package workspaces, and improved malformed package diagnostics with file path + parser reason.
- Added detector regression tests for true cwd fallback outside git and malformed package warning payload; validated with full suite now at 24 test files and 156 tests passing.

### File List

- `src/core/plugin.ts` (modified)
- `src/detection/project-detector.ts` (modified)
- `src/shared/types.ts` (modified)
- `src/tools/tools/memory-save-tool.ts` (modified)
- `src/tools/tools/memory-search-tool.ts` (modified)
- `src/tools/memory-response-formatter.ts` (modified)
- `src/vector/vector-store.ts` (modified)
- `tests/unit/detection/project-detector.test.ts` (modified)
- `tests/unit/tools/memory-save-tool.test.ts` (modified)
- `tests/unit/tools/memory-search-tool.test.ts` (modified)
- `tests/unit/tools/memory-response-formatter.test.ts` (modified)
- `tests/integration/save-search.test.ts` (modified)
- `tests/unit/vector/metadata-parsing.test.ts` (modified)
- `tests/unit/vector/save-search.test.ts` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)
- `_bmad-output/implementation-artifacts/2-6-stack-detection-and-project-metadata-enrichment.md` (modified)

## Senior Developer Review (AI)

Date: 2026-03-11
Reviewer: Alexander
Outcome: Changes Requested

### Findings

1. **HIGH** - Relevance mapping can invert ranking semantics for boosted entries.
   - Evidence: `formatSearchResult()` computes `relevance` with `1 - Math.abs(vectorScore)` and then re-sorts by relevance descending.
   - Impact: Negative composite scores (which are *better* in distance semantics) are penalized by `Math.abs`, potentially reordering results in a way that contradicts vector-store ranking and Story 2.4/2.6 response expectations.
   - References: `src/tools/memory-response-formatter.ts:144`, `src/tools/memory-response-formatter.ts:193`

2. **HIGH** - AC3 is only partially implemented: missing-file diagnostics are not logged.
   - Evidence: Missing files are silently swallowed in `readTextFileSafely()` (`catch { return null; }`) without structured logging. Only malformed `package.json` emits a warning.
   - Impact: Troubleshooting required context detection failures is harder, and AC3 explicitly requires structured diagnostics for missing or malformed files.
   - References: `src/detection/project-detector.ts:93`, `src/detection/project-detector.ts:97`, `src/detection/project-detector.ts:112`

3. **MEDIUM** - `frameworks` is dropped from response when empty, despite being persisted and part of project metadata contract in this story.
   - Evidence: formatter only includes `frameworks` when `frameworks.length > 0`.
   - Impact: Consumers cannot distinguish between "metadata absent" and "metadata present but empty", reducing contract clarity for metadata-enriched responses.
   - References: `src/tools/memory-response-formatter.ts:132`, `src/tools/memory-response-formatter.ts:166`

4. **MEDIUM** - Git root detection misses common worktree/submodule setups where `.git` is a file.
   - Evidence: `findGitRoot()` requires `.git` to be a directory via `statSync(...).isDirectory()`.
   - Impact: Project root detection can fall back incorrectly in valid git environments, affecting deterministic root resolution and downstream metadata.
   - References: `src/detection/project-detector.ts:29`, `src/detection/project-detector.ts:30`

### AC Validation Summary

- AC1: **Pass** (core detection implemented; `.git` file-based root detection fixed for worktrees/submodules).
- AC2: **Pass** (metadata persisted and filterable; empty `frameworks: []` now preserved in response).
- AC3: **Pass** (graceful no-throw behavior confirmed; `project_detection_file_missing` debug log now emitted per missing file).
- AC4: **Pass** (155 tests passing; relevance inversion via `Math.abs` fixed; post-format sort is consistent with corrected relevance values).

### Suggested Follow-ups

- [x] [AI-Review][HIGH] Fix relevance conversion and avoid post-format reorder that can contradict composite distance ordering. [src/tools/memory-response-formatter.ts:144]
- [x] [AI-Review][HIGH] Add structured warning diagnostics for missing context files (`package.json`, `tsconfig.json`, `README.md`). [src/detection/project-detector.ts:93]
- [x] [AI-Review][MEDIUM] Preserve `frameworks: []` in formatted response when metadata exists but empty. [src/tools/memory-response-formatter.ts:166]
- [x] [AI-Review][MEDIUM] Support `.git` file-based repositories in root detection logic. [src/detection/project-detector.ts:30]

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-11 | 2.6.0 | Story created with architecture constraints, previous-story intelligence, and implementation guardrails | GitHub Copilot |
| 2026-03-11 | 2.6.1 | Implemented stack detection + metadata enrichment end-to-end, added project filters/response fields, and passed full regression suite | GitHub Copilot |
| 2026-03-11 | 2.6.2 | Senior Developer Review (AI): 2 HIGH + 2 MEDIUM findings recorded, status moved to in-progress | GitHub Copilot |
| 2026-03-11 | 2.6.3 | All 4 AI-Review findings resolved: Math.abs fixed, missing-file diagnostics added, frameworks:[] preserved, .git-as-file detection fixed; 155 tests passing, status moved to review | GitHub Copilot |
| 2026-03-11 | 2.6.4 | Follow-up review fixes applied: expanded stack heuristics, monorepo detection, richer malformed JSON diagnostics, added no-git fallback coverage; 156 tests passing, status moved to done | GitHub Copilot |
