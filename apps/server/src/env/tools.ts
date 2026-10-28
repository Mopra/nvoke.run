import { z } from 'zod';
import { optional } from './helpers.js';

/** The free tools on the site. */
export const tools = {
  // The free email verifier's share of the SMTP probes, probed from the API
  // and taken off the worker's budget. 0 keeps the free verifier on DNS only.
  TOOLS_SMTP_PROBES_PER_MINUTE: z.coerce.number().int().min(0).default(1),
  // Cloudflare Turnstile for the free tools. Unset means rate limits only.
  TURNSTILE_SECRET_KEY: optional,
};
