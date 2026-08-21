/**
 * Rough token estimation using a chars / 4 heuristic.
 *
 * This lives in its own module so it can be swapped for a real tokenizer
 * (tiktoken, gpt-tokenizer) without touching any call site.
 *
 * Known limitation: the divisor is tuned for English. Thai text costs far more
 * tokens per character (close to one token per character on some models), so
 * estimates run low for Thai-heavy files. That is acceptable for now because
 * the number drives a warning, not billing.
 */
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function sumTokens(counts: readonly number[]): number {
  return counts.reduce((total, count) => total + count, 0);
}

export function formatTokenCount(tokens: number): string {
  return tokens.toLocaleString('en-US');
}
