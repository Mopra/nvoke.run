import { z } from 'zod';

const list = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []));

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

/** Production site and the local `pnpm dev:site`. Used when CORS_ORIGINS is unset. */
export const DEFAULT_CORS_ORIGINS = ['https://nvoke.run', 'http://localhost:3001'];

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: optional,
  CLERK_SECRET_KEY: optional,
  CLERK_PUBLISHABLE_KEY: optional,
  CLERK_JWT_KEY: optional,
  CLERK_AUTHORIZED_PARTIES: list,
  // Signs Clerk's billing webhooks (POST /webhooks/clerk).
  CLERK_WEBHOOK_SIGNING_SECRET: optional,
  // The site calls /v1/desktop/authorize from the browser, so its origins need CORS.
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_CORS_ORIGINS)),

  // Lead pipeline. See .env.example for what each one does.
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(16),
  BRAVE_SEARCH_API_KEY: optional,
  BRAVE_REQUESTS_PER_SECOND: z.coerce.number().positive().max(1_000).default(1),
  BRAVE_MONTHLY_BUDGET_USD: z.coerce.number().positive().optional(),
  BRAVE_COST_PER_1000_USD: z.coerce.number().positive().default(5),
  // Operator alerts by email through Day3.
  DAY3_API_KEY: optional,
  ALERT_EMAIL_TO: list,
  ALERT_EMAIL_FROM: optional,
  PRODUCT_HUNT_TOKEN: optional,
  NOMINATIM_URL: z.url().default('https://nominatim.openstreetmap.org'),
  // Comma separated; later entries are fallbacks when one is busy (429, 5xx).
  OVERPASS_URL: z
    .string()
    .default('https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.url()).min(1)),
  SMTP_HELO_NAME: z.string().min(1).default('nvoke.run'),
  SMTP_PROBE_FROM: z.email().default('probe@nvoke.run'),
  SMTP_PROBE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
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
