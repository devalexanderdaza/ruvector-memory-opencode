# Story 3.5: Pattern-Level Auto-Deprioritization

Status: done

## Story Foundation

**As a** team lead,  
**I want** repeated corrections of the same bad pattern to trigger automatic deprioritization,  
**So that** the system stops re-suggesting known low-quality patterns.

**FRs implemented:** FR16

## Acceptance Criteria

1. **Given** a pattern corrected at least 3 times  
   **When** the learning engine evaluates pattern quality  
   **Then** related memories are automatically deprioritized per policy
2. **Given** an automatic pattern deprioritization decision  
   **When** the operation completes  
   **Then** an audit event is recorded with rationale and impacted memory IDs

## Tasks / Subtasks

- [x] Task 1: Define and persist pattern identity for negative feedback aggregation (AC: 1, 2)
  - [x] Add deterministic pattern key derivation for memory feedback (content/category/source-based, flat metadata only).
  - [x] Store/update pattern counters in metadata fields that remain serializable and backward-compatible.
- [x] Task 2: Implement threshold policy and automatic deprioritization (AC: 1)
  - [x] Trigger auto-deprioritization when repeated corrections reach threshold `>= 3`.
  - [x] Apply bounded confidence penalty and/or explicit metadata flag that ensures ranking deprioritization.
  - [x] Ensure already merged duplicates (`mergedIntoId`) remain correctly deprioritized and not re-promoted.
- [x] Task 3: Add audit logging for policy actions (AC: 2)
  - [x] Emit structured logger event with pattern key, rationale, threshold, and impacted IDs.
  - [x] Include enough metadata for future metrics story (3.6) without introducing nested metadata objects.
- [x] Task 4: Extend tool contract behavior where needed (AC: 1, 2)
  - [x] Keep `memory_learn_from_feedback` return/error contract as `ToolResponse<T>` and never throw.
  - [x] Preserve existing validation semantics (`INVALID_*`, `MISSING_*`, `CANONICAL_NOT_FOUND`, etc.).
- [x] Task 5: Test end-to-end and regression safety (AC: 1, 2)
  - [x] Add integration test(s) demonstrating 3 repeated corrections of same pattern cause deprioritization.
  - [x] Add unit tests for threshold boundary (2 -> no trigger, 3 -> trigger, >3 -> stable behavior).
  - [x] Verify duplicate-merge behavior from story 3.4 is not regressed.

## Dev Notes

### Technical Requirements

- Reuse existing feedback flow in `src/tools/tools/memory-learn-tool.ts`; do not introduce a parallel learning path.
- Threshold policy for FR16 is explicit: trigger after **at least 3** repeated corrections of the same pattern.
- Keep metadata as flat `Record<string, unknown>` values; no nested objects in persistence or logs.
- Confidence updates must remain bounded and deterministic (`[-1.0, 1.0]`) and compatible with current ranking behavior.
- Tool handlers must never throw; always return structured `ToolResponse<T>` failures with actionable codes/messages.

### Architecture Compliance

- Respect current plugin/tool architecture:
  - Tool registration through `src/tools/tool-injector.ts`
  - Feedback handling in `src/tools/tools/memory-learn-tool.ts`
  - Confidence computation in `src/vector/confidence-calculator.ts`
  - Search/ranking behavior in `src/tools/tools/memory-search-tool.ts` and `src/vector/vector-store.ts`
- Use the project logger (`src/shared/logger.ts`), never `console.*`.
- Keep internal imports with `.js` suffix and maintain strict TypeScript constraints.

### Library / Framework Requirements

- Node.js runtime baseline remains `>= 22`.
- Validation boundaries continue to use Zod.
- Test stack remains Vitest.
- Web intel note: Zod `3.24.1` is reported externally with a ReDoS concern in email regex paths; this story does not require email validation, but do not expand regex-heavy validation here. If schema surface grows, consider upgrade planning separately.

### File Structure Requirements

- Primary implementation target: `src/tools/tools/memory-learn-tool.ts`
- Likely supporting updates:
  - `src/shared/types.ts` (if result metadata/typing needs extension)
  - `src/vector/confidence-calculator.ts` (if policy signal integration is needed)
  - `src/tools/memory-response-formatter.ts` (if exposing new audit-relevant fields is required)
- Test files:
  - `tests/unit/tools/memory-learn-tool.test.ts`
  - `tests/integration/` (new file for pattern auto-deprioritization scenario)

