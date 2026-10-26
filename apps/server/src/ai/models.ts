// The Claude models nvoke uses (OpenRouter ids) and what they cost. OpenRouter
// reports the charge per call; these prices are the fallback when it does not.
// Prices: https://openrouter.ai/anthropic

/** bulk: many small calls (openers). quality: few calls where the answer matters (site profile). */
export const MODELS = {
  bulk: 'anthropic/claude-haiku-5.5',
  quality: 'anthropic/claude-sonnet-5.5',
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
  'anthropic/claude-haiku-5.5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'anthropic/claude-sonnet-5.5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  // Anthropic's own ids, for accounts on their own key (anthropic.ts).
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
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
