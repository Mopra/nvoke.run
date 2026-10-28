import { z } from 'zod';
import { optional } from './helpers.js';

/** Web search: Brave and Serper (paid), Mwmbl (free), and the budgets. See .env.example. */
export const search = {
  BRAVE_SEARCH_API_KEY: optional,
  BRAVE_REQUESTS_PER_SECOND: z.coerce.number().positive().max(1_000).default(1),
  BRAVE_MONTHLY_BUDGET_USD: z.coerce.number().positive().optional(),
  BRAVE_COST_PER_1000_USD: z.coerce.number().positive().default(5),
  /** The primary paid web search: `brave` (default) or `serper` (leads/sources/paid-search.ts). */
  WEB_SEARCH_PROVIDER: z.enum(['brave', 'serper']).default('brave'),
  /** The paid web search asked when the primary fails, is paused or is over its budget. Unset means none. */
  WEB_SEARCH_FALLBACK: z
    .enum(['brave', 'serper', ''])
    .optional()
    .transform((v) => v || undefined),
  SERPER_API_KEY: optional,
  SERPER_MONTHLY_BUDGET_USD: z.coerce.number().positive().optional(),
  /** What 1,000 Serper credits cost on your plan. */
  SERPER_COST_PER_1000_USD: z.coerce.number().positive().default(1),
  /** The free web search (Mwmbl): `fallback` when Brave refuses us, `first` ahead of Brave, or `off`. */
  FREE_SEARCH: z.enum(['off', 'fallback', 'first']).default('fallback'),
  /** Milliseconds between two requests to the free web search. */
  FREE_SEARCH_INTERVAL_MS: z.coerce.number().int().min(1_000).default(3_000),
  /** Paid Brave requests one Describe your customer search may make (cache hits are free). */
  ICP_BRAVE_BUDGET: z.coerce.number().int().positive().default(120),
  /** Paid Brave requests an ongoing search's daily round may make. */
  ICP_DAILY_BRAVE_BUDGET: z.coerce.number().int().min(0).default(40),
  /** Paid Brave requests all ongoing searches' daily rounds together may make a day (UTC). */
  ONGOING_DAILY_BRAVE_BUDGET: z.coerce.number().int().min(0).default(250),
};
