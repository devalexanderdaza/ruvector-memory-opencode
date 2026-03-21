# Story 3.4: Duplicate Detection and Memory Merge Workflow

Status: in-progress

## Story Foundation

**As a** maintainer,
**I want** duplicate feedback to enable merge/deduplication,
**So that** redundant memories do not fragment ranking quality.

**FRs implemented:** FR15

**Then** merged records remain auditable with reversible metadata links (e.g., `mergedIntoId`, `duplicateOf`)

## Task List

- [x] Task 1: Handle `duplicate` feedback type in `memory_learn_from_feedback`
- [x] Task 2: Implement Merging Strategy (metadata linkage + confidence penalization)
- [x] Task 3: Update `MemoryFeedbackInput` and `MemoryFeedbackResult` types
- [x] Task 4: Ensure duplicate records are auditable (via `mergedIntoId` in search results)
- [x] Task 5: Add integration tests for duplicate detection and merging
- [ ] Task 6: Address code review findings (see _bmad-output/review-findings.md)

## Developer Context & Guardrails

### Technical Requirements

- The `memory_learn_from_feedback` tool must be updated to handle `feedback_type === "duplicate"`.
- A merging strategy must be implemented: when a memory is marked as a duplicate of another, one becomes canonical. The duplicate memory should be marked with a metadata field `mergedIntoId` pointing to the canonical memory, and its active status or confidence should be severely reduced (e.g., effectively archived or excluded from normal search if possible, or confidence set to -1.0 so it ranks at the absolute bottom).
- The canonical memory should ideally inherit the `accessCount`, `helpfulCount`, etc., of the duplicated memory, OR simply remain the active canonical source while the duplicate is removed from search. Choose the simplest robust implementation.
- All relationships must be stored in the metadata (which is a flat `Record<string, unknown>`).
- If this operation requires matching text to find a canonical memory automatically, ensure the vector search is utilized. Alternatively, if the user explicitly provides the canonical ID, validate it exists.

### Architecture Compliance

- **Flat Metadata Only**: The DB structure requires all `metadata` fields to be a flat `Record<string, unknown>`. Do not use nested objects to store duplicate links. Use simple string fields like `mergedIntoId: "canonical-id-123"`.
- **Zod Validation**: Update any Zod schemas (e.g., for `memory_learn_from_feedback` if accepting an optional `canonicalId` parameter) to validate inputs.
- **Graceful Degradation**: Tools must not throw. Always return `ToolResponse<T>` with a discriminated union `{ success: false, code: string, error: string }`.

### Previous Story Intelligence

- **Learnings from 3.3 (Negative Feedback)**:
  - We had a "metadata bleeding bug" where `feedbackSource` and `feedbackContext` needed to be cleanly deleted or overwritten. Ensure duplicate metadata updates cleanly.
  - We use a confidence penalty to drop memories to the bottom of the rank (-1.0 confidence). You can apply a similar penalty to the deprecated/duplicate memory so it won't show up in standard searches.
  - `memory_learn_from_feedback(memory_id, feedback_type)` was already updated to track counts (`incorrectCount`, `outdatedCount`). For duplicates, we need to track the linkage.

### File Structure Requirements

- `src/tools/tools/memory-learn-tool.ts`: Likely the main file to update.
- `src/core/memory-manager.ts` (or similar depending on db/vector abstraction logic): To handle the actual merge math/linking.
- `tests/unit/tools/memory-learn-tool.test.ts`
- `tests/integration/feedback-ranking.test.ts` or `tests/integration/duplicate-merge.test.ts` for end-to-end integration tests.

### Testing Requirements

- Vitest coverage must remain above 90% (statements, branches, functions, lines).
- In tests, use `resetPluginStateForTests()` inside `afterEach` to prevent test pollution.
- Create a dedicated integration test showing two similar memories merged, with the duplicate disappearing from top search results while the canonical one remains or gets boosted.

## Dev Agent Record

### Agent Model Used

Antigravity (Gemini 2.5 Pro)

### Implementation Plan

1. **Analyze Tool Schema**: Check `memory_learn_from_feedback` schema in `src/tools/tools/memory-learn-tool.ts`.
2. **Add `duplicate` type**: Update feedback type enum/union to include "duplicate".
3. **Add `canonicalId` field**: Update the tool's parameter schema to accept an optional `canonicalId`.
4. **Implement Linkage Logic**: In `MemoryManager`, implement a method to link a duplicate memory to a canonical one using flat metadata (`duplicateOf`, `mergedIntoId`).
5. **Implement Confidence Hit**: Ensure duplicate memories get a massive confidence penalty (-1.0) so they don't appear in searches.
6. **Tests**: Create `tests/integration/duplicate-merge.test.ts`.

### Completion Notes

- Implemented `duplicate` feedback type requiring `canonical_id`.
- Duplicate memories now have their confidence forced to -1.0.
- Added `mergedIntoId` and `duplicateOf` to metadata for auditability.
- Exposed `mergedIntoId` in `SearchResult` returned by `memory_search`.
- Verified with new integration test `tests/integration/duplicate-merge.test.ts` and existing suite.

### File List

- `src/shared/types.ts`
- `src/vector/confidence-calculator.ts`
- `src/tools/tools/memory-learn-tool.ts`
- `src/tools/memory-response-formatter.ts`
- `tests/integration/duplicate-merge.test.ts`
- `tests/integration/feedback-roundtrip.test.ts`

### Change Log

- **2026-03-21**: Initial implementation of Story 3.4.
- **2026-03-21**: Added `canonical_id` to feedback tool and linkage in metadata.
- **2026-03-21**: Updated confidence formula to prioritize duplicate flag.
- **2026-03-21**: Fixed regression in `feedback-roundtrip.test.ts`.

## Project Context Reference

[Source: _bmad-output/project-context.md]

- The vector DB stores metadata as a JSON-serialized string (use `parseMetadata()` and stringify properly).
- Events must be logged using `logger.info("memory_merged", { ... })`. No `console.log`.

---

**Completion Note:** Ultimate context engine analysis completed - comprehensive developer guide created.
