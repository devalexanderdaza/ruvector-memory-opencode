# Story 3.2: Positive Feedback Reinforcement

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want helpful feedback to improve memory confidence,
so that high-quality memories appear more often in future retrievals.

## Acceptance Criteria

1. **Given** a memory with one or more `helpful` events
   **When** ranking is recalculated
   **Then** its confidence score increases according to documented rules
   **And** score changes are bounded to prevent runaway amplification

## Tasks / Subtasks

- [x] **Task 1: Verify Confidence Computation for Positive Feedback (AC: 1)**
  - [x] Analyze `computeConfidence` in `src/vector/confidence-calculator.ts` to ensure it bounds score changes appropriately for positive feedback.
  - [x] Confirm that `memory-learn-tool.ts` correctly triggers the recalculation when `helpful` feedback is received.
  - [x] If confidence doesn't scale as expected, adjust the `confidence-calculator.ts` formula to meet criteria.
- [x] **Task 2: Verify Ranking Impact in Search (AC: 1)**
  - [x] Verify that `memory-search-tool.ts` integrates the updated confidence score when ranking results and that this effectively boosts positive-feedback items over neutral ones.
- [x] **Task 3: Integration Tests**
  - [x] Add explicit integration tests in `tests/integration/feedback-ranking.test.ts` focusing on the impact of `helpful` feedback on search ranking results order.
  - [x] Verify that a memory receiving `helpful` feedback jumps ahead of an identical memory with no feedback.

## Dev Notes

### Architecture & Integration Guardrails

- The `memory-learn-tool.ts` was fully implemented in story 3.1, including updating `positiveFeedbackCount` and recomputing confidence.
- `computeConfidence` in `confidence-calculator.ts` should already enforce bounds `[-1.0, 1.0]`, but this story requires verifying that "helpful" feedback specifically scales well without runaway amplification.
- `memory-search-tool.ts` should integrate the confidence score into its composite scoring. Ensure that an increase in confidence measurably improves the search result rank.
- **Never throw from tool handlers** — always return `{ success: false, ... }`
- **Never use `console.log`** — always use `logger` singleton
- **Test files location**: `tests/unit/` mirrors `src/` structure. `tests/integration/` for roundtrip tests.
- **Coverage thresholds**: Lines 90%, Branches 85%, Functions 90%, Statements 90%.

### Previous Story Intelligence

Key learnings from Story 3.1:

- We successfully implemented atomic metadata updates via `VectorStoreAdapter.updateMetadata`.
- The confidence score is recomputed immediately on feedback, so search results should reflect it instantly.
- The `VectorStoreAdapter` now handles merging of the current metadata seamlessly. This means we don't need to rebuild `updateMetadata` logic.
- We must remember that `accessCount` is NOT incremented by the feedback tool, only by search! Confidence needs both to reach `1.0`.

### Git Intelligence Summary

Recent commits show:

- `52664a9` — chore: deleted temp and runtime folders and files generated on run test
- `1c21b49` — chore(story-3.1): mark story as done in sprint status
- `295a026` — feat(story-3.1): implement memory_learn_from_feedback tool
This confirms that the `memory_learn_from_feedback` tool is solidly in place, making this story mostly about verification, fine-tuning the formula if necessary, and adding robust tests for the ranking aspect.

### Project Structure Notes

- Keep tests isolated. Use `process.cwd()/.tmp-{name}-tests` for real filesystem tests and clean up in `afterEach`.

### References

- [Epic 3 Story 3.2 in Epics](../planning-artifacts/epics.md#story-32-positive-feedback-reinforcement)
- [FR13 Requirements](../planning-artifacts/prd.md)

## Dev Agent Record

### Agent Model Used

Antigravity (Gemini 2.5 Pro)

### Debug Log References

### Completion Notes List

- Verified `computeConfidence` uses proper scaling (`[-1.0, 1.0]` bound via proportional `totalFeedback`).
- Fixed default `confidence` parameter in `memory_save` to properly use `0.0` (Neutral), resolving logic mismatch with `legacy` behavior that mapped legacy items to `0.0`.
- Ensured VectorStoreAdapter normalises between `[-1.0, 1.0]` for the composite score `confidenceBoost`, thus making a neutral item with 0.0 effectively score appropriately and penalising only `< 0.0`.
- Verified ranking behavior with new integration test verifying identical strings order differently when one gets helpful feedback.

### File List

- `src/vector/vector-store.ts`
- `src/tools/tools/memory-save-tool.ts`
- `tests/integration/feedback-ranking.test.ts`

### Change Log

- Addressed confidence scoring issue: updated `memory-save-tool` to save `0.0` default instead of `0.5`, allowing `[-1.0, 1.0]` range interpretation in the vector database Adapter.
- Updated `vector-store.ts` mapping range from raw confidence bounds restricting negative weights improperly.
- Created `tests/integration/feedback-ranking.test.ts` verifying explicit reranking priority boost on neutral vectors updated with feedback.
