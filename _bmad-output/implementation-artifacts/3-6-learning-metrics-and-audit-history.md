# Story 3.6: Learning Metrics and Audit History

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story Foundation

**As a** product owner,  
**I want** visibility into learning metrics and feedback history,  
**So that** I can assess learning velocity and governance quality.

**FRs implemented:** FR17, FR18

## Acceptance Criteria

1. **Given** accumulated feedback events  
   **When** learning metrics are requested  
   **Then** the system returns hit rate, feedback trend, and learning velocity indicators
2. **Given** history records are queried  
   **When** audit history is requested  
   **Then** history includes who/what/when details needed for auditability

## Tasks / Subtasks

- [x] Task 1: Define metrics and audit response contracts (AC: 1, 2)
  - [x] Add/confirm normalized metric definitions for hit rate, trend, and learning velocity.
  - [x] Define stable response payloads for metrics and audit history with explicit field names and types.
  - [x] Preserve existing `ToolResponse<T>` success/failure shape and non-throw behavior.
- [x] Task 2: Implement metrics aggregation pipeline (AC: 1)
  - [x] Aggregate feedback events into indicators from existing persisted learning data.
  - [x] Ensure deterministic calculations for same inputs and bounded defaults for sparse data.
  - [x] Keep computation non-blocking and aligned with plugin graceful degradation.
- [x] Task 3: Implement auditable history retrieval (AC: 2)
  - [x] Expose actor/source, action/feedback type, target memory identifiers, and timestamp fields.
  - [x] Ensure records remain queryable without breaking existing metadata compatibility.
  - [x] Maintain flat metadata handling patterns used across tools/logging.
- [x] Task 4: Integrate with existing tooling and architecture boundaries (AC: 1, 2)
  - [x] Reuse existing learning/tool pathways instead of creating parallel persistence flows.
  - [x] Add only minimal new code in touched modules; avoid duplicate logic or ad-hoc formats.
  - [x] Ensure logger events are structured and reusable for future governance/reporting.
- [x] Task 5: Add tests for correctness and regression safety (AC: 1, 2)
  - [x] Unit tests for metric calculations, boundaries, and deterministic output.
  - [x] Integration tests for end-to-end query of metrics and history from real feedback records.
  - [x] Regression tests to confirm story 3.4/3.5 behavior remains unchanged.

## Dev Notes

### Technical Requirements

- Reuse the established feedback and learning flow in `src/tools/tools/memory-learn-tool.ts`; do not introduce a second learning pipeline.
- Keep public/tool contracts in `ToolResponse<T>` format and never throw from handlers.
- Keep metadata/log payloads flat (`Record<string, unknown>` without nested objects) to preserve existing parsing and analytics assumptions.
- Ensure calculations are deterministic and bounded; avoid unbounded counters/scores that can skew ranking or reporting.
- Support graceful degradation: if vector/memory subsystem is unavailable, return structured non-fatal responses with actionable codes/messages.

### Architecture Compliance

- Maintain current subsystem boundaries:
  - Tool-facing behavior under `src/tools/`
  - Confidence/scoring and memory persistence concerns under `src/vector/`
  - Shared contracts and error semantics under `src/shared/`
- Preserve ESM import style with `.js` suffix for internal imports.
- Use project logger (`src/shared/logger.ts`) only; never `console.*`.
- Follow naming/organization conventions from architecture and project-context artifacts.

### Library / Framework Requirements

- Runtime baseline remains Node.js `>= 22`.
- Validation boundaries continue with Zod and current project contract style.
- Test stack remains Vitest.
- Web intel for developer awareness:
  - Biome has newer stable releases beyond versions captured in planning docs; avoid introducing incompatible config keys without verifying current local setup.
  - Zod `3.24.1` has known ReDoS concerns around email regex paths; this story should avoid expanding regex-heavy validation surfaces and should prefer existing schemas/patterns until dependency upgrade strategy is explicitly approved.

### File Structure Requirements

- Primary implementation target:
  - `src/tools/tools/memory-learn-tool.ts`
- Likely supporting updates (if needed by contract/aggregation responsibilities):
  - `src/shared/types.ts`
  - `src/tools/memory-response-formatter.ts`
  - `src/vector/confidence-calculator.ts`
  - `src/vector/vector-store.ts`
- Test files:
  - `tests/unit/tools/memory-learn-tool.test.ts`
  - `tests/integration/` (new metrics/audit scenario file if required)

### Testing Requirements

