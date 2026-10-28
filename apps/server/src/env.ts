import { z } from 'zod';
import { agents } from './env/agents.js';
import { ai } from './env/ai.js';
import { alerts } from './env/alerts.js';
import { clerk } from './env/clerk.js';
import { core } from './env/core.js';
import { microsoftMail } from './env/microsoft-mail.js';
import { pipeline } from './env/pipeline.js';
import { search } from './env/search.js';
import { sending } from './env/sending.js';
import { tools } from './env/tools.js';
import { verify } from './env/verify.js';

export { DEFAULT_CORS_ORIGINS } from './env/core.js';

// One file per area under env/, so parallel work does not collide here. A new
// area adds its file and one line below. env.test.ts pins every key.
export const EnvSchema = z.object({
  ...core,
  ...clerk,
  ...agents,
  ...pipeline,
  ...search,
  ...alerts,
  ...verify,
  ...tools,
  ...ai,
  ...sending,
  ...microsoftMail,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parses process.env once. Throws with every problem listed if it is invalid. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`invalid environment:\n${z.prettifyError(result.error)}`);
  }
  if (source === process.env) cached = result.data;
  return result.data;
}
