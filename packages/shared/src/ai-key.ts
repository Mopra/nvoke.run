import { z } from 'zod';

// Bring your own key (docs/SPEC.md, "Your own Claude key"): an account can
// run its Claude calls on its own Anthropic API key and pick the model for
// each tier. The key is sealed on the server and never sent back.

/** The Anthropic models offered for each tier, cheapest first. */
export const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
] as const;

/** What nvoke runs on its own key: bulk for many small calls, quality for the few that matter. */
export const DEFAULT_AI_MODELS = { bulkModel: 'claude-haiku-5-5', qualityModel: 'claude-sonnet-5-5' } as const;

const modelId = z
  .string()
  .trim()
  .regex(/^claude-[a-z0-9.-]+$/, 'An Anthropic model id, like claude-sonnet-5-5')
  .max(80);

export const AiKey = z.object({
  provider: z.literal('anthropic'),
  /** The last 4 characters of the key, to tell keys apart. */
  last4: z.string(),
  /** Model for the many small calls: fit scoring, people, openers. */
  bulkModel: z.string(),
  /** Model for the few calls where the answer matters: search plans, site profile. */
  qualityModel: z.string(),
  updatedAt: z.string(),
});
export type AiKey = z.infer<typeof AiKey>;

export const SaveAiKeyRequest = z.object({
  provider: z.literal('anthropic').default('anthropic'),
  /** Left out to change only the models of the stored key. */
  apiKey: z.string().trim().min(20).max(400).optional(),
  bulkModel: modelId.default(DEFAULT_AI_MODELS.bulkModel),
  qualityModel: modelId.default(DEFAULT_AI_MODELS.qualityModel),
});
export type SaveAiKeyRequest = z.input<typeof SaveAiKeyRequest>;