- Preserve project coverage thresholds (lines/statements/functions >= 90%, branches >= 85%).
- Add deterministic unit coverage for metric computations and edge cases (empty history, sparse feedback, repeated events).
- Add integration coverage proving audit history contains who/what/when fields for returned records.
- Verify no throw-paths in tool handlers and retention of actionable error codes/messages.
- Maintain regression protections for duplicate-merge and pattern auto-deprioritization behavior from stories 3.4 and 3.5.

### Previous Story Intelligence (from 3.5)

- Story 3.5 introduced deterministic pattern identity, threshold-triggered auto-deprioritization, and policy audit logs.
- Metadata fields such as `patternKey`, `patternNegativeCount`, `patternThreshold`, and rationale markers are now part of learning context and should be leveraged, not redefined.
- Preserve established validation semantics and non-throw formatting behavior to avoid regressions observed/handled in prior review cycles.
- Keep duplicate-related semantics (`mergedIntoId`, canonical linkage) stable and compatible with any aggregated metrics views.

### Git Intelligence Summary

Recent commit pattern indicates:

- Feature work is followed by targeted hardening commits and coverage improvements.
- Review-driven corrections are common around edge cases and contract consistency.
- For this story, ship metric/audit behavior with first-pass boundary tests to minimize follow-up fixes.

## Latest Technical Information

- Vitest `4.0.18` remains a stable baseline in current project context; maintain compatibility with current test infrastructure before considering beta-only features.
- Biome ecosystem is evolving quickly (v2.x line); story changes should avoid toolchain drift and keep current repo config authoritative.
- Zod vulnerability tracking indicates security considerations around regex-heavy email validation paths in older 3.x ranges; avoid adding new risky regex-validation paths in this story and prefer existing safe schema usage.

## Project Context Reference

- [Source: `_bmad-output/planning-artifacts/epics.md`]
- [Source: `_bmad-output/planning-artifacts/architecture.md`]
- [Source: `_bmad-output/implementation-artifacts/3-5-pattern-level-auto-deprioritization.md`]
- [Source: `_bmad-output/project-context.md`]

---

**Completion Note:** Ultimate context engine analysis completed - comprehensive developer guide created.

## Dev Agent Record

### Agent Model Used

gpt-5.3-codex-low

### Debug Log References

- Added new response contracts in `src/shared/types.ts` for metrics and audit history payloads.
- Added `memory_learning_metrics` tool with deterministic, bounded aggregation from persisted metadata.
- Added `memory_learning_audit_history` tool returning actor/action/memory/timestamp records from flat feedback history entries.
- Extended `memory_learn_from_feedback` to append flat `feedbackHistory` entries and emit structured `feedback_audit_recorded` events.
- Registered new tools through `src/tools/tool-injector.ts` with existing `ToolResponse<T>` non-throw behavior.
- Added unit/integration test coverage for correctness, sparse defaults, deterministic output, and regression safety.

### Completion Notes List

- Implemented AC1 by exposing normalized learning metrics (`hit_rate`, trend, and velocity) via `memory_learning_metrics`.
- Implemented AC2 by exposing auditable history (`actor`, `action`, `memory_id`, `timestamp`, optional `context`) via `memory_learning_audit_history`.
- Preserved non-throw `ToolResponse<T>` contracts and graceful degradation pathways for both new tools.
- Preserved flat metadata/logging patterns by storing feedback history as flat string entries under `feedbackHistory`.
- Verified story behavior with full `npm test` pass and new focused unit/integration coverage.

### File List

- `_bmad-output/implementation-artifacts/3-6-learning-metrics-and-audit-history.md`
- `src/shared/types.ts`
- `src/tools/tool-injector.ts`
- `src/tools/tools/memory-learn-tool.ts`
- `src/tools/tools/memory-learning-metrics-tool.ts`
- `src/tools/tools/memory-learning-audit-history-tool.ts`
- `tests/unit/tools/memory-learn-tool.test.ts`
- `tests/integration/learning-metrics-audit-history.test.ts`
- `tests/unit/tools/tool-injector.test.ts`
- `tests/unit/tools/memory-save-tool-extra.test.ts`

### Change Log

- **2026-03-21**: Added learning metrics and audit history tool contracts and registration.
- **2026-03-21**: Implemented deterministic metrics aggregation and auditable feedback history retrieval on top of existing persisted metadata.
- **2026-03-21**: Extended feedback persistence with flat history entries and structured audit logging event.
- **2026-03-21**: Added unit/integration tests and regression-safe assertions; validated with full test suite.
