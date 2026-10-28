import { z } from 'zod';
import { optional } from './helpers.js';

/** Production site and the local `pnpm dev:site`. Used when CORS_ORIGINS is unset. */
export const DEFAULT_CORS_ORIGINS = ['https://nvoke.run', 'http://localhost:3001'];

/** Process, database and the public URLs. */
export const core = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: optional,
  // Public URLs, for links we hand out: billing, claim emails, MCP metadata.
  SITE_URL: z.url().default('https://nvoke.run'),
  PUBLIC_API_URL: z.url().default('https://api.nvoke.run'),
  // The site calls /v1/desktop/authorize from the browser, so its origins need CORS.
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_CORS_ORIGINS)),
};
