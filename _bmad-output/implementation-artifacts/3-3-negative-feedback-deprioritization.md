# Story 3.3: Negative Feedback Deprioritization

**Status**: done

## Story

As a developer,
I want incorrect/outdated feedback to reduce confidence,
So that low-quality memories are less likely to influence agent responses.

## Acceptance Criteria

- [x] **Given** a memory marked `incorrect` or `outdated`  
  **When** ranking is recalculated  
  **Then** its confidence score decreases according to policy  
- [x] **Given** a memory with 3 or more negative reports  
  **When** ranking is recalculated  
  **Then** it is essentially removed from normal context prominence (confidence drops significantly)  
- [x] **Given** negative feedback is applied  
  **When** metadata is inspected  
  **Then** the memory remains traceable for audit without being permanently deleted  

## Task List

- [x] **Task 1: Update Confidence Calculation**  
- [x] **Task 2: Update Memory Learn Tool (AC: 1)**  
- [x] **Task 3: Integration Tests**  
- [x] **Task 4: Story Verification and Review**  

## Dev Notes

### Implementation Details

- **Confidence Formula**: Now uses a 2x penalty weight for negative feedback by default, and a 3x penalty once a memory reaches 3+ negative reports (FR16). This ensures rapid deprioritization of bad data while preserving the 0.5 baseline for memories with high usage but no feedback.
- **Auditability**: `memory_learn_from_feedback` now tracks `incorrectCount` and `outdatedCount` as distinct metadata fields, fulfilling the requirement for traceability without the need for immediate deletion.
- **Search Impact**: Integration tests verify that an "incorrect" memory drops significantly below newly created or helpful memories (e.g., dropping from 0.05 to -0.95 confidence).

### Dev Agent Record

#### Agent Model Used

Antigravity (Gemini 2.5 Pro)

#### Completion Notes

All acceptance criteria met. Unit tests in `tests/unit/vector/confidence-deprioritization.test.ts` and integration tests in `tests/integration/feedback-ranking.test.ts` pass and confirm the desired behavior.

**[AI Review Fixes Applied]**

- Fixed auto-deprioritization logic dropping confidence to -1.0 reliably after 3 negative feedbacks, regardless of positive feedback.
- Fixed math bug where negative penalty did not scale properly. Modified formula to scale negative feedback progressively.
- Fixed metadata bleeding bug in `memory_learn_from_feedback` to cleanly delete stale `feedbackSource` and `feedbackContext`.
- Untracked unit test file `tests/unit/vector/confidence-deprioritization.test.ts` was properly tracked in git.

#### File List

- `src/vector/confidence-calculator.ts`
- `src/tools/tools/memory-learn-tool.ts`
- `tests/unit/vector/confidence-deprioritization.test.ts`
- `tests/integration/feedback-ranking.test.ts`
- `tests/unit/tools/memory-response-formatter.test.ts`
