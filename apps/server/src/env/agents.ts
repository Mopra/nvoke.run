import { z } from 'zod';
import { flag } from './helpers.js';

/** Agent sign-up and the claim email it sends. */
export const agents = {
  // POST /v1/agents/signup. Off answers 503 signup_unavailable.
  AGENT_SIGNUP_ENABLED: flag('true'),
  // Sender of the claim email to the human behind an agent sign-up, through Day3.
  CLAIM_EMAIL_FROM: z.string().min(3).default('nvoke <hello@nvoke.run>'),
};