### Testing Requirements

- Maintain project thresholds: lines/statements/functions >= 90%, branches >= 85%.
- Add explicit regression coverage for story 3.4 behavior (duplicate handling and `mergedIntoId` semantics).
- Validate no throw-paths in tool code and clear error codes for invalid inputs.
- Use `resetPluginStateForTests()` in `afterEach` where plugin state is exercised.

### Previous Story Intelligence (from 3.4)

- Duplicate handling already introduced:
  - `feedback_type: "duplicate"` requires `canonical_id`
  - Metadata link fields `mergedIntoId` / `duplicateOf`
  - Forced low confidence behavior for duplicate-marked memories
- Preserve existing validation/error codes and updated tests from story 3.4; do not relax them.
- Keep metadata hygiene patterns: explicit overwrite/remove behavior for optional fields (`feedbackSource`, `feedbackContext`) to avoid stale values.

### Git Intelligence Summary

Recent commit pattern shows:

- Story 3.4 was hardened through iterative fixes and test expansion.
- Coverage-focused commits are frequent and expected.
- Small corrective commits after review are common; design this story to minimize follow-up by shipping boundary and regression tests in first pass.

## Project Context Reference

- [Source: `_bmad-output/planning-artifacts/epics.md`]
- [Source: `_bmad-output/planning-artifacts/architecture.md`]
- [Source: `_bmad-output/implementation-artifacts/3-4-duplicate-detection-and-memory-merge-workflow.md`]
- [Source: `_bmad-output/project-context.md`]

---

**Completion Note:** Ultimate context engine analysis completed - comprehensive developer guide created.

## Dev Agent Record

### Debug Log

- Added deterministic pattern identity in `memory_learn_from_feedback` with SHA-256 derived key from normalized `content|feedback_type|source`.
- Added flat metadata fields for policy state: `patternKey`, `patternCategory`, `patternSource`, `patternNegativeCount`, `patternThreshold`, `patternAutoDeprioritized`, `patternDeprioritizedAt`, `patternRationale`.
- Implemented related-memory scan and propagation when threshold is reached, including safety handling for partial updates.
- Added structured audit event `pattern_auto_deprioritized` with rationale and impacted IDs.
- Refined confidence boundary behavior so full `-1.0` auto-deprioritization starts at 3+ negative feedback events.

### Completion Notes

- Implemented FR16 threshold policy (`>= 3`) and automatic deprioritization for repeated negative feedback patterns.
- Preserved `ToolResponse<T>` non-throw contract and existing validation error semantics in feedback flow.
- Added tests for threshold boundaries (2/3/>3), pattern-level propagation, and duplicate non-repromotion regression.
- Aligned malformed formatter-structure test with existing non-throw formatter behavior to keep full suite passing.
- Full regression suite now passes with story changes.

### File List

- `src/tools/tools/memory-learn-tool.ts`
- `src/vector/confidence-calculator.ts`
- `tests/unit/tools/memory-learn-tool.test.ts`
- `tests/integration/duplicate-merge.test.ts`
- `tests/unit/tools/memory-response-formatter.test.ts`
- `_bmad-output/implementation-artifacts/3-5-pattern-level-auto-deprioritization.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- **2026-03-21**: Implemented pattern-level auto-deprioritization policy with deterministic pattern keys, threshold enforcement (`>=3`), related-memory propagation, and audit logging.
- **2026-03-21**: Added/updated unit and integration tests for threshold boundaries, stable post-threshold behavior, and duplicate merge regression safety.
- **2026-03-21**: Updated malformed formatter structure unit test to match the established non-throw formatter contract.
- **2026-03-21**: Code review remediations applied for global pattern threshold counting, semantic related-memory grouping, and stronger policy audit payload fields.

## Senior Developer Review (AI)

- Review outcome: **Approve**
- Review date: 2026-03-21
- Summary: Story 3.5 now satisfies FR16/ACs with threshold counting across related memories, automatic deprioritization of related memories, and structured policy audit logging.

### Action Items

- [x] [HIGH] Fix threshold accounting to evaluate corrections at pattern level (not only current memory).
- [x] [HIGH] Broaden related-memory matching beyond exact-content identity to semantically related candidates.
- [x] [MEDIUM] Improve audit event payload for downstream metrics by adding explicit impacted count and normalized impacted IDs field.
- [x] [MEDIUM] Reconcile story traceability with actual changed files and review-driven updates.
