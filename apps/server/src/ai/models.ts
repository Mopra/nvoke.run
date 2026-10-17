// The Claude models nvoke uses and what they cost.
// Prices: https://platform.claude.com/docs/en/about-claude/pricing

/** bulk: many small calls (openers). quality: few calls where the answer matters (site profile). */
export const MODELS = {
  bulk: 'claude-haiku-5-5',
  quality: 'claude-sonnet-5-5',
} as const;

export type ModelTier = keyof typeof MODELS;

/** USD per million tokens. */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICES: Record<string, Price> = {
  // Prompts up to 100K tokens; nvoke never sends more to Haiku.
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

// An unknown model is priced as Opus, so the cost guard errs on the safe side.
const UNKNOWN: Price = { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 };

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function costUsd(model: string, t: TokenCounts): number {
  const p = PRICES[model] ?? UNKNOWN;
  return (
    (t.inputTokens * p.input + t.outputTokens * p.output + t.cacheReadTokens * p.cacheRead + t.cacheWriteTokens * p.cacheWrite) /
    1_000_000
  );
}
