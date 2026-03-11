/**
 * Lightweight token estimation for context budget management.
 *
 * Uses a ~4 chars/token heuristic—a well-established approximation for
 * English text and code. This avoids runtime dependency on tiktoken or
 * similar libraries while providing accurate-enough estimates for budget
 * enforcement purposes.
 *
 * For reference: OpenAI tokenization typically produces 1 token per ~4 chars
 * for English prose. Code and unicode vary, but this heuristic is safe as a
 * worst-case estimate.
 */

const CHARS_PER_TOKEN = 4;

/**
 * Estimates the number of tokens in a text string.
 * Uses ceil(length / 4) heuristic.
 *
 * @param text - Input string to estimate tokens for
 * @returns Estimated token count (always >= 0)
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Greedily selects items from a list whose combined content fits within
 * the given token budget. Items are selected in order (first item has
 * highest priority), and selection stops as soon as adding the next item
 * would exceed the remaining budget.
 *
 * @param items - Ordered list of items with a `content` string field
 * @param maxTokens - Maximum total token budget (0 returns empty array)
 * @returns Subset of items whose total content fits within the budget
 */
export function selectWithinTokenBudget<T extends { content: string }>(
  items: T[],
  maxTokens: number,
): T[] {
  if (maxTokens <= 0) return [];

  let remaining = maxTokens;
  const selected: T[] = [];

  for (const item of items) {
    const tokens = estimateTokens(item.content);
    if (tokens > remaining) break;
    selected.push(item);
    remaining -= tokens;
  }

  return selected;
}
