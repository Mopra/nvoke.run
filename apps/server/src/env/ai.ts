import { z } from 'zod';
import { optional } from './helpers.js';

/** Claude through OpenRouter (src/ai). */
export const ai = {
  // Without the key, features that need it answer unavailable.
  OPENROUTER_API_KEY: optional,
  // Monthly Claude budget per account: this share of the plan's price, never below the floor.
  AI_MONTHLY_BUDGET_FLOOR_USD: z.coerce.number().min(0).default(1),
  AI_MONTHLY_BUDGET_PRICE_SHARE: z.coerce.number().min(0).max(1).default(0.25),
};
